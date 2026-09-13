import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import {
  globePoint,
  globeSvg,
  countryPoint,
  countryCatalog,
} from "../server/geography/globe.js";
import {
  prepareAnimation,
  animationSvg,
  beatTimeline,
  frameState,
  renderAnimation,
} from "../server/animation/render.js";
import { validateAnimation } from "../server/animation/schema.js";
import { pcmWave } from "../server/speech.js";
import { run } from "../server/process.js";
const base = () => ({
  kind: "animation",
  background: "#0C1721",
  beats: [{ id: "a", narration: "A rotating globe.", seconds: 1 }],
  nodes: [
    {
      id: "earth",
      type: "globe",
      x: 40,
      y: 80,
      width: 560,
      height: 560,
      longitude: -65,
      latitude: 8,
      geography: {
        highlights: [{ country: "VEN", color: "#FFCC44" }],
        markers: true,
      },
    },
  ],
  tracks: [],
});
test("globe projects known centers, hides the far hemisphere and handles the dateline", () => {
  assert.deepEqual(
    globePoint([0, 0], { longitude: 0, latitude: 0 }),
    [300, 300],
  );
  assert.equal(globePoint([180, 0], { longitude: 0, latitude: 0 }), null);
  const a = globePoint([-179, 0], { longitude: 179, latitude: 0 });
  assert.ok(a && Math.abs(a[0] - 300) < 12);
  assert.ok(countryPoint("VEN", { longitude: -65, latitude: 8 }));
  assert.equal(countryPoint("VEN", { longitude: 110, latitude: -8 }), null);
  assert.ok(countryCatalog.some((c) => c.id === "KWT"));
});
test("country highlights occupy visible land, never the entire globe or the hidden hemisphere", async () => {
  const render = async (longitude) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">${globeSvg({ longitude, latitude: 8, land: "#202020", ocean: "#000000", highlights: [{ country: "VEN", color: "#FF0000" }] })}</svg>`;
    const { data } = await sharp(Buffer.from(svg))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let red = 0;
    for (let i = 0; i < data.length; i += 3)
      if (data[i] > 100 && data[i + 1] < 50 && data[i + 2] < 50) red++;
    return red;
  };
  const front = await render(-65);
  assert.ok(front > 300 && front < 12000, String(front));
  assert.equal(await render(115), 0);
});
test("globe tracks use narration timing and reject invalid cameras and country IDs", async () => {
  const a = base();
  a.tracks = [
    {
      node: "earth",
      property: "longitude",
      beat: "a",
      start: 0,
      end: 1,
      from: 170,
      to: 190,
      easing: "smooth",
    },
  ];
  const valid = validateAnimation(a);
  const timeline = beatTimeline(valid, [4]);
  assert.equal(frameState(valid, timeline, 2).get("earth").longitude, 180);
  const p = await prepareAnimation(a);
  assert.doesNotMatch(animationSvg(p, timeline, 2), /NaN|Infinity/);
  a.nodes[0].geography.highlights[0].country = "XYZ";
  assert.throws(() => validateAnimation(a), /Unknown geographic/);
  a.nodes[0].geography.highlights[0].country = "VEN";
  a.tracks[0].property = "latitude";
  assert.throws(() => validateAnimation(a), /Latitude/);
});
test("globe renders a real narrated MP4 through the shared animation renderer", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "globe-render-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const content = base();
  content.tracks = [
    {
      node: "earth",
      property: "longitude",
      beat: "a",
      start: 0,
      end: 1,
      from: -80,
      to: -60,
      easing: "smooth",
    },
  ];
  const r = await renderAnimation({
    scene: { content },
    dir,
    settings: {},
    synthesize: async (_, file) =>
      fs.writeFile(file, pcmWave(new Float32Array(12000))),
  });
  const probe = JSON.parse(
    (
      await run("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        r.video,
      ])
    ).stdout,
  );
  assert.equal(probe.streams.find((s) => s.codec_type === "video").width, 1280);
  assert.ok(probe.streams.some((s) => s.codec_type === "audio"));
  assert.ok(Math.abs(Number(probe.format.duration) - 1) < 0.1);
  await run("ffmpeg", ["-v", "error", "-i", r.video, "-f", "null", "-"]);
});
