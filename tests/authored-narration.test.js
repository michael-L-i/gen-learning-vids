import test from "node:test";
import assert from "node:assert/strict";
import { authoredManifest } from "../server/authored/render.js";

const manifest = {
  title: "Timing",
  summary: "Timing",
  learningObjective: "Timing",
  assumedKnowledge: [],
  tags: [],
  sources: [],
  check: { question: "Q", answer: "A" },
  scenes: [
    {
      title: "Scene",
      narration: "First. Second.",
      seconds: 1,
      beats: [
        { id: "first", narration: "First." },
        { id: "second", narration: "Second." },
      ],
    },
  ],
};
test("authored beats reject divergent transcripts, duplicate IDs and invalid pauses", () => {
  assert.equal(
    authoredManifest.parse(manifest).scenes[0].beats[0].pauseAfter,
    0.4,
  );
  for (const mutate of [
    (m) => {
      m.scenes[0].narration = "Something else.";
    },
    (m) => {
      m.scenes[0].beats[1].id = "first";
    },
    (m) => {
      m.scenes[0].beats[0].pauseAfter = -1;
    },
  ]) {
    const value = structuredClone(manifest);
    mutate(value);
    assert.equal(authoredManifest.safeParse(value).success, false);
  }
});
