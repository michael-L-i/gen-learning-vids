import { assetsSchema } from "./asset-schema.js";
import { z } from "zod";
import { animationSchema, validateAnimation } from "./animation/schema.js";
import { kokoroVoices } from "./speech-options.js";
import { zodToJsonSchema } from "zod-to-json-schema";

export const presentations = ["auto", "worked", "diagram", "code", "slides"];
const presentation = z.enum(presentations);
const palette = z.enum(["auto", "paper", "midnight", "sage"]);

export const settingsSchema = z.object({
  provider: z.enum(["codex", "claude"]).default("codex"),
  model: z.string().max(120).default(""),
  tts: z.enum(["kokoro", "system", "piper"]).default("kokoro"),
  kokoroVoice: z.enum(kokoroVoices.map((v) => v.id)).default("af_heart"),
  speechSpeed: z.number().min(0.75).max(1.5).default(1),
  voice: z.string().max(120).default(""),
  speechRate: z.number().int().min(100).max(260).default(175),
  piperModel: z.string().max(1000).default(""),
  style: palette.default("auto"),
  presentation: presentation.default("auto"),
});
export const createSchema = z.object({
  topic: z.string().trim().min(3).max(500),
  goal: z.string().trim().max(3000).default(""),
  sourceIds: z.array(z.string().uuid()).max(30).default([]),
  brief: z.string().max(20000).default(""),
  style: palette.optional(),
  presentation: presentation.optional(),
  visualBrief: z.string().trim().max(2000).default(""),
});
const coordinate = z.number().finite().min(-1e9).max(1e9);
export const visualContentSchema = z.discriminatedUnion("kind", [
  animationSchema,
  z.object({
    kind: z.literal("equation"),
    steps: z
      .array(
        z.object({
          tex: z.string().min(1).max(180),
          explanation: z.string().max(100),
        }),
      )
      .min(1)
      .max(4),
  }),
  z.object({
    kind: z.literal("code"),
    language: z.string().max(30),
    code: z
      .string()
      .min(1)
      .max(1400)
      .refine(
        (s) =>
          s.split("\n").length <= 14 &&
          s.split("\n").every((l) => l.length <= 76),
        "Code must fit 14 lines of 76 characters.",
      ),
    highlightLines: z.array(z.number().int().min(1).max(14)).max(8),
    output: z.string().max(180),
  }),
  z.object({
    kind: z.literal("diagram"),
    nodes: z
      .array(
        z.object({
          id: z.string().regex(/^[a-zA-Z0-9_-]{1,30}$/),
          label: z.string().min(1).max(60),
          x: z.number().min(0).max(100),
          y: z.number().min(0).max(100),
          shape: z.enum(["box", "ellipse"]),
        }),
      )
      .min(1)
      .max(8),
    edges: z
      .array(
        z.object({
          from: z.string().max(30),
          to: z.string().max(30),
          label: z.string().max(40),
        }),
      )
      .max(12),
  }),
  z.object({
    kind: z.literal("plot"),
    xLabel: z.string().max(50),
    yLabel: z.string().max(50),
    series: z
      .array(
        z.object({
          name: z.string().min(1).max(30),
          points: z
            .array(z.object({ x: coordinate, y: coordinate }))
            .min(2)
            .max(100),
        }),
      )
      .min(1)
      .max(3),
  }),
]);
export const sceneSchema = z
  .object({
    title: z.string().min(1).max(75),
    narration: z.string().min(10).max(1600),
    visual: z.enum([
      "animation",
      "concept",
      "steps",
      "comparison",
      "equation",
      "code",
      "diagram",
      "plot",
    ]),
    points: z.array(z.string().min(1).max(140)).min(1).max(4),
    takeaway: z.string().min(1).max(180),
    visualReason: z.string().max(250).default(""),
    content: visualContentSchema.nullable().default(null),
  })
  .superRefine((scene, ctx) => {
    if (
      ["animation", "equation", "code", "diagram", "plot"].includes(
        scene.visual,
      ) &&
      scene.content?.kind !== scene.visual
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: `A ${scene.visual} scene requires matching content.`,
      });
    if (scene.content && scene.content.kind !== scene.visual)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visual"],
        message: "Visual must match content.kind.",
      });
    if (scene.content?.kind === "animation") {
      try {
        validateAnimation(scene.content);
        if (
          scene.narration !==
          scene.content.beats.map((b) => b.narration).join(" ")
        )
          throw new Error("Narration must match animation beats.");
      } catch (e) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["content"],
          message: e.message,
        });
      }
    }
    if (scene.content?.kind === "diagram") {
      const ids = scene.content.nodes.map((n) => n.id);
      if (
        new Set(ids).size !== ids.length ||
        scene.content.edges.some(
          (e) => !ids.includes(e.from) || !ids.includes(e.to),
        )
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["content"],
          message:
            "Diagram node IDs must be unique and every edge must reference existing nodes.",
        });
    }
    if (
      scene.content?.kind === "code" &&
      scene.content.highlightLines.some(
        (n) => n > scene.content.code.split("\n").length,
      )
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: "Highlighted line does not exist.",
      });
  });
export const lessonPlanSchema = z.object({
  assets: assetsSchema,
  title: z.string().min(1).max(100),
  summary: z.string().min(1).max(400),
  learningObjective: z.string().min(1).max(300),
  assumedKnowledge: z.array(z.string().max(200)).max(6),
  tags: z.array(z.string().max(30)).min(1).max(4),
  scenes: z.array(sceneSchema).min(2).max(8),
  check: z.object({
    question: z.string().min(1).max(500),
    answer: z.string().min(1).max(1200),
  }),
});

// Derive the provider contract from the same schema used to validate imported plans.
export const planJsonSchema = zodToJsonSchema(lessonPlanSchema, {
  $refStrategy: "none",
});
delete planJsonSchema.$schema;
function strictObjects(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "object") {
    node.additionalProperties = false;
    node.required = Object.keys(node.properties || {});
  }
  delete node.default;
  for (const value of Object.values(node))
    if (typeof value === "object") {
      if (Array.isArray(value)) value.forEach(strictObjects);
      else strictObjects(value);
    }
}
strictObjects(planJsonSchema);
