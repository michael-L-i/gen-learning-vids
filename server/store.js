import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import lockfile from "proper-lockfile";
import { settingsSchema } from "./schema.js";

export const defaultLibrary = () =>
  path.resolve(
    process.env.LEARNVID_HOME || path.join(os.homedir(), "Lesson Library"),
  );
export const validId = (id) =>
  typeof id === "string" && /^[a-f0-9-]{36}$/.test(id);
export function assertId(id) {
  if (!validId(id)) throw new Error("Invalid library item identifier.");
  return id;
}
export async function atomicWrite(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, content, { mode: 0o600 });
  await fs.rename(temp, file);
}
export const writeJson = (file, data) =>
  atomicWrite(file, JSON.stringify(data, null, 2) + "\n");
export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT" && fallback !== undefined) return fallback;
    throw e;
  }
}
export class Library {
  constructor(root = defaultLibrary()) {
    this.root = path.resolve(root);
  }
  lessonDir(id) {
    return path.join(this.root, "lessons", assertId(id));
  }
  sourceFile(id) {
    return path.join(this.root, "sources", `${assertId(id)}.json`);
  }
  async init() {
    for (const dir of ["lessons", "videos", "sources", "profile", ".jobs"])
      await fs.mkdir(path.join(this.root, dir), {
        recursive: true,
        mode: 0o700,
      });
    // Exclusive creation prevents parallel CLI/UI starts from resetting existing configuration.
    for (const [name, value] of [
      ["settings.json", JSON.stringify(settingsSchema.parse({}), null, 2)],
      [
        "profile/learner.md",
        "# About my learning\n\n## Goals\n\n## Background\n\n## What helps me learn\n\n## Questions I am working through\n",
      ],
    ]) {
      try {
        await fs.writeFile(path.join(this.root, name), value, {
          flag: "wx",
          mode: 0o600,
        });
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
      }
    }
    return this;
  }
  async settings() {
    return settingsSchema.parse(
      await readJson(path.join(this.root, "settings.json")),
    );
  }
  async saveSettings(value) {
    const parsed = settingsSchema.parse(value);
    await writeJson(path.join(this.root, "settings.json"), parsed);
    return parsed;
  }
  async profile() {
    return fs.readFile(path.join(this.root, "profile", "learner.md"), "utf8");
  }
  async saveProfile(content) {
    if (typeof content !== "string" || content.length > 50000)
      throw new Error("Profile must be text under 50,000 characters.");
    await atomicWrite(path.join(this.root, "profile", "learner.md"), content);
  }
  async lesson(id) {
    const lesson = await readJson(path.join(this.lessonDir(id), "lesson.json"));
    if (["queued", "generating", "rendering"].includes(lesson.status)) {
      let interrupted = false;
      if (lesson.workerPid) {
        try {
          process.kill(lesson.workerPid, 0);
        } catch (error) {
          interrupted = error.code === "ESRCH";
        }
      } else {
        interrupted = Date.now() - Date.parse(lesson.updatedAt) > 60000;
      }
      // Report a stopped worker without letting a read overwrite a concurrent update.
      if (interrupted)
        return {
          ...lesson,
          status: "error",
          stage: "Generation was interrupted",
          error:
            "The generation process stopped. Retry to continue from the saved lesson plan. A recently stopped process may take 30 seconds to release its lock.",
        };
    }
    return lesson;
  }
  async saveLesson(lesson) {
    await writeJson(
      path.join(this.lessonDir(lesson.id), "lesson.json"),
      lesson,
    );
    return lesson;
  }
  async lessons() {
    const dirs = await fs.readdir(path.join(this.root, "lessons"));
    const results = await Promise.all(
      dirs.filter(validId).map((id) => this.lesson(id).catch(() => null)),
    );
    return results
      .filter(Boolean)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async source(id) {
    return readJson(this.sourceFile(id));
  }
  async sources() {
    const files = await fs.readdir(path.join(this.root, "sources"));
    const data = await Promise.all(
      files
        .filter((f) => f.endsWith(".json") && validId(f.slice(0, -5)))
        .map((f) => this.source(f.slice(0, -5)).catch(() => null)),
    );
    return data
      .filter(Boolean)
      .sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  }
  async addSource({ title, content, origin = "Pasted text", kind = "note" }) {
    if (!title?.trim() || typeof content !== "string" || !content.trim())
      throw new Error("Give your source a title and some text.");
    if (content.length > 150000)
      throw new Error(
        "This source is too long. Import a smaller selection (150,000 characters maximum).",
      );
    const source = {
      id: randomUUID(),
      title: title.slice(0, 200),
      content,
      origin,
      kind,
      importedAt: new Date().toISOString(),
    };
    await writeJson(this.sourceFile(source.id), source);
    return source;
  }
  async removeSource(id) {
    await fs.unlink(this.sourceFile(id));
  }
  async chat(id) {
    return readJson(path.join(this.lessonDir(id), "chat.json"), []);
  }
  async withLessonLock(id, fn) {
    const release = await lockfile.lock(this.lessonDir(id), {
      stale: 30000,
      update: 10000,
      retries: 0,
    });
    try {
      return await fn();
    } finally {
      await release();
    }
  }
}
