import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { renderBlender } from "../server/blender/render.js";
import { probeVideo } from "../server/authored/render.js";
import { Library } from "../server/store.js";
import { pcmWave } from "../server/speech.js";

test("Blender adapter renders shared media, reuses declared frames and retains diagnostics", async (t) => {
  const blender = process.env.LEARNVID_BLENDER;
  if (!blender)
    return t.skip(
      "Set LEARNVID_BLENDER for the optional real Blender integration test",
    );
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blender-lesson-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  await fs.mkdir(source);
  await fs.writeFile(
    path.join(source, "lesson.json"),
    JSON.stringify({
      files: ["models/shape.bin"],
      title: "3D integration",
      summary: "Generic renderer validation",
      learningObjective: "See a changing 3D object",
      assumedKnowledge: [],
      tags: [],
      sources: [{ title: "Reference", url: "https://example.com/source" }],
      check: { question: "Does it move?", answer: "Yes" },
      scenes: [
        {
          title: "First",
          narration: "The object changes position",
          seconds: 1,
        },
        {
          title: "Second",
          narration: "The second scene uses the same host",
          seconds: 1,
        },
      ],
    }),
  );
  await fs.writeFile(
    path.join(source, "scene.py"),
    `import bpy\nfrom mathutils import Vector\ndef build_scene(i,ctx):\n s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.eevee.taa_render_samples=1\n bpy.ops.mesh.primitive_cube_add();obj=bpy.context.object\n mat=bpy.data.materials.new('red');mat.use_nodes=True;p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(1,0,0,1);p.inputs['Emission Strength'].default_value=1;obj.data.materials.append(mat)\n bpy.ops.object.camera_add(location=(0,-10,3));s.camera=bpy.context.object;s.camera.rotation_euler=(-s.camera.location).to_track_quat('-Z','Y').to_euler()\n def key(t):return int(round(t*ctx['fps']))%2\n def update(t):obj.location.x=key(t)*2-1\n return {'update':update,'frame_key':key}\n`,
  );
  await fs.mkdir(path.join(source, "models"));
  await fs.writeFile(
    path.join(source, "models", "shape.bin"),
    Buffer.from([1, 2, 3]),
  );
  const lib = await new Library(path.join(root, "library")).init();
  const result = await renderBlender(lib, source, {
    blender,
    progress: () => {},
    synthesize: async (_, file) =>
      fs.writeFile(file, pcmWave(new Float32Array(2400))),
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(
    await fs.readFile(
      path.join(
        lib.lessonDir(result.id),
        "blender",
        "source",
        "models",
        "shape.bin",
      ),
    ),
    Buffer.from([1, 2, 3]),
  );
  assert.equal(result.renderer, "blender");
  assert.ok(result.rendererInfo.version.startsWith("4."));
  const dir = path.join(lib.lessonDir(result.id), "blender");
  const report = JSON.parse(
    await fs.readFile(path.join(dir, "render-report.json")),
  );
  assert.equal(report.scenes.length, 2);
  for (const s of report.scenes) {
    assert.equal(s.rendered, 2);
    assert.equal(s.reused, 28);
    assert.equal(s.frames, 30);
  }
  const info = await probeVideo(path.join(lib.root, "videos", result.video));
  assert.ok(Math.abs(Number(info.format.duration) - 2) < 0.1);
  assert.ok(info.streams.some((s) => s.codec_type === "audio"));
  assert.match(
    await fs.readFile(
      path.join(lib.lessonDir(result.id), "transcript.md"),
      "utf8",
    ),
    /example.com\/source/,
  );
  assert.equal(result.scenes[1].start, 1);
  assert.ok((await fs.stat(path.join(dir, "source", "scene.py"))).size > 0);
  assert.notDeepEqual(
    await fs.readFile(path.join(dir, "scene-0-0.05.png")),
    await fs.readFile(path.join(dir, "scene-0-0.5.png")),
  );
});
