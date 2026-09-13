import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { sceneSchema } from "../server/schema.js";
import { validateAnimation } from "../server/animation/schema.js";
import {
  frameState,
  beatTimeline,
  prepareAnimation,
  animationSvg,
  inspectAnimation,
} from "../server/animation/render.js";
import { Library } from "../server/store.js";
import { pcmWave } from "../server/speech.js";
import { available } from "../server/process.js";
const fixture = JSON.parse(
  await fs.readFile(
    new URL("./fixtures/animation-motion.json", import.meta.url),
  ),
);
test("constant acceleration, attached objects, and narration-scaled timing share one timeline", () => {
  const a = validateAnimation(fixture.content),
    timeline = beatTimeline(a, [4, 8, 4]);
  const track = a.tracks.find((t) => t.node === "cart");
  const midpoint =
    timeline[1].start + (timeline[1].duration * (track.start + track.end)) / 2;
  const states = frameState(a, timeline, midpoint);
  assert.ok(Math.abs(states.get("cart").x - 240) < 1e-8); // 90 + 600 * (1/2)^2
  assert.equal(states.get("body").parent, "cart");
  assert.equal(frameState(a, timeline, 16).get("cart").x, 690);
  assert.equal(frameState(a, timeline, 0).get("slope").draw, 0);
  const zero = structuredClone(a);
  zero.tracks.find((t) => t.property === "scale").from = 0;
  assert.equal(
    frameState(validateAnimation(zero), timeline, 0).get("arrow").scale,
    0,
  );
});
test("invalid tracks, parent cycles, markup and mismatched narration are rejected", () => {
  let a = structuredClone(fixture.content);
  a.nodes.find((n) => n.id === "cart").parent = "cart";
  assert.throws(() => validateAnimation(a), /cycles/);
  a = structuredClone(fixture.content);
  a.tracks.push(a.tracks[0]);
  assert.throws(() => validateAnimation(a), /overlap/);
  a = structuredClone(fixture.content);
  a.tracks[0].node = "missing";
  assert.throws(() => validateAnimation(a), /target/);
  a = structuredClone(fixture.content);
  a.nodes.find((n) => n.type === "path").path =
    '<image href="http://example.com"/>';
  assert.throws(() => validateAnimation(a));
  const scene = structuredClone(fixture);
  scene.narration = "Different narration here";
  assert.equal(sceneSchema.safeParse(scene).success, false);
});
test("text layout measures overflow", async () => {
  const a = structuredClone(fixture.content);
  a.nodes.push({
    id: "overflow",
    type: "text",
    x: 1200,
    y: 690,
    text: "Long label beyond canvas",
    width: 200,
    fontSize: 40,
  });
  const prepared = await prepareAnimation(a);
  assert.ok(
    inspectAnimation(prepared, beatTimeline(a)).warnings.some(
      (w) => w.node === "overflow",
    ),
  );
});
test("rendered path reveal grows spatially, and code indentation survives text layout", async () => {
  const sharp = (await import("sharp")).default;
  const a = {
    kind: "animation",
    background: "#FFFFFF",
    beats: [{ id: "b", narration: "Draw one line", seconds: 1 }],
    nodes: [
      {
        id: "line",
        type: "path",
        path: "M 100 100 L 1100 100",
        stroke: "#FF0000",
        strokeWidth: 10,
      },
    ],
    tracks: [
      {
        node: "line",
        property: "draw",
        beat: "b",
        start: 0,
        end: 1,
        from: 0,
        to: 1,
        easing: "linear",
      },
    ],
  };
  const prepared = await prepareAnimation(a);
  const counts = [];
  for (const time of [0, 0.5, 1]) {
    const { data, info } = await sharp(
      Buffer.from(animationSvg(prepared, beatTimeline(a), time)),
    )
      .raw()
      .toBuffer({ resolveWithObject: true });
    let red = 0;
    for (let i = 0; i < data.length; i += info.channels)
      if (data[i] > 200 && data[i + 1] < 100) red++;
    counts.push(red);
  }
  assert.equal(counts[0], 0);
  assert.ok(counts[1] > 4000 && counts[1] < 6000);
  assert.ok(counts[2] > 9500);
  const code = JSON.parse(
    await fs.readFile(
      new URL("./fixtures/animation-code.json", import.meta.url),
    ),
  );
  const layout = await prepareAnimation(code.content);
  assert.equal(layout.textLayout.code.lines[1], "    if n == 1:");
  assert.match(
    animationSvg(layout, beatTimeline(code.content), 0),
    /xml:space="preserve"/,
  );
});

test("mixed legacy and animated chapters concatenate without timebase drift", async (t) => {
  const { run } = await import("../server/process.js");
  if (!(await available("ffmpeg"))) return t.skip("FFmpeg required");
  const { renderLesson } = await import("../server/render.js");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mixed-animation-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const lib = await new Library(root).init();
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await fs.mkdir(lib.lessonDir(id));
  const animated = structuredClone(fixture);
  animated.content.beats.forEach((b) => (b.seconds = 0.5));
  const legacy = JSON.parse(
    await fs.readFile(new URL("../examples/motion.json", import.meta.url)),
  ).scenes[1];
  const result = await renderLesson(
    lib,
    {
      id,
      title: "Mixed rendering",
      summary: "Timing",
      scenes: [legacy, animated, legacy],
      style: "auto",
    },
    await lib.settings(),
    async () => {},
    {
      synthesize: async (_, file) =>
        fs.writeFile(file, pcmWave(new Float32Array(18000))),
    },
  );
  const info = JSON.parse(
    (
      await run("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        path.join(root, "videos", result.video),
      ])
    ).stdout,
  );
  assert.ok(
    Math.abs(Number(info.format.duration) - result.duration) < 0.15,
    JSON.stringify(info),
  );
  assert.equal(result.scenes[1].start, 0.75);
  await run("ffmpeg", [
    "-v",
    "error",
    "-i",
    path.join(root, "videos", result.video),
    "-f",
    "null",
    "-",
  ]);
});
