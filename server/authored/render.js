import {
  teachingSchema,
  reviewSchema,
  narrationBeatSchema,
  validateNarrationBeats,
} from "../teaching.js";
import { assetsSchema } from "../asset-schema.js";
import { prepareAssets, assetCredits } from "../assets.js";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { run } from "../process.js";
import { speak } from "../speech.js";
import { atomicWrite, writeJson } from "../store.js";
import { captions, clock } from "../render.js";
import { narrateAuthoredScene } from "./narration.js";

export const authoredManifest = z.object({
  teaching: teachingSchema.nullable().default(null),
  review: reviewSchema.nullable().default(null),
  files: z.array(z.string().min(1).max(1000)).max(100).default([]),
  assets: assetsSchema,
  brief: z.string().max(10000).default(""),
  title: z.string().min(1).max(100),
  summary: z.string().min(1).max(600),
  learningObjective: z.string().min(1).max(500),
  assumedKnowledge: z.array(z.string().max(200)).max(8),
  tags: z.array(z.string().max(30)).max(6),
  sources: z
    .array(z.object({ title: z.string().max(200), url: z.string().url() }))
    .max(12),
  check: z.object({
    question: z.string().max(500),
    answer: z.string().max(1200),
  }),
  scenes: z
    .array(
      z
        .object({
          title: z.string().min(1).max(100),
          narration: z.string().min(1).max(1800),
          takeaway: z.string().max(250).optional(),
          seconds: z.number().min(1).max(120),
          beats: z.array(narrationBeatSchema).min(1).max(16).optional(),
        })
        .superRefine(validateNarrationBeats),
    )
    .min(1)
    .max(20),
});

export async function probeVideo(file) {
  return JSON.parse(
    (
      await run("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate",
        "-of",
        "json",
        file,
      ])
    ).stdout,
  );
}

// Explicit CLI only: authored scenes are trusted local code, never web API JSON.
export async function renderAuthored(
  library,
  sourceDir,
  { adapter, synthesize = speak, progress = console.log, fetchImage } = {},
) {
  if (!adapter) throw new Error("An authored renderer adapter is required.");
  const source = path.resolve(sourceDir);
  const manifest = authoredManifest.parse(
    JSON.parse(await fs.readFile(path.join(source, "lesson.json"), "utf8")),
  );
  const entrypoint = adapter.entrypoint || "scene.py";
  await fs.access(path.join(source, entrypoint));
  const rendererInfo = await adapter.check();
  const id = randomUUID(),
    dir = library.lessonDir(id),
    work = path.join(dir, adapter.directory),
    settings = await library.settings();
  await fs.mkdir(work, { recursive: true });
  // Keep exact authored inputs beside the result, outside Git.
  const sourceHash = createHash("sha256");
  const inputs = new Set([
    ...(await fs.readdir(source)).filter((name) =>
      (adapter.sourcePattern || /\.(py|json)$/).test(name),
    ),
    ...manifest.files,
  ]);
  const realSource = await fs.realpath(source);
  for (const name of [...inputs].sort()) {
    const relative = path.normalize(name);
    if (
      path.isAbsolute(name) ||
      relative === ".." ||
      relative.startsWith(".." + path.sep)
    )
      throw new Error("Authored files must stay inside the source folder.");
    const input = await fs.realpath(path.join(source, relative));
    if (
      !input.startsWith(realSource + path.sep) ||
      !(await fs.stat(input)).isFile()
    )
      throw new Error(
        "Authored files must be regular files inside the source folder.",
      );
    const bytes = await fs.readFile(input);
    sourceHash.update(relative).update(bytes);
    await atomicWrite(path.join(work, "source", relative), bytes);
  }
  let lesson = {
    ...manifest,
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workerPid: process.pid,
    status: "rendering",
    stage: "Preparing narration",
    progress: 5,
    style: "auto",
    presentation: "worked",
    settings,
    request: { topic: manifest.title, sourceIds: [] },
    context: {
      profile: await library.profile(),
      brief: manifest.brief || manifest.learningObjective,
      sources: manifest.sources.map((s, i) => ({
        id: `reference-${i}`,
        title: s.title,
        excerpt: s.url,
      })),
    },
    renderer: adapter.name,
    rendererInfo,
    sourceHash: sourceHash.digest("hex"),
    scenes: [],
  };
  const update = async (values) => {
    lesson = { ...lesson, ...values, updatedAt: new Date().toISOString() };
    await library.saveLesson(lesson);
  };
  await update({});
  try {
    const imageAssets = await prepareAssets(
      manifest.assets,
      path.join(work, "source", "assets"),
      { fetchImage },
    );
    const credits = imageAssets.length ? assetCredits(imageAssets) : "";
    if (credits) await atomicWrite(path.join(dir, "image-credits.md"), credits);
    await update({ imageAssets });
    let start = 0;
    const timeline = [];
    for (let i = 0; i < manifest.scenes.length; i++) {
      const s = manifest.scenes[i],
        speech = path.join(work, `speech-${i}.wav`);
      progress(`Narrating chapter ${i + 1}/${manifest.scenes.length}`);
      const timing = await narrateAuthoredScene({
        scene: s,
        output: speech,
        settings,
        synthesize,
        cacheDir: path.join(library.root, ".models", "kokoro"),
      });
      timeline.push({
        ...s,
        takeaway: s.takeaway || s.title,
        start,
        ...timing,
      });
      start += timing.duration;
    }
    await writeJson(path.join(work, "timeline.json"), timeline);
    await update({
      scenes: timeline,
      stage: adapter.stage,
      progress: 25,
    });
    progress(adapter.stage);
    await adapter.render({
      module: path.join(work, "source", entrypoint),
      timeline: path.join(work, "timeline.json"),
      output: work,
      progress,
    });
    for (let i = 0; i < timeline.length; i++) {
      const visual = path.join(work, `visual-${i}.mp4`),
        info = await probeVideo(visual);
      const v = info.streams.find((s) => s.codec_type === "video");
      if (
        !v ||
        v.width !== 1280 ||
        v.height !== 720 ||
        v.avg_frame_rate !== "30/1" ||
        Math.abs(Number(info.format.duration) - timeline[i].duration) > 0.12
      )
        throw new Error(
          `Chapter ${i + 1} has invalid video dimensions, fps or timing`,
        );
      await run("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-i",
        visual,
        "-i",
        path.join(work, `speech-${i}.wav`),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-af",
        "apad",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-ar",
        "44100",
        "-ac",
        "1",
        "-t",
        String(timeline[i].duration),
        path.join(work, `chapter-${i}.mp4`),
      ]);
    }
    await atomicWrite(
      path.join(work, "concat.txt"),
      timeline.map((_, i) => `file 'chapter-${i}.mp4'`).join("\n"),
    );
    const video = path.join(work, "complete.mp4");
    await run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "concat",
      "-safe",
      "1",
      "-i",
      path.join(work, "concat.txt"),
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      video,
    ]);
    const media = await probeVideo(video);
    if (
      Math.abs(Number(media.format.duration) - start) > 0.15 ||
      !media.streams.some((s) => s.codec_type === "audio")
    )
      throw new Error("Final video timing or audio validation failed");
    await run("ffmpeg", ["-v", "error", "-i", video, "-f", "null", "-"]);
    await writeJson(path.join(work, "media.json"), media);
    await fs.copyFile(
      path.join(work, "scene-0-0.5.png"),
      path.join(dir, "thumbnail.png"),
    );
    await atomicWrite(path.join(dir, "captions.vtt"), captions(timeline));
    await atomicWrite(
      path.join(dir, "transcript.md"),
      `# ${manifest.title}\n\n${manifest.summary}\n\n` +
        timeline
          .map((s) => `## ${clock(s.start)} — ${s.title}\n\n${s.narration}\n`)
          .join("\n") +
        "\nSources:\n" +
        manifest.sources.map((s) => `- [${s.title}](${s.url})`).join("\n") +
        "\n\n" +
        credits,
    );
    await fs.rename(video, path.join(library.root, "videos", `${id}.mp4`));
    await update({
      status: "ready",
      stage: "Ready to watch",
      workerPid: null,
      progress: 100,
      duration: start,
      video: `${id}.mp4`,
      completedAt: new Date().toISOString(),
    });
    return lesson;
  } catch (error) {
    await update({
      status: "error",
      workerPid: null,
      stage: `${adapter.name} rendering failed`,
      error: error.message,
    });
    throw error;
  }
}
