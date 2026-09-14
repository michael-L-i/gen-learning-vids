import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { lessonPlanSchema, sceneSchema } from "../server/schema.js";
import { applyLessonEdits } from "../server/teaching.js";
import { generatePlan } from "../server/providers.js";
import { renderLesson, revealTimeline, captions } from "../server/render.js";
import { Library } from "../server/store.js";
import { createLesson } from "../server/engine.js";
import { run, available } from "../server/process.js";
const scene = {
  title: "Keep the previous result visible",
  narration: "First operation. Explain its reason. Next operation.",
  visual: "equation",
  points: ["Keep equality"],
  takeaway: "Apply the same operation to both sides.",
  content: {
    kind: "equation",
    steps: [
      { tex: "x+2=5", explanation: "Start" },
      { tex: "x=3", explanation: "Subtract two from both sides" },
    ],
  },
  beats: [
    {
      id: "start",
      narration: "First operation.",
      pauseAfter: 0.4,
      visualStep: 0,
    },
    {
      id: "reason",
      narration: "Explain its reason.",
      pauseAfter: 1.2,
      visualStep: 0,
    },
    {
      id: "next",
      narration: "Next operation.",
      pauseAfter: 0.8,
      visualStep: 1,
    },
  ],
};
const plan = {
  title: "An equation",
  summary: "Preserve equality.",
  learningObjective: "Solve an equation.",
  assumedKnowledge: [],
  tags: ["Math"],
  scenes: [scene],
  check: {
    question: "What can you subtract?",
    answer: "The same quantity on both sides.",
  },
};
const teaching = {
  learner: { established: [], assumed: ["Arithmetic"], uncertain: [] },
  focus: "Equality",
  skip: [],
  approach: "Explain the allowed operation.",
  pacing: "Hold after the reason.",
  symbols: [{ symbol: "x", meaning: "Unknown number", unit: "" }],
};

test("measured reveals reject missing states, backwards reveals, divergent speech and duplicate IDs", () => {
  assert.equal(sceneSchema.safeParse(scene).success, true);
  for (const mutate of [
    (s) => (s.beats[0].visualStep = 1),
    (s) => (s.beats[1].visualStep = 2),
    (s) => (s.beats[2].visualStep = 0),
    (s) => (s.beats[2].id = "start"),
    (s) => (s.beats[0].narration = "Different speech"),
    (s) => (s.beats[1].pauseAfter = -1),
  ]) {
    const s = structuredClone(scene);
    mutate(s);
    assert.equal(sceneSchema.safeParse(s).success, false);
  }
  const legacy = structuredClone(scene);
  delete legacy.beats;
  assert.equal(sceneSchema.parse(legacy).beats, null);
  assert.deepEqual(
    revealTimeline(legacy, { duration: 8 }).map((x) => x.duration),
    [4, 4],
  );
});

test("planner uses the revised content, preserves calibration and stops after one review", async () => {
  let calls = 0;
  const stages = [];
  const output = await generatePlan(
    {},
    { topic: "An equation" },
    { brief: "I know arithmetic" },
    {},
    {
      agent: async (_, prompt) => {
        calls++;
        if (calls === 1) return JSON.stringify(plan);
        assert.ok(
          prompt.includes(JSON.stringify(lessonPlanSchema.parse(plan))),
        );
        return JSON.stringify({
          changes: ["Kept the initial equation visible."],
          limitations: [],
          edits: [
            {
              path: "/title",
              valueJson: JSON.stringify("Revised explanation"),
            },
            { path: "/teaching", valueJson: JSON.stringify(teaching) },
          ],
        });
      },
      progress: async (stage) => stages.push(stage),
    },
  );
  assert.equal(calls, 2);
  assert.equal(output.title, "Revised explanation");
  assert.deepEqual(output.teaching, teaching);
  assert.equal(stages.length, 1);
  let failedCalls = 0;
  await assert.rejects(
    () =>
      generatePlan(
        {},
        {},
        {},
        {},
        {
          agent: async () => {
            if (++failedCalls === 1) return JSON.stringify(plan);
            throw new Error("Provider unavailable");
          },
        },
      ),
    /Provider unavailable/,
  );
  assert.equal(failedCalls, 2);
  await assert.rejects(
    () =>
      generatePlan(
        {},
        {},
        {},
        {},
        {
          agent: async (_, prompt) =>
            JSON.stringify(
              prompt.startsWith("Review a narrated")
                ? { changes: [], limitations: [], edits: [] }
                : plan,
            ),
        },
      ),
    /teaching plan/,
  );
});

test("actual static MP4 preserves measured speech, unequal holds and caption gaps", async (t) => {
  if (!(await available("ffmpeg")) || !(await available("ffprobe")))
    return t.skip("FFmpeg unavailable");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "teaching-media-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const lib = await new Library(root).init();
  const lesson = await createLesson(lib, { topic: "An equation" }, plan);
  const spoken = [0.7, 1.3, 0.9];
  let n = 0;
  const output = await renderLesson(
    lib,
    lesson,
    await lib.settings(),
    async () => {},
    {
      synthesize: async (_, file) =>
        run("ffmpeg", [
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:sample_rate=24000",
          "-t",
          String(spoken[n++]),
          file,
        ]),
    },
  );
  assert.equal(n, 3);
  const s = output.scenes[0];
  assert.deepEqual(
    s.reveals.map((r) => r.step),
    [0, 0, 1],
  );
  assert.ok(Math.abs(s.beats[2].start - 3.6) < 0.04);
  assert.ok(Math.abs(s.duration - 5.3) < 0.04);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(s.cues[i].duration - spoken[i]) < 0.01);
    assert.ok(
      s.beats[i].duration >= spoken[i] + scene.beats[i].pauseAfter - 0.001,
    );
  }
  const vtt = captions([s]);
  assert.match(vtt, /00:00:00.000 --> 00:00:00.700/);
  assert.match(vtt, /00:00:01.100 --> 00:00:02.400/);
  const video = path.join(root, "videos", output.video);
  const info = JSON.parse(
    (
      await run("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,width,height",
        "-of",
        "json",
        video,
      ])
    ).stdout,
  );
  assert.ok(Math.abs(Number(info.format.duration) - s.duration) < 0.15);
  assert.ok(info.streams.some((x) => x.codec_type === "audio"));
  assert.ok(info.streams.some((x) => x.width === 1280 && x.height === 720));
  await run("ffmpeg", ["-v", "error", "-i", video, "-f", "null", "-"]);
});

test("review edits are atomic, restricted to existing lesson fields, and revalidated", async () => {
  const draft = lessonPlanSchema.parse(plan);
  const updated = applyLessonEdits(draft, [
    { path: "/scenes/0/beats/1/pauseAfter", valueJson: "2.5" },
  ]);
  assert.equal(updated.scenes[0].beats[1].pauseAfter, 2.5);
  assert.equal(draft.scenes[0].beats[1].pauseAfter, 1.2);
  for (const path of [
    "/workerPid",
    "/scenes/99/title",
    "/scenes/length",
    "/scenes/0/__proto__/polluted",
  ])
    assert.throws(() =>
      applyLessonEdits(draft, [{ path, valueJson: '"bad"' }]),
    );
  let calls = 0;
  await assert.rejects(
    () =>
      generatePlan(
        {},
        {},
        {},
        {},
        {
          agent: async () =>
            JSON.stringify(
              ++calls === 1
                ? plan
                : {
                    changes: ["Changed one beat"],
                    limitations: [],
                    edits: [
                      {
                        path: "/scenes/0/beats/0/narration",
                        valueJson: '"Divergent narration"',
                      },
                    ],
                  },
            ),
        },
      ),
    /joined beat narration/,
  );
  assert.equal(calls, 2);
});
