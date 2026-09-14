// Run from any directory: node verify.mjs /path/to/example-library
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const library = process.argv[2];
if (!library)
  throw new Error("Usage: node examples/first-scene/verify.mjs LIBRARY");
const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const result = await readJson(path.join(library, "render.json"));
assert.match(result.id, /^[a-f0-9-]{36}$/);
const folder = path.join(library, "lessons", result.id);
const lesson = await readJson(path.join(folder, "lesson.json"));
const expected = await readJson(new URL("lesson.json", import.meta.url));
assert.equal(lesson.status, "ready");
assert.equal(lesson.title, expected.title);
assert.equal(lesson.scenes.length, 1);
assert.equal(lesson.video, `${lesson.id}.mp4`);
const video = path.resolve(library, "videos", lesson.video);
const probe = JSON.parse(
  execFileSync(
    "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", video],
    { encoding: "utf8" },
  ),
);
const visual = probe.streams.find((s) => s.codec_type === "video");
assert.deepEqual(
  [visual.codec_name, visual.width, visual.height, visual.avg_frame_rate],
  ["h264", 1280, 720, "30/1"],
);
assert.ok(
  probe.streams.some((s) => s.codec_type === "audio" && s.codec_name === "aac"),
);
assert.ok(Math.abs(Number(probe.format.duration) - lesson.duration) < 0.12);
execFileSync(
  "ffmpeg",
  ["-v", "error", "-xerror", "-i", video, "-f", "null", "-"],
  {
    stdio: ["ignore", "ignore", "pipe"],
  },
);

const scene = lesson.scenes[0];
assert.equal(scene.narration, expected.scenes[0].narration);
assert.equal(scene.start, 0);
assert.ok(Math.abs(scene.duration - lesson.duration) < 1e-6);
assert.ok(
  (await fs.readFile(path.join(folder, "transcript.md"), "utf8")).includes(
    scene.narration,
  ),
);
assert.deepEqual(
  scene.beats.map((b) => b.id),
  expected.scenes[0].beats.map((b) => b.id),
);
assert.equal(scene.beats.map((b) => b.narration).join(" "), scene.narration);
let end = 0;
for (const beat of scene.beats) {
  assert.ok(Math.abs(beat.start - end) < 1e-6, "Beats must be contiguous");
  assert.ok(beat.spoken > 0 && beat.spoken <= beat.duration);
  assert.ok(beat.duration + 1e-6 >= beat.spoken + beat.pauseAfter);
  end += beat.duration;
}
assert.ok(Math.abs(end - scene.duration) < 1e-6);

const seconds = (stamp) => {
  const [h, m, s] = stamp.split(":").map(Number);
  return h * 3600 + m * 60 + s;
};
const cues = (await fs.readFile(path.join(folder, "captions.vtt"), "utf8"))
  .trim()
  .split(/\r?\n\r?\n/)
  .slice(1);
let previous = 0;
const text = [];
for (const cue of cues) {
  const [timing, ...lines] = cue.split(/\r?\n/);
  const [start, stop] = timing.split(" --> ").map(seconds);
  assert.ok(start >= previous - 0.002 && stop > start);
  assert.ok(
    scene.beats.some(
      (b) => start >= b.start - 0.002 && stop <= b.start + b.spoken + 0.002,
    ),
    "Captions must stay inside speech, not processing holds",
  );
  previous = stop;
  text.push(...lines);
}
// This example uses plain narration with no markup or XML-reserved characters.
assert.equal(text.join(" "), scene.narration);
await fs.access(path.join(folder, "browser", "source", "scene.js"));
console.log(
  JSON.stringify(
    {
      status: "passed",
      video,
      seconds: lesson.duration,
      checks:
        "H.264/AAC, 1280×720 at 30fps, full decode, exact transcript, contiguous beats, captions within speech",
      previews: path.resolve(folder, "browser"),
      note: "Also inspect the video visually and listen. Caption words remain approximately timed within each beat.",
    },
    null,
    2,
  ),
);
