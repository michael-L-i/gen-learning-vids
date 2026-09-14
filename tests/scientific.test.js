import sharp from "sharp";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { run, available } from "../server/process.js";
import {
  renderScientific,
  scientificManifest,
  probeVideo,
} from "../server/scientific/render.js";
import { Library } from "../server/store.js";
import { pcmWave } from "../server/speech.js";

test("incline motion preserves elastic impact energy, constant periods and increasing spacing", async (t) => {
  if (!(await available("python3")))
    return t.skip("Python 3 required for optional scientific model checks");
  await run("python3", [
    "-c",
    `
import sys, math
sys.path.insert(0, sys.argv[1])
from kinematics import InclineBounces
for angle in [15,30,55]:
 m=InclineBounces(math.radians(angle),1.25)
 assert abs(m.period-1)<1e-12
 for k in range(1,4):
  left,right=m.state(k*m.period-1e-8),m.state(k*m.period)
  assert abs(left['vs']-right['vs'])<1e-6
  assert abs(left['vn']+right['vn'])<1e-6
  assert abs(left['vx']**2+left['vy']**2-right['vx']**2-right['vy']**2)<1e-4
 for t in [.13,.49,.78,1.3,2.7]:
  s=m.state(t)
  assert abs(.5*(s['vx']**2+s['vy']**2)+m.gravity*s['y']-m.gravity*m.height)<1e-9
 bigger=InclineBounces(m.angle,2*m.height)
 assert abs(bigger.period/m.period-math.sqrt(2))<1e-12
 assert abs(bigger.spacing(3)/m.spacing(3)-2)<1e-12
m=InclineBounces(math.pi/6,1.25)
assert all(abs(m.spacing(k)-5*k)<1e-9 for k in [1,2,3])
`,
    fileURLToPath(new URL("../server/scientific/", import.meta.url)),
  ]);
});

test("scientific route renders real media, retains source and publishes timed lesson artifacts", async (t) => {
  const python = process.env.LEARNVID_SCIENTIFIC_PYTHON;
  if (!python)
    return t.skip(
      "Set LEARNVID_SCIENTIFIC_PYTHON to the optional scientific Python environment",
    );
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "scientific-render-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = path.join(dir, "source");
  await fs.mkdir(source);
  const manifest = {
    title: "Scientific rendering test",
    summary: "Check the shared timing contract",
    learningObjective: "Follow a moving point",
    assumedKnowledge: [],
    tags: ["Physics"],
    sources: [],
    assets: [
      {
        id: "sample",
        url: "https://example.com/image.png",
        sourceUrl: "https://example.com/source",
        title: "Sample",
        creator: "Test",
        license: "CC0",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        alt: "Red rectangle",
      },
    ],
    check: { question: "Does x increase?", answer: "Yes" },
    scenes: [
      {
        title: "First",
        narration: Array.from({ length: 22 }, (_, i) => `word${i}`).join(" "),
        seconds: 1,
      },
      { title: "Second", narration: "Second narration", seconds: 1 },
    ],
  };
  assert.equal(
    scientificManifest.safeParse({ ...manifest, scenes: [] }).success,
    false,
  );
  await fs.writeFile(
    path.join(source, "lesson.json"),
    JSON.stringify(manifest),
  );
  await fs.writeFile(
    path.join(source, "scene.py"),
    `import matplotlib.pyplot as plt\ndef build_scene(index, ctx):\n fig,ax=plt.subplots()\n from media import place_image\n photo,artist=place_image(fig,ctx,"sample",[.1,.7,.2,.2])\n assert ctx["assets"]["sample"]["license"] == "CC0"\n ax.set_xlim(0,1); ax.set_ylim(0,1)\n dot,=ax.plot([],[], 'o')\n def update(t): dot.set_data([t/ctx['duration']],[.5])\n return fig, update\n`,
  );
  const library = await new Library(path.join(dir, "library")).init();
  const result = await renderScientific(library, source, {
    python,
    progress: () => {},
    fetchImage: async () => ({
      bytes: await sharp({
        create: { width: 80, height: 40, channels: 3, background: "red" },
      })
        .png()
        .toBuffer(),
      url: "https://example.com/image.png",
    }),
    synthesize: async (_, file) =>
      fs.writeFile(file, pcmWave(new Float32Array(12000))),
  });
  assert.equal(result.status, "ready");
  assert.equal(result.imageAssets[0].width, 80);
  assert.match(
    await fs.readFile(
      path.join(library.lessonDir(result.id), "image-credits.md"),
      "utf8",
    ),
    /CC0/,
  );
  assert.equal(result.scenes[1].start, result.scenes[0].duration);
  assert.equal((await library.lesson(result.id)).renderer, "matplotlib");
  const media = await probeVideo(
    path.join(library.root, "videos", result.video),
  );
  assert.ok(Math.abs(Number(media.format.duration) - result.duration) < 0.15);
  assert.ok(media.streams.some((s) => s.codec_type === "audio"));
  const vtt = await fs.readFile(
    path.join(library.lessonDir(result.id), "captions.vtt"),
    "utf8",
  );
  assert.match(vtt, /00:00:00.000 --> 00:00:00.250/);
  const cues = result.scenes[0].cues;
  assert.equal(cues.length, 2);
  assert.equal(
    cues.map((c) => c.narration).join(" "),
    manifest.scenes[0].narration,
  );
  assert.equal(cues[1].start, cues[0].duration);
  assert.equal(cues[1].start + cues[1].duration, 0.5);
  assert.match(vtt, /Second narration/);
  assert.equal(
    await fs.readFile(
      path.join(library.lessonDir(result.id), "scientific/source/scene.py"),
      "utf8",
    ),
    await fs.readFile(path.join(source, "scene.py"), "utf8"),
  );
});
