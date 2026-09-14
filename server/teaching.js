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
