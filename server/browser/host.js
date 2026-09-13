import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import express from "express";
import { build } from "esbuild";
import { chromium } from "playwright";
import { writeJson } from "../store.js";

const modules = fileURLToPath(new URL("../../node_modules/", import.meta.url));
export async function renderBrowserScenes({
  module,
  timeline,
  output,
  progress = () => {},
}) {
  const chapters = JSON.parse(await fs.readFile(timeline, "utf8"));
  const runtime = path.join(output, "runtime");
  await fs.mkdir(runtime, { recursive: true });
  await build({
    entryPoints: [module],
    bundle: true,
    format: "esm",
    platform: "browser",
    outfile: path.join(runtime, "scene.js"),
    nodePaths: [modules],
    logLevel: "silent",
  });
  // The WASM build exposes a browser initializer. No Python or external chemistry app.
  for (const name of ["RDKit_minimal.js", "RDKit_minimal.wasm"])
    await fs.copyFile(
      path.join(modules, "@rdkit/rdkit/dist", name),
      path.join(runtime, name),
    );
  await fs.writeFile(
    path.join(runtime, "index.html"),
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:#fff}#stage{position:relative;width:1280px;height:720px;overflow:hidden}*{box-sizing:border-box}</style><div id="stage"></div><script src="/runtime/RDKit_minimal.js"></script><script type="module">import {buildScene} from '/runtime/scene.js';window.buildLessonScene=async context=>{window.lessonScene=await buildScene(document.getElementById('stage'),context);if(typeof window.lessonScene?.update!=='function')throw Error('buildScene must return update(seconds)');await document.fonts.ready;};</script>`,
  );
  const app = express();
  app.use("/runtime", express.static(runtime));
  app.use("/source", express.static(path.dirname(module)));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const report = { renderer: "browser", scenes: [] };
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--enable-unsafe-swiftshader"],
    });
    for (let i = 0; i < chapters.length; i++) {
      const began = Date.now(),
        chapter = chapters[i],
        frames = Math.round(chapter.duration * 30);
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
      });
      page.setDefaultTimeout(30000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/*", (route) =>
        route
          .request()
          .url()
          .startsWith(origin + "/")
          ? route.continue()
          : route.abort(),
      );
      await page.goto(origin + "/runtime/index.html");
      await page.waitForFunction(
        () => typeof window.buildLessonScene === "function",
      );
      await page.evaluate((ctx) => window.buildLessonScene(ctx), {
        ...chapter,
        index: i,
        width: 1280,
        height: 720,
        fps: 30,
        sourceUrl: origin + "/source/",
        rdkitUrl: origin + "/runtime/",
      });
      const cacheDir = path.join(output, `frames-${i}`);
      await fs.mkdir(cacheDir, { recursive: true });
      const cache = new Map();
      let rendered = 0,
        reused = 0,
        stderr = "",
        encodeError;
      const encoder = spawn(
        "ffmpeg",
        [
          "-y",
          "-v",
          "error",
          "-f",
          "image2pipe",
          "-framerate",
          "30",
          "-vcodec",
          "png",
          "-i",
          "pipe:0",
          "-an",
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "18",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          path.join(output, `visual-${i}.mp4`),
        ],
        { stdio: ["pipe", "ignore", "pipe"] },
      );
      encoder.stderr.on("data", (b) => (stderr = (stderr + b).slice(-4000)));
      encoder.stdin.on("error", (e) => {
        encodeError = e;
      });
      const completion = new Promise((resolve) => {
        encoder.once("error", (error) => resolve({ error }));
        encoder.once("close", (code) => resolve({ code }));
      });
      const previews = new Map(
        [0.05, 0.25, 0.5, 0.75, 0.95].map((f) => [
          Math.min(frames - 1, Math.floor(frames * f)),
          f,
        ]),
      );
      try {
        for (let frame = 0; frame < frames; frame++) {
          if (encodeError) throw encodeError;
          const key = await page.evaluate(
            (t) =>
              window.lessonScene.frameKey
                ? JSON.stringify(window.lessonScene.frameKey(t))
                : null,
            frame / 30,
          );
          let bytes;
          if (key !== null && key !== undefined && cache.has(key)) {
            bytes = await fs.readFile(cache.get(key));
            reused++;
          } else {
            await page.evaluate(
              (t) => window.lessonScene.update(t),
              frame / 30,
            );
            if (errors.length) throw Error(errors.join("\n"));
            bytes = await page.screenshot({ type: "png", animations: "allow" });
            rendered++;
            if (key !== null && key !== undefined) {
              const file = path.join(cacheDir, `${rendered}.png`);
              await fs.writeFile(file, bytes);
              cache.set(key, file);
            }
          }
          if (previews.has(frame))
            await fs.writeFile(
              path.join(output, `scene-${i}-${previews.get(frame)}.png`),
              bytes,
            );
          if (!encoder.stdin.write(bytes)) await once(encoder.stdin, "drain");
          if (frame % 150 === 0)
            progress(
              `Browser chapter ${i + 1}/${chapters.length}: ${frame + 1}/${frames} frames (${rendered} rendered, ${reused} reused)`,
            );
        }
        encoder.stdin.end();
        const done = await completion;
        if (done.error || done.code !== 0)
          throw Error(
            `Video encoding failed: ${done.error?.message || stderr}`,
          );
      } finally {
        if (encoder.exitCode === null) encoder.kill("SIGTERM");
        await page.close();
      }
      report.scenes.push({
        index: i,
        frames,
        rendered,
        reused,
        seconds: (Date.now() - began) / 1000,
      });
      await writeJson(path.join(output, "render-report.json"), report);
      await fs.rm(cacheDir, { recursive: true, force: true });
    }
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
