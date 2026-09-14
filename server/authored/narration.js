import fs from "node:fs/promises";
import path from "node:path";
import { run } from "../process.js";

// Each beat is spoken independently, so visual boundaries follow measured audio.
// Caption words within a beat remain estimated, not force-aligned.
export async function narrateAuthoredScene({
  scene,
  output,
  settings,
  synthesize,
  cacheDir,
}) {
  const measure = async (file) => {
    const { stdout } = await run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    const seconds = Number(stdout.trim());
    if (!Number.isFinite(seconds) || seconds <= 0)
      throw new Error("Empty narration");
    return seconds;
  };
  if (!scene.beats?.length) {
    await synthesize(scene.narration, output, settings, { cacheDir });
    const spoken = await measure(output);
    const words = scene.narration.split(/\s+/),
      cues = [];
    for (let word = 0; word < words.length; word += 11) {
      const end = Math.min(word + 11, words.length);
      cues.push({
        start: (spoken * word) / words.length,
        duration: (spoken * (end - word)) / words.length,
        narration: words.slice(word, end).join(" "),
      });
    }
    return {
      duration: Math.ceil(Math.max(scene.seconds, spoken + 0.6) * 30) / 30,
      cues,
      captionTiming: "estimated from narration duration",
    };
  }
  const dir = output + ".beats";
  await fs.mkdir(dir, { recursive: true });
  let frames = 0;
  const beats = [],
    cues = [];
  for (let i = 0; i < scene.beats.length; i++) {
    const beat = scene.beats[i],
      raw = path.join(dir, `raw-${i}.wav`);
    await synthesize(beat.narration, raw, settings, { cacheDir });
    const spoken = await measure(raw),
      count = Math.ceil((spoken + beat.pauseAfter) * 30 - 1e-8);
    const start = frames / 30,
      duration = count / 30;
    beats.push({ ...beat, start, duration, spoken });
    cues.push({ start, duration: spoken, narration: beat.narration });
    await run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      raw,
      "-af",
      "apad",
      "-t",
      String(duration),
      "-ar",
      "24000",
      "-ac",
      "1",
      path.join(dir, `beat-${i}.wav`),
    ]);
    frames += count;
  }
  const list = path.join(dir, "concat.txt");
  await fs.writeFile(
    list,
    beats.map((_, i) => `file 'beat-${i}.wav'`).join("\n"),
  );
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "concat",
    "-safe",
    "1",
    "-i",
    list,
    "-c",
    "copy",
    output,
  ]);
  const actual = await measure(output);
  if (Math.abs(actual - frames / 30) > 0.02)
    throw new Error("Narration beat timing did not match the combined audio");
  return {
    beats,
    cues,
    duration: Math.ceil(Math.max(scene.seconds, frames / 30) * 30) / 30,
    captionTiming: "measured narration beats; words estimated within each beat",
  };
}
