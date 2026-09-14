import { readFileSync } from "node:fs";
import { z } from "zod";

// One source of guidance for provider planning and the installed authoring skill.
export const teachingGuide = readFileSync(
  new URL(
    "../plugins/lesson-library/skills/lesson-library/references/teaching.md",
    import.meta.url,
  ),
  "utf8",
);

const notes = z.array(z.string().min(1).max(400)).max(12);
export const teachingSchema = z.object({
  learner: z.object({
    established: notes,
    assumed: notes,
    uncertain: notes,
  }),
  focus: z.string().min(1).max(600),
  skip: notes,
  approach: z.string().min(1).max(1200),
  pacing: z.string().min(1).max(600),
  symbols: z
    .array(
      z.object({
        symbol: z.string().min(1).max(60),
        meaning: z.string().min(1).max(200),
        unit: z.string().max(60),
      }),
    )
    .max(30),
});

export const reviewSchema = z.object({
  changes: notes,
  limitations: notes,
});

export const narrationBeatSchema = z.object({
  id: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/)
    .max(60),
  narration: z.string().trim().min(1).max(1800),
  pauseAfter: z.number().min(0).max(10).default(0.4),
});

export function validateNarrationBeats(scene, ctx) {
  if (!scene.beats?.length) return;
  if (new Set(scene.beats.map((b) => b.id)).size !== scene.beats.length)
    ctx.addIssue({
      code: "custom",
      path: ["beats"],
      message: "Narration beat IDs must be unique within a chapter",
    });
  if (scene.beats.map((b) => b.narration).join(" ") !== scene.narration)
    ctx.addIssue({
      code: "custom",
      path: ["narration"],
      message: "Chapter narration must equal the joined beat narration",
    });
}

// A review edits only changed values; regenerating every drawing node adds
// substantial latency and can accidentally damage correct visual geometry.
export const revisionSchema = reviewSchema.extend({
  edits: z
    .array(
      z.object({
        path: z
          .string()
          .regex(
            /^\/(?:[A-Za-z][A-Za-z0-9]*|0|[1-9][0-9]*)(?:\/(?:[A-Za-z][A-Za-z0-9]*|0|[1-9][0-9]*))*$/,
          )
          .max(300),
        valueJson: z.string().min(1).max(100000),
      }),
    )
    .max(40),
});

export function applyLessonEdits(draft, edits) {
  const plan = structuredClone(draft);
  const roots = new Set([
    "title",
    "summary",
    "learningObjective",
    "assumedKnowledge",
    "tags",
    "scenes",
    "check",
    "teaching",
    "sources",
    "assets",
  ]);
  for (const edit of edits) {
    const parts = edit.path.slice(1).split("/");
    if (
      !edit.path.startsWith("/") ||
      !roots.has(parts[0]) ||
      parts.some((p) => ["__proto__", "prototype", "constructor"].includes(p))
    )
      throw new Error(`Invalid lesson review path: ${edit.path}`);
    let parent = plan;
    for (const key of parts.slice(0, -1)) {
      if (!parent || !Object.hasOwn(parent, key))
        throw new Error(`Lesson review path does not exist: ${edit.path}`);
      parent = parent[key];
    }
    const key = parts.at(-1);
    if (
      !parent ||
      typeof parent !== "object" ||
      !Object.hasOwn(parent, key) ||
      (Array.isArray(parent) && !/^(0|[1-9][0-9]*)$/.test(key))
    )
      throw new Error(`Lesson review path does not exist: ${edit.path}`);
    parent[key] = JSON.parse(edit.valueJson);
  }
  return plan;
}
