import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { run } from "./process.js";
import { atomicWrite } from "./store.js";

export const palettes = {
  paper: {
    bg: "#eee8dc",
    fg: "#272b29",
    accent: "#b15335",
    card: "#fbf8f0",
    muted: "#77756a",
  },
  midnight: {
    bg: "#17242a",
    fg: "#f4f1e8",
    accent: "#e5b86d",
    card: "#24363d",
    muted: "#adc0c3",
  },
  sage: {
    bg: "#dfe8de",
    fg: "#244c40",
    accent: "#32705a",
    card: "#f0f5eb",
    muted: "#638071",
  },
};
export const escapeXml = (s) =>
  String(s).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
export function wrap(text, max) {
  const words = String(text)
    .split(/\s+/)
    .flatMap((w) =>
      w.length > max ? w.match(new RegExp(`.{1,${max}}`, "g")) : [w],
    );
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max && line) {
      lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines;
}
const textLines = (
  text,
  x,
  y,
  size,
  color,
  max,
  lineHeight = 1.3,
  family = "sans-serif",
) =>
  `<text x="${x}" y="${y}" fill="${color}" font-family="${family}" font-size="${size}">${wrap(
    text,
    max,
  )
    .map(
      (line, i) =>
        `<tspan x="${x}" dy="${i ? size * lineHeight : 0}">${escapeXml(line)}</tspan>`,
    )
    .join("")}</text>`;
export function sceneSvg(scene, index, total, style = "paper") {
  const p = palettes[style] || palettes.paper;
  const points = scene.points || [];
  const two = scene.visual === "comparison" && points.length <= 2;
  let cards = "";
  if (two) {
    cards = points
      .map(
        (point, i) =>
          `<rect x="${76 + i * 578}" y="290" width="550" height="238" rx="8" fill="${p.card}"/><text x="${104 + i * 578}" y="336" fill="${p.accent}" font-size="19" font-family="sans-serif">${i ? "02" : "01"}</text>${textLines(point, 104 + i * 578, 380, 26, p.fg, 34)}`,
      )
      .join("");
  } else {
    cards = points
      .map((point, i) => {
        const y = 275 + i * 74;
        return `<rect x="76" y="${y - 25}" width="1128" height="66" rx="7" fill="${p.card}"/><circle cx="110" cy="${y + 5}" r="15" fill="${p.accent}"/><text x="110" y="${y + 11}" fill="${p.bg}" text-anchor="middle" font-family="sans-serif" font-size="17">${scene.visual === "steps" ? i + 1 : "·"}</text>${textLines(point, 145, y + (point.length > 74 ? -2 : 13), 24, p.fg, 74, 1.16)}`;
      })
      .join("");
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${p.bg}"/><rect x="76" y="61" width="30" height="3" fill="${p.accent}"/><text x="122" y="69" font-family="sans-serif" font-size="15" letter-spacing="3" fill="${p.muted}">LESSON LIBRARY</text><text x="1204" y="69" text-anchor="end" font-family="sans-serif" font-size="16" fill="${p.muted}">${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</text>${textLines(scene.title, 76, 151, 48, p.fg, 42, 1.14, "serif")}${cards}<line x1="76" y1="597" x2="1204" y2="597" stroke="${p.muted}" opacity="0.25"/>${textLines(scene.takeaway, 76, 638, 23, p.muted, 86, 1.3)}<rect x="0" y="714" width="${(1280 * (index + 1)) / total}" height="6" fill="${p.accent}"/></svg>`;
}
export function thumbnailSvg(title, style = "paper") {
  const p = palettes[style] || palettes.paper;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="${p.bg}"/><circle cx="1090" cy="260" r="205" fill="none" stroke="${p.accent}" stroke-width="2" opacity="0.4"/><circle cx="1060" cy="270" r="137" fill="none" stroke="${p.accent}" stroke-width="2" opacity="0.6"/><circle cx="1030" cy="280" r="70" fill="${p.accent}" opacity="0.18"/><path d="M875 550 L1140 85" stroke="${p.accent}" stroke-width="2"/>${textLines(title, 76, 330, 62, p.fg, 27, 1.1, "serif")}<text x="76" y="653" fill="${p.muted}" font-family="sans-serif" font-size="20">LESSON LIBRARY</text></svg>`;
}
export const clock = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
function vttTime(s) {
  const ms = Math.round(s * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}
export function captions(scenes) {
  const cues = [];
  for (const scene of scenes) {
    const words = scene.narration.split(/\s+/);
    const chunk = 11;
    for (let i = 0; i < words.length; i += chunk) {
      const start = scene.start + (scene.duration * i) / words.length;
      const end =
        scene.start +
        (scene.duration * Math.min(i + chunk, words.length)) / words.length;
      cues.push(
        `${vttTime(start)} --> ${vttTime(end)}\n${words
          .slice(i, i + chunk)
          .join(" ")
          .replace(/-->/g, "→")
          .replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"))}`,
      );
    }
  }
  return "WEBVTT\n\n" + cues.join("\n\n") + "\n";
}
async function speak(text, output, settings) {
  if (settings.tts === "piper") {
    if (!settings.piperModel)
      throw new Error(
        "Choose a Piper voice model in Settings before generating a lesson.",
      );
    await run(
      "piper",
      ["--model", settings.piperModel, "--output_file", output],
      { input: text },
    );
  } else if (process.platform === "darwin") {
    const input = output + ".txt";
    await atomicWrite(input, text);
    const args = [
      "-f",
      input,
      "-o",
      output,
      "--data-format=LEI16@22050",
      "-r",
      String(settings.speechRate),
    ];
    if (settings.voice) args.push("-v", settings.voice);
    await run("say", args);
    await fs.unlink(input);
  } else {
    const args = ["-w", output, "-s", String(settings.speechRate), "--stdin"];
    if (settings.voice) args.push("-v", settings.voice);
    await run("espeak", args, { input: text });
  }
}
export async function renderLesson(
  library,
  lesson,
  settings,
  progress = async () => {},
) {
  const dir = library.lessonDir(lesson.id);
  const render = path.join(dir, "render");
  await fs.mkdir(render, { recursive: true });
  await sharp(Buffer.from(thumbnailSvg(lesson.title, lesson.style)))
    .png()
    .toFile(path.join(dir, "thumbnail.png"));
  let start = 0;
  const scenes = [];
  for (let i = 0; i < lesson.scenes.length; i++) {
    const scene = lesson.scenes[i];
    await progress(
      `Narrating chapter ${i + 1} of ${lesson.scenes.length}`,
      15 + (70 * i) / lesson.scenes.length,
    );
    const audio = path.join(render, `scene-${i}.wav`);
    const frame = path.join(render, `scene-${i}.png`);
    const clip = path.join(render, `scene-${i}.mp4`);
    await speak(scene.narration, audio, settings);
    const { stdout } = await run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      audio,
    ]);
    const duration = Number(stdout.trim());
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error("The speech engine produced empty audio.");
    await sharp(
      Buffer.from(sceneSvg(scene, i, lesson.scenes.length, lesson.style)),
    )
      .png()
      .toFile(frame);
    await progress(
      `Rendering chapter ${i + 1} of ${lesson.scenes.length}`,
      20 + (70 * i) / lesson.scenes.length,
    );
    await run("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-loop",
      "1",
      "-framerate",
      "24",
      "-i",
      frame,
      "-i",
      audio,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-tune",
      "stillimage",
      "-crf",
      "23",
      "-vf",
      "fade=t=in:st=0:d=0.3,format=yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-t",
      String(duration),
      "-shortest",
      clip,
    ]);
    scenes.push({ ...scene, start, duration });
    start += duration;
  }
  await progress("Putting your lesson together", 92);
  const list = path.join(render, "concat.txt");
  await atomicWrite(
    list,
    scenes.map((_, i) => `file 'scene-${i}.mp4'`).join("\n"),
  );
  const video = path.join(library.root, "videos", `${lesson.id}.mp4`);
  const temporaryVideo = path.join(render, "complete.mp4");
  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "1",
    "-i",
    list,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    temporaryVideo,
  ]);
  await fs.rename(temporaryVideo, video);
  await atomicWrite(path.join(dir, "captions.vtt"), captions(scenes));
  await atomicWrite(
    path.join(dir, "transcript.md"),
    `# ${lesson.title}\n\n${lesson.summary}\n\n` +
      scenes
        .map((s) => `## ${clock(s.start)} — ${s.title}\n\n${s.narration}\n`)
        .join("\n"),
  );
  await fs.rm(render, { recursive: true, force: true });
  return {
    ...lesson,
    scenes,
    duration: start,
    video: `${lesson.id}.mp4`,
    status: "ready",
    progress: 100,
    stage: "Ready to watch",
    completedAt: new Date().toISOString(),
  };
}
