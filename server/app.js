import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Library, atomicWrite } from "./store.js";
import { doctor } from "./providers.js";
import { speak } from "./speech.js";
import { settingsSchema } from "./schema.js";
import { speechPreviewText } from "./speech-options.js";
import { createLesson, startWorker, retryLesson, askLesson } from "./engine.js";
import { scanNotes, importNotes, textFromExport } from "./imports.js";

export async function createApp(
  library,
  { dev = false, synthesize = speak } = {},
) {
  await library.init();
  const app = express();
  const token = randomBytes(32).toString("hex");
  app.disable("x-powered-by");
  // Loopback-only host + same-origin JSON writes prevent drive-by websites from using local agents or reading notes.
  app.use((req, res, next) => {
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || ""))
      return res.status(403).json({ error: "Local access only." });
    if (
      req.headers.origin &&
      req.headers.origin !== `http://${req.headers.host}`
    )
      return res
        .status(403)
        .json({ error: "Cross-origin requests are not allowed." });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
      if (
        !["GET", "HEAD"].includes(req.method) &&
        req.headers["x-lesson-token"] !== token
      )
        return res
          .status(403)
          .json({ error: "Refresh the app to reconnect to your library." });
    }
    next();
  });
  app.use(express.json({ limit: "4mb" }));
  const wrap = (fn) => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  };
  app.get(
    "/api/bootstrap",
    wrap(async (_, res) =>
      res.json({
        token,
        library: library.root,
        settings: await library.settings(),
      }),
    ),
  );
  app.get(
    "/api/doctor",
    wrap(async (_, res) => res.json(await doctor())),
  );
  const previews = new Map();
  app.post(
    "/api/speech/preview",
    wrap(async (req, res) => {
      const settings = settingsSchema.parse(req.body.settings);
      const id = createHash("sha256")
        .update(
          JSON.stringify({
            tts: settings.tts,
            voice: settings.voice,
            kokoroVoice: settings.kokoroVoice,
            speed: settings.speechSpeed,
            rate: settings.speechRate,
            piper: settings.piperModel,
            text: speechPreviewText,
          }),
        )
        .digest("hex");
      const file = path.join(library.root, ".previews", id + ".wav");
      if (!previews.has(id)) {
        const task = (async () => {
          try {
            await fs.access(file);
          } catch (e) {
            if (e.code !== "ENOENT") throw e;
            await fs.mkdir(path.dirname(file), {
              recursive: true,
              mode: 0o700,
            });
            const temporary = path.join(
              path.dirname(file),
              `${id}.${randomUUID()}.wav`,
            );
            try {
              await synthesize(speechPreviewText, temporary, settings, {
                cacheDir: path.join(library.root, ".models", "kokoro"),
              });
              await fs.rename(temporary, file);
            } finally {
              await fs.rm(temporary, { force: true });
            }
          }
        })();
        previews.set(id, task);
        task.finally(() => previews.delete(id)).catch(() => {});
      }
      await previews.get(id);
      res.json({ url: `/api/speech/previews/${id}.wav` });
    }),
  );
  app.get(
    "/api/speech/previews/:file",
    wrap(async (req, res) => {
      if (!/^[a-f0-9]{64}\.wav$/.test(req.params.file))
        return res.status(404).json({ error: "Preview not found." });
      res.sendFile(path.join(library.root, ".previews", req.params.file), {
        dotfiles: "allow",
      });
    }),
  );
  app.get(
    "/api/lessons",
    wrap(async (_, res) =>
      res.json(
        (await library.lessons()).map(
          ({ context, settings, request, ...lesson }) => ({
            ...lesson,
            sourceCount: context?.sources?.length || 0,
          }),
        ),
      ),
    ),
  );
  app.post(
    "/api/lessons",
    wrap(async (req, res) => {
      const lesson = await createLesson(library, req.body);
      startWorker(library, lesson.id);
      res.status(202).json(lesson);
    }),
  );
  app.get(
    "/api/lessons/:id",
    wrap(async (req, res) => res.json(await library.lesson(req.params.id))),
  );
  app.post(
    "/api/lessons/:id/retry",
    wrap(async (req, res) => {
      await retryLesson(library, req.params.id);
      startWorker(library, req.params.id);
      res.status(202).json({ ok: true });
    }),
  );
  app.get(
    "/api/lessons/:id/chat",
    wrap(async (req, res) => res.json(await library.chat(req.params.id))),
  );
  app.post(
    "/api/lessons/:id/chat",
    wrap(async (req, res) => {
      const seconds = Math.max(
        0,
        Math.min(86400, Number(req.body.seconds) || 0),
      );
      res.json(
        await askLesson(library, req.params.id, req.body.question, seconds),
      );
    }),
  );
  app.get(
    "/api/lessons/:id/files/:name",
    wrap(async (req, res) => {
      const dir = library.lessonDir(req.params.id);
      const names = [
        "thumbnail.png",
        "transcript.md",
        "captions.vtt",
        "storyboard.json",
        "context.json",
      ];
      if (req.params.name === "video.mp4")
        return res.sendFile(
          path.join(library.root, "videos", `${req.params.id}.mp4`),
          { dotfiles: "allow" },
        );
      if (!names.includes(req.params.name))
        return res.status(404).json({ error: "File not found." });
      res.sendFile(path.join(dir, req.params.name), { dotfiles: "allow" });
    }),
  );
  app.get(
    "/api/sources",
    wrap(async (_, res) =>
      res.json(
        (await library.sources()).map(({ content, ...s }) => ({
          ...s,
          characters: content.length,
        })),
      ),
    ),
  );
  app.get(
    "/api/sources/:id",
    wrap(async (req, res) => res.json(await library.source(req.params.id))),
  );
  app.post(
    "/api/sources",
    wrap(async (req, res) => {
      const { title, content, filename = "" } = req.body;
      if (typeof content !== "string" || typeof filename !== "string")
        throw new Error("Provide text or a supported export.");
      res.status(201).json(
        await library.addSource({
          title,
          content: textFromExport(content, filename),
          origin: filename || "Pasted text",
          kind: filename.endsWith(".json") ? "conversation" : "note",
        }),
      );
    }),
  );
  app.delete(
    "/api/sources/:id",
    wrap(async (req, res) => {
      await library.removeSource(req.params.id);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/sources/scan",
    wrap(async (req, res) => {
      if (typeof req.body.path !== "string" || !req.body.path.trim())
        throw new Error("Enter your notes folder path.");
      res.json(await scanNotes(req.body.path));
    }),
  );
  app.post(
    "/api/sources/import",
    wrap(async (req, res) =>
      res
        .status(201)
        .json(await importNotes(library, req.body.root, req.body.paths)),
    ),
  );
  app.get(
    "/api/profile",
    wrap(async (_, res) => res.json({ content: await library.profile() })),
  );
  app.put(
    "/api/profile",
    wrap(async (req, res) => {
      await library.saveProfile(req.body.content);
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/settings",
    wrap(async (_, res) => res.json(await library.settings())),
  );
  app.put(
    "/api/settings",
    wrap(async (req, res) => res.json(await library.saveSettings(req.body))),
  );
  app.use("/api", (_, res) => res.status(404).json({ error: "Not found." }));
  if (dev) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    app.locals.vite = vite;
  } else {
    const dist = fileURLToPath(new URL("../dist/", import.meta.url));
    app.use(express.static(dist));
    app.get("/{*path}", (_, res) =>
      res.sendFile(path.join(dist, "index.html")),
    );
  }
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status =
      err.code === "ENOENT" ? 404 : err.code === "ELOCKED" ? 409 : 400;
    res.status(status).json({
      error:
        err.code === "ELOCKED"
          ? "This lesson is busy. Wait a moment and try again."
          : err.name === "ZodError"
            ? err.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ")
            : err.message,
    });
  });
  return app;
}
export async function startServer({
  root,
  port = 4317,
  dev = false,
  synthesize,
} = {}) {
  const library = new Library(root);
  const app = await createApp(library, { dev, synthesize });
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, "127.0.0.1", () => resolve(s));
    s.once("error", reject);
  });
  const address = `http://127.0.0.1:${server.address().port}`;
  const instance = randomUUID();
  const discovery = path.join(library.root, ".server.json");
  await atomicWrite(
    discovery,
    JSON.stringify({ url: address, pid: process.pid, instance }),
  );
  return {
    server,
    app,
    library,
    url: address,
    close: async () => {
      await app.locals.vite?.close();
      await new Promise((resolve) => server.close(resolve));
      try {
        const current = JSON.parse(await fs.readFile(discovery, "utf8"));
        if (current.instance === instance) await fs.unlink(discovery);
      } catch {}
    },
  };
}
