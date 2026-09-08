import { z } from 'zod';

export const settingsSchema = z.object({
  provider: z.enum(['codex', 'claude']).default('codex'),
  model: z.string().max(120).default(''),
  tts: z.enum(['system', 'piper']).default('system'),
  voice: z.string().max(120).default(''),
  speechRate: z.number().int().min(100).max(260).default(175),
  piperModel: z.string().max(1000).default(''),
  style: z.enum(['paper', 'midnight', 'sage']).default('paper'),
});
export const createSchema = z.object({
  topic: z.string().trim().min(3).max(500),
  goal: z.string().trim().max(3000).default(''),
  sourceIds: z.array(z.string().uuid()).max(30).default([]),
  brief: z.string().max(20000).default(''),
  style: z.enum(['paper', 'midnight', 'sage']).optional(),
});
export const sceneSchema = z.object({
  title: z.string().min(1).max(75),
  narration: z.string().min(10).max(1600),
  visual: z.enum(['concept', 'steps', 'comparison']),
  points: z.array(z.string().min(1).max(140)).min(1).max(4),
  takeaway: z.string().min(1).max(180),
});
export const lessonPlanSchema = z.object({
  title: z.string().min(1).max(100),
  summary: z.string().min(1).max(400),
  learningObjective: z.string().min(1).max(300),
  assumedKnowledge: z.array(z.string().max(200)).max(6),
  tags: z.array(z.string().max(30)).min(1).max(4),
  scenes: z.array(sceneSchema).min(2).max(8),
  check: z.object({ question: z.string().min(1).max(500), answer: z.string().min(1).max(1200) }),
});

// Strict JSON Schema for Codex's structured-output mode (all properties required).
export const planJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string' }, summary: { type: 'string' }, learningObjective: { type: 'string' },
    assumedKnowledge: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
    scenes: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { title: { type: 'string' }, narration: { type: 'string' }, visual: { type: 'string', enum: ['concept', 'steps', 'comparison'] }, points: { type: 'array', items: { type: 'string' } }, takeaway: { type: 'string' } },
      required: ['title', 'narration', 'visual', 'points', 'takeaway'] } },
    check: { type: 'object', additionalProperties: false, properties: { question: { type: 'string' }, answer: { type: 'string' } }, required: ['question', 'answer'] },
  }, required: ['title', 'summary', 'learningObjective', 'assumedKnowledge', 'tags', 'scenes', 'check'],
};
