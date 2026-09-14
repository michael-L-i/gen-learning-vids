import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import sharp from "sharp";
import {
  lessonPlanSchema,
  sceneSchema,
  planJsonSchema,
} from "../server/schema.js";
import { sceneSvg } from "../server/render.js";
import { frameCount, resolvePalette } from "../server/visuals.js";
const example = lessonPlanSchema.parse(
  JSON.parse(
    await fs.readFile(
      new URL("../examples/motion.json", import.meta.url),
      "utf8",
    ),
  ),
);
test("subject visuals rasterize, reveal content progressively, and escape code", async () => {
  for (const [i, scene] of example.scenes.entries()) {
    const first = sceneSvg(scene, i, 4, "auto", 0),
      last = sceneSvg(scene, i, 4, "auto");
    const { info } = await sharp(Buffer.from(last))
      .png()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 1280);
    assert.equal(info.height, 720);
    if (frameCount(scene) > 1) assert.notEqual(first, last);
  }
  const c = structuredClone(example.scenes[3]);
  c.content.code = 'if x < 2: print("<script>")';
  c.content.highlightLines = [1];
  assert.match(sceneSvg(c, 0, 1), /&lt;script&gt;/);
  assert.notEqual(
    resolvePalette("auto", example.scenes[0]).bg,
    resolvePalette("auto", example.scenes[3]).bg,
  );
});
test("invalid diagrams, oversized code, mismatched content, and unsafe TeX fail explicitly", () => {
  const d = structuredClone(example.scenes[0]);
  d.content.edges[0].to = "missing";
  assert.equal(sceneSchema.safeParse(d).success, false);
  const c = structuredClone(example.scenes[3]);
  c.content.code = "x\n".repeat(15);
  assert.equal(sceneSchema.safeParse(c).success, false);
  const p = structuredClone(example.scenes[2]);
  p.visual = "equation";
  assert.equal(sceneSchema.safeParse(p).success, false);
  const e = structuredClone(example.scenes[1]);
  e.content.steps[0].tex = "\\href{https://example.com}{x}";
  assert.throws(() => sceneSvg(e, 0, 1), /mathematical TeX/);
});
test("provider JSON schema requires all fields and legacy plans remain valid", async () => {
  function visit(node) {
    if (!node || typeof node !== "object") return;
    assert.notEqual(node.format, "uri");
    if (node.type === "object") {
      assert.equal(node.additionalProperties, false);
      assert.deepEqual(node.required, Object.keys(node.properties));
    }
    for (const value of Object.values(node))
      if (typeof value === "object")
        Array.isArray(value) ? value.forEach(visit) : visit(value);
  }
  visit(planJsonSchema);
  const old = JSON.parse(
    await fs.readFile(
      new URL("../examples/recursion.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(lessonPlanSchema.parse(old).scenes[0].content, null);
});

test("progressive scenes preserve the entire narration and transcript timing", async (t) => {
  const { available, run } = await import("../server/process.js");
  if (!(await available("ffmpeg")) || !(await available("ffprobe")))
    return t.skip("FFmpeg not installed");
  const os = await import("node:os"),
    path = await import("node:path");
  const { Library } = await import("../server/store.js");
  const { createLesson } = await import("../server/engine.js");
  const { renderLesson } = await import("../server/render.js");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "visual-media-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const lib = await new Library(root).init();
  const lesson = await createLesson(
    lib,
    { topic: "Timing test" },
    { ...example, scenes: [example.scenes[1], example.scenes[3]] },
  );
  const output = await renderLesson(
    lib,
    lesson,
    await lib.settings(),
    async () => {},
    {
      synthesize: async (_, file) => {
        await run("ffmpeg", [
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "anullsrc=r=24000:cl=mono",
          "-t",
          "2.4",
          file,
        ]);
      },
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
        path.join(root, "videos", output.video),
      ])
    ).stdout,
  );
  assert.ok(
    Math.abs(Number(info.format.duration) - 4.8) < 0.15,
    `Video duration: ${info.format.duration}`,
  );
  assert.equal(output.scenes[1].start, 2.4);
  assert.match(
    await fs.readFile(
      path.join(lib.lessonDir(lesson.id), "transcript.md"),
      "utf8",
    ),
    /0:02/,
  );
});
