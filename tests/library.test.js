import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Library, readJson } from "../server/store.js";
import { scanNotes, importNotes, textFromExport } from "../server/imports.js";
import { createLesson, runJob, retryLesson } from "../server/engine.js";
import { captions, wrap, sceneSvg } from "../server/render.js";
import { startServer } from "../server/app.js";
import { parseAgentJson } from "../server/providers.js";

async function temporary(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "learnvid-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
const plan = {
  title: "Understanding recursion",
  summary: "Trace a function as it returns.",
  learningObjective: "Predict the result of a recursive call.",
  assumedKnowledge: ["Functions"],
  tags: ["Programming"],
  scenes: [
    {
      title: "Each call has its own place",
      narration:
        "Each function call keeps its own variables. The caller waits until the next call returns.",
      visual: "steps",
      points: [
        "Call the function",
        "Wait for the next call",
        "Return to the caller",
      ],
      takeaway: "A call is waiting, not disappearing.",
    },
    {
      title: "A base case stops the calls",
      narration:
        "A base case returns directly. Without one, the function would continue calling itself until it runs out of space.",
      visual: "concept",
      points: ["Stop at the base case"],
      takeaway: "Every chain needs a stopping point.",
    },
  ],
  check: {
    question: "What happens when the base case returns?",
    answer: "The waiting caller continues.",
  },
};

test("parallel initialization preserves profile and atomic library writes", async (t) => {
  const root = await temporary(t);
  const a = new Library(root),
    b = new Library(root);
  await Promise.all([a.init(), b.init()]);
  await a.saveProfile("I am learning recursion.");
  await b.init();
  assert.equal(await b.profile(), "I am learning recursion.");
  const sources = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      a.addSource({ title: `Note ${i}`, content: "Example" }),
    ),
  );
  assert.equal((await b.sources()).length, 10);
  assert.equal(new Set(sources.map((s) => s.id)).size, 10);
});
test("lesson context is a bounded immutable snapshot", async (t) => {
  const lib = await new Library(await temporary(t)).init();
  await lib.saveProfile("I know functions.");
  const source = await lib.addSource({
    title: "Notes",
    content: "a".repeat(25000),
  });
  const lesson = await createLesson(
    lib,
    { topic: "Recursion", sourceIds: [source.id] },
    plan,
  );
  await lib.saveProfile("New profile");
  await lib.removeSource(source.id);
  const saved = await lib.lesson(lesson.id);
  assert.equal(saved.context.profile, "I know functions.");
  assert.equal(saved.context.sources[0].excerpt.length, 15000);
  assert.equal(saved.context.sources[0].truncated, true);
  await assert.rejects(() => lib.lesson("../settings.json"), /Invalid/);
});
test("Obsidian preview skips hidden folders and symlinks; import rejects escapes", async (t) => {
  const root = await temporary(t);
  const vault = path.join(root, "vault");
  await fs.mkdir(path.join(vault, ".obsidian"), { recursive: true });
  await fs.writeFile(path.join(vault, "note.md"), "Useful note");
  await fs.writeFile(path.join(vault, ".obsidian", "private.md"), "Hidden");
  await fs.writeFile(path.join(root, "outside.md"), "Outside");
  await fs.symlink(path.join(root, "outside.md"), path.join(vault, "link.md"));
  const scan = await scanNotes(vault);
  assert.deepEqual(
    scan.notes.map((n) => n.path),
    ["note.md"],
  );
  const lib = await new Library(path.join(root, "library")).init();
  assert.equal((await importNotes(lib, vault, ["note.md"])).length, 1);
  await assert.rejects(
    () => importNotes(lib, vault, ["../outside.md"]),
    /inside/,
  );
  await assert.rejects(() => importNotes(lib, vault, ["link.md"]), /inside/);
});
test("ChatGPT imports follow the active branch and omit system messages", () => {
  const message = (id, parent, role, text) => ({
    id,
    parent,
    message: { author: { role }, content: { parts: [text] } },
  });
  const data = [
    {
      title: "Topic",
      current_node: "b",
      mapping: {
        root: message("root", null, "system", "secret instructions"),
        a: message("a", "root", "user", "Question"),
        b: message("b", "a", "assistant", "Current answer"),
        c: message("c", "a", "assistant", "Abandoned answer"),
      },
    },
  ];
  const result = textFromExport(JSON.stringify(data), "conversations.json");
  assert.match(result, /Current answer/);
  assert.doesNotMatch(result, /Abandoned|secret/);
  assert.match(
    textFromExport(
      JSON.stringify([
        {
          name: "Claude chat",
          chat_messages: [{ sender: "human", text: "Hello" }],
        },
      ]),
      "claude.json",
    ),
    /human: Hello/,
  );
});
test("job failures persist, retry uses current settings, and successful plans are retained", async (t) => {
  const lib = await new Library(await temporary(t)).init();
  const lesson = await createLesson(lib, { topic: "Recursion" });
  await assert.rejects(
    () =>
      runJob(lib, lesson.id, {
        planGenerator: async () => plan,
        renderer: async () => {
          throw new Error("Speech missing");
        },
      }),
    /Speech missing/,
  );
  assert.equal((await lib.lesson(lesson.id)).status, "error");
  await lib.saveSettings({ provider: "claude" });
  await retryLesson(lib, lesson.id);
  const result = await runJob(lib, lesson.id, {
    planGenerator: async () => {
      throw new Error("Should reuse existing plan");
    },
    renderer: async (_, l) => ({ ...l, status: "ready", duration: 20 }),
  });
  assert.equal(result.status, "ready");
  assert.equal(result.settings.provider, "claude");
});
test("parallel processing of one lesson cannot acquire two writers", async (t) => {
  const lib = await new Library(await temporary(t)).init();
  const lesson = await createLesson(lib, { topic: "Recursion" }, plan);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let locked;
  const entered = new Promise((resolve) => {
    locked = resolve;
  });
  const first = lib.withLessonLock(lesson.id, async () => {
    locked();
    await gate;
  });
  await entered;
  await assert.rejects(() => lib.withLessonLock(lesson.id, async () => {}), {
    code: "ELOCKED",
  });
  release();
  await first;
});
test("captions span narration timing and rendered text is escaped", () => {
  const vtt = captions([
    { narration: "First sentence for the learner.", start: 0, duration: 4 },
    { narration: "The next idea follows.", start: 4, duration: 3 },
  ]);
  assert.match(vtt, /00:00:00.000 --> 00:00:04.000/);
  assert.match(vtt, /00:00:04.000 --> 00:00:07.000/);
  assert.ok(wrap("a".repeat(100), 30).every((l) => l.length <= 30));
  const svg = sceneSvg({ ...plan.scenes[0], title: "<script>&" }, 0, 2);
  assert.match(svg, /&lt;script&gt;&amp;/);
  assert.deepEqual(parseAgentJson('```json\n{"ok":true}\n```'), { ok: true });
});
test("local API rejects cross-origin writes, enforces input validation, and serves shared files", async (t) => {
  const instance = await startServer({ root: await temporary(t), port: 0 });
  t.after(() => instance.close());
  const { token } = await (await fetch(instance.url + "/api/bootstrap")).json();
  const headers = {
    "Content-Type": "application/json",
    "X-Lesson-Token": token,
  };
  const denied = await fetch(instance.url + "/api/profile", {
    method: "PUT",
    headers: { ...headers, Origin: "https://evil.example" },
    body: JSON.stringify({ content: "bad" }),
  });
  assert.equal(denied.status, 403);
  const missing = await fetch(instance.url + "/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(missing.status, 403);
  const ok = await fetch(instance.url + "/api/profile", {
    method: "PUT",
    headers,
    body: JSON.stringify({ content: "User goals" }),
  });
  assert.equal(ok.status, 200);
  assert.equal(await instance.library.profile(), "User goals");
  const bad = await fetch(instance.url + "/api/lessons", {
    method: "POST",
    headers,
    body: JSON.stringify({ topic: "x" }),
  });
  assert.equal(bad.status, 400);
  const source = await fetch(instance.url + "/api/sources", {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "Test", content: "Hello" }),
  });
  assert.equal(source.status, 201);
  const list = await (await fetch(instance.url + "/api/sources")).json();
  assert.equal(list.length, 1);
  const lesson = await createLesson(
    instance.library,
    { topic: "Recursion" },
    plan,
  );
  assert.equal(
    (
      await fetch(
        instance.url + `/api/lessons/${lesson.id}/files/thumbnail.png`,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(
        instance.url + `/api/lessons/${lesson.id}/files/settings.json`,
      )
    ).status,
    404,
  );
});
