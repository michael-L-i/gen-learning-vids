import { globeSvg } from "../geography/globe.js";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { svgPathProperties } from "svg-path-properties";
import { validateAnimation } from "./schema.js";
import { escapeXml } from "../visual-utils.js";
import { run } from "../process.js";
import { atomicWrite, writeJson } from "../store.js";
export const animationEngineVersion = "svg-timeline-4";
export const fps = 30;
const ease = (t, kind) =>
  kind === "accelerate"
    ? t * t
    : kind === "decelerate"
      ? 1 - (1 - t) ** 2
      : kind === "smooth"
        ? t * t * (3 - 2 * t)
        : t;
export function beatTimeline(
  animation,
  durations = animation.beats.map((b) => b.seconds),
) {
  let start = 0;
  return animation.beats.map((b, i) => {
    const duration = durations[i];
    const result = { ...b, start, duration };
    start += duration;
    return result;
  });
}
export function frameState(animation, timeline, seconds) {
  const state = new Map(animation.nodes.map((n) => [n.id, { ...n, draw: 1 }]));
  const timed = animation.tracks
    .map((t) => {
      const b = timeline.find((b) => b.id === t.beat);
      return {
        ...t,
        begin: b.start + b.duration * t.start,
        finish: b.start + b.duration * t.end,
      };
    })
    .sort((a, b) => a.begin - b.begin);
  const initialized = new Set();
  for (const t of timed) {
    const node = state.get(t.node),
      key = `${t.node}:${t.property}`;
    if (!initialized.has(key)) {
      node[t.property] = t.from;
      initialized.add(key);
    }
    if (seconds >= t.begin) {
      const u = Math.max(
        0,
        Math.min(1, (seconds - t.begin) / (t.finish - t.begin)),
      );
      node[t.property] = t.from + (t.to - t.from) * ease(u, t.easing);
    }
  }
  return state;
}
// Use the same font family for Pango measurement and SVG rasterization.
export async function prepareAnimation(value, { assets = {} } = {}) {
  const animation = validateAnimation(value),
    textLayout = {};
  const cache = new Map();
  const measure = async (text, n) => {
    const font = `${n.fontFamily === "mono" ? "Courier New" : "Arial"} ${n.fontWeight === "bold" ? "Bold " : ""}${n.fontSize}`;
    const key = `${font}:${text}`;
    if (!cache.has(key))
      cache.set(
        key,
        sharp({
          text: {
            text: escapeXml(text) || " ",
            font,
            dpi: 72,
          },
        })
          .metadata()
          .then((m) => m.width || 0),
      );
    return cache.get(key);
  };
  for (const n of animation.nodes.filter((n) => n.type === "text")) {
    const lines = [];
    // Sentinels preserve leading/trailing whitespace in Pango's ink-bounds measurement.
    const widthOf = async (s) =>
      (await measure(`|${s}|`, n)) - (await measure("||", n));
    const innerWidth = Math.max(0, (n.width || 1184) - 2 * n.padding);
    let current = "";
    for (const paragraph of n.text.split("\n")) {
      if (n.fontFamily === "mono") {
        lines.push(paragraph.replace(/\t/g, "    "));
        continue;
      }
      current = paragraph.match(/^\s*/)[0];
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = current.trim()
          ? `${current} ${word}`
          : `${current}${word}`;
        if (current && (await widthOf(candidate)) > innerWidth) {
          lines.push(current);
          current = word;
        } else current = candidate;
      }
      lines.push(current);
      current = "";
    }
    const widths = await Promise.all(lines.map(widthOf));
    const height = lines.length * n.fontSize * n.lineHeight;
    const spareY = Math.max(
      0,
      (n.height || height + 2 * n.padding) - 2 * n.padding - height,
    );
    const top =
      n.padding + spareY * { top: 0, middle: 0.5, bottom: 1 }[n.verticalAlign];
    const offsets = widths.map(
      (w) =>
        n.padding +
        Math.max(0, innerWidth - w) *
          { left: 0, center: 0.5, right: 1 }[n.textAlign],
    );
    textLayout[n.id] = {
      lines,
      widths,
      offsets,
      top,
      width: Math.max(0, ...widths),
      height,
    };
  }
  const pathLengths = {};
  for (const n of animation.nodes.filter((n) => n.type === "path")) {
    try {
      pathLengths[n.id] = new svgPathProperties(n.path).getTotalLength();
    } catch {
      throw new Error(`Invalid path geometry: ${n.id}`);
    }
    if (!Number.isFinite(pathLengths[n.id]) || pathLengths[n.id] > 1000000)
      throw new Error(`Path geometry exceeds limits: ${n.id}`);
  }
  const imageData = {};
  for (const n of animation.nodes.filter((n) => n.type === "image")) {
    const bytes = assets[n.asset];
    if (
      !Buffer.isBuffer(bytes) ||
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw new Error(`Missing normalized image asset: ${n.asset}`);
    imageData[n.id] = `data:image/png;base64,${bytes.toString("base64")}`;
  }
  return { animation, textLayout, pathLengths, imageData };
}
export function animationSvg(prepared, timeline, seconds) {
  const { animation, textLayout, pathLengths } = prepared,
    state = frameState(animation, timeline, seconds);
  const render = (parent) =>
    animation.nodes
      .filter((n) => n.parent === parent)
      .map((raw) => {
        const n = state.get(raw.id),
          attrs = `fill="${n.fill}" stroke="${n.stroke}" stroke-width="${n.strokeWidth}"`;
        let body = "";
        if (n.type === "globe")
          body = globeSvg({
            ...n,
            ...n.geography,
            highlights: n.geography.highlights.map((h) => ({
              ...h,
              opacity: n[`highlight:${h.country}`] ?? 1,
            })),
          });
        if (n.type === "group") body = render(n.id);
        if (n.type === "rect")
          body = `<rect width="${n.width}" height="${n.height}" rx="${n.radius}" ${attrs}/>`;
        if (n.type === "ellipse")
          body = `<ellipse rx="${n.width / 2}" ry="${n.height / 2}" ${attrs}/>`;
        if (n.type === "image")
          body = `<svg width="${n.width}" height="${n.height}" overflow="hidden"><image width="${n.width}" height="${n.height}" preserveAspectRatio="xMidYMid ${n.fit === "cover" ? "slice" : "meet"}" href="${prepared.imageData[n.id]}"/></svg>`;
        if (n.type === "path")
          body = `<path d="${n.path}" ${attrs} stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${n.draw === 0 ? 0 : 1}" stroke-dasharray="${pathLengths[n.id]} ${pathLengths[n.id]}" stroke-dashoffset="${(1 - n.draw) * pathLengths[n.id]}"/>`;
        if (n.type === "text") {
          const l = textLayout[n.id];
          body = `<text xml:space="preserve" font-family="${n.fontFamily === "mono" ? "Courier New" : "Arial"}" font-weight="${n.fontWeight}" font-size="${n.fontSize}" ${attrs}>${l.lines.map((line, i) => `<tspan x="${l.offsets[i]}" y="${l.top + n.fontSize + i * n.fontSize * n.lineHeight}">${escapeXml(line)}</tspan>`).join("")}</text>`;
        }
        return `<g transform="translate(${n.x} ${n.y}) rotate(${n.rotation}) scale(${n.scale})" opacity="${n.opacity}">${body}</g>`;
      })
      .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${animation.background}"/>${render(null)}</svg>`;
}
export function inspectAnimation(prepared, timeline) {
  const warnings = [];
  for (const n of prepared.animation.nodes.filter((n) => n.type === "text")) {
    const l = prepared.textLayout[n.id];
    if (n.width && l.width + n.padding * 2 > n.width + 3)
      warnings.push({ node: n.id, issue: "Text exceeds its width" });
    if (n.height && l.height + n.padding * 2 > n.height + 3)
      warnings.push({ node: n.id, issue: "Text exceeds its height" });
  }
  // Sample transformed text corners, including inherited group transforms.
  const total = timeline.at(-1).start + timeline.at(-1).duration;
  for (let t = 0; t <= total; t += 0.25) {
    const states = frameState(prepared.animation, timeline, t);
    const boxes = [];
    for (const n of states.values()) {
      if (n.type !== "text" || n.opacity < 0.1) continue;
      let opacity = n.opacity,
        parent = states.get(n.parent);
      while (parent) {
        opacity *= parent.opacity;
        parent = states.get(parent.parent);
      }
      if (opacity < 0.1) continue;
      const l = prepared.textLayout[n.id];
      const left = Math.min(...l.offsets),
        right = Math.max(...l.offsets.map((x, i) => x + l.widths[i]));
      const corners = [
        [left, l.top],
        [right, l.top],
        [left, l.top + l.height],
        [right, l.top + l.height],
      ].map(([x, y]) => {
        let p = n;
        while (p) {
          const r = (p.rotation * Math.PI) / 180;
          [x, y] = [
            p.x + p.scale * (x * Math.cos(r) - y * Math.sin(r)),
            p.y + p.scale * (x * Math.sin(r) + y * Math.cos(r)),
          ];
          p = states.get(p.parent);
        }
        return [x, y];
      });
      const box = {
        id: n.id,
        left: Math.min(...corners.map((p) => p[0])),
        right: Math.max(...corners.map((p) => p[0])),
        top: Math.min(...corners.map((p) => p[1])),
        bottom: Math.max(...corners.map((p) => p[1])),
      };
      for (const other of boxes) {
        if (
          Math.min(box.right, other.right) - Math.max(box.left, other.left) >
            4 &&
          Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) >
            4 &&
          !warnings.some((w) => w.node === n.id && w.other === other.id)
        )
          warnings.push({
            node: n.id,
            other: other.id,
            seconds: t,
            issue: "Text overlaps text (sampled bounds)",
          });
      }
      boxes.push(box);
      if (
        corners.some(([x, y]) => x < 0 || y < 0 || x > 1280 || y > 720) &&
        !warnings.some(
          (w) => w.node === n.id && w.issue === "Text leaves canvas",
        )
      )
        warnings.push({ node: n.id, seconds: t, issue: "Text leaves canvas" });
    }
  }
  return {
    engine: animationEngineVersion,
    checks: [
      "schema and references",
      "non-overlapping property tracks",
      "measured text bounds",
      "sampled text clipping",
      "sampled visible text overlaps",
    ],
    warnings,
    limitations: [
      "Does not assess factual correctness, object collisions, or instructional quality.",
      "Beat boundaries follow speech; individual words are not aligned.",
    ],
  };
}
export async function renderAnimation({
  scene,
  dir,
  settings,
  synthesize,
  cacheDir,
  assets = {},
  progress = async () => {},
}) {
  const prepared = await prepareAnimation(scene.content, { assets }),
    a = prepared.animation;
  await fs.mkdir(dir, { recursive: true });
  const durations = [];
  for (let i = 0; i < a.beats.length; i++) {
    const audio = path.join(dir, `speech-${i}.wav`);
    await synthesize(a.beats[i].narration, audio, settings, { cacheDir });
    const probe = await run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      audio,
    ]);
    const spoken = Number(probe.stdout.trim());
    if (!Number.isFinite(spoken) || spoken <= 0)
      throw new Error("Speech engine produced empty audio.");
    const duration =
      Math.ceil(Math.max(a.beats[i].seconds, spoken) * fps) / fps;
    durations.push(duration);
    await run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      audio,
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
  }
  const timeline = beatTimeline(a, durations),
    duration = durations.reduce((a, b) => a + b, 0);
  await atomicWrite(
    path.join(dir, "audio.txt"),
    a.beats.map((_, i) => `file 'beat-${i}.wav'`).join("\n"),
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
    path.join(dir, "audio.txt"),
    "-c",
    "copy",
    path.join(dir, "audio.wav"),
  ]);
  const count = Math.round(duration * fps);
  for (let frame = 0; frame < count; frame++) {
    await sharp(Buffer.from(animationSvg(prepared, timeline, frame / fps)))
      .png()
      .toFile(path.join(dir, `frame-${String(frame).padStart(5, "0")}.png`));
    if (frame % 30 === 0)
      await progress(
        `Rendering animation ${Math.round((frame / count) * 100)}%`,
      );
  }
  const video = path.join(dir, "clip.mp4");
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-framerate",
    String(fps),
    "-i",
    path.join(dir, "frame-%05d.png"),
    "-i",
    path.join(dir, "audio.wav"),
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ar",
    "44100",
    "-t",
    String(duration),
    "-movflags",
    "+faststart",
    video,
  ]);
  await sharp(Buffer.from(animationSvg(prepared, timeline, duration * 0.55)))
    .png()
    .toFile(path.join(dir, "thumbnail.png"));
  const report = inspectAnimation(prepared, timeline);
  await writeJson(path.join(dir, "timeline.json"), timeline);
  await writeJson(path.join(dir, "checks.json"), report);
  return { video, duration, timeline, report };
}
