import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSchema, lessonPlanSchema } from './schema.js';
import { generatePlan, answerQuestion } from './providers.js';
import { renderLesson, thumbnailSvg } from './render.js';
import sharp from 'sharp';
import { writeJson } from './store.js';

export async function createLesson(library, input, plan) {
  const request = createSchema.parse(input); const settings = await library.settings();
  const sources = await Promise.all(request.sourceIds.map(id => library.source(id)));
  const budgetPerSource = Math.min(15000, Math.floor(45000 / Math.max(1, sources.length)));
  const context = { profile: (await library.profile()).slice(0, 15000), brief: request.brief,
    sources: sources.map(s => ({ id: s.id, title: s.title, excerpt: s.content.slice(0, budgetPerSource), truncated: s.content.length > budgetPerSource })) };
  const id = randomUUID(); const now = new Date().toISOString();
  const lesson = { id, title: request.topic, summary: request.goal || 'A lesson shaped around your question.', request, context, settings,
    style: request.style || settings.style, status: 'queued', stage: 'Waiting to begin', progress: 0, tags: [], scenes: [], createdAt: now, updatedAt: now, ...(plan ? lessonPlanSchema.parse(plan) : {}) };
  await library.saveLesson(lesson);
  await writeJson(path.join(library.lessonDir(id), 'context.json'), context);
  await sharp(Buffer.from(thumbnailSvg(lesson.title, lesson.style))).png().toFile(path.join(library.lessonDir(id), 'thumbnail.png'));
  return lesson;
}
export function startWorker(library, id) {
  const cli = fileURLToPath(new URL('../bin/learnvid.js', import.meta.url));
  const child = spawn(process.execPath, [cli, 'run-job', id, '--library', library.root], {
    detached: true, stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  child.on('error', async e => { const lesson = await library.lesson(id); await library.saveLesson({ ...lesson, status: 'error', stage: 'Could not start generation', error: e.message }); });
  child.unref(); return child.pid;
}
export async function runJob(library, id, { planGenerator = generatePlan, renderer = renderLesson } = {}) {
  return library.withLessonLock(id, async () => {
    let lesson = await library.lesson(id);
    if (lesson.status === 'ready') return lesson;
    const update = async values => { lesson = { ...lesson, ...values, updatedAt: new Date().toISOString() }; await library.saveLesson(lesson); };
    try {
      await update({ status: 'generating', stage: 'Planning your lesson', progress: 5, error: null, workerPid: process.pid });
      if (!lesson.scenes.length) { const plan = await planGenerator(library, lesson.request, lesson.context, lesson.settings); await update(lessonPlanSchema.parse(plan)); }
      await writeJson(path.join(library.lessonDir(id), 'storyboard.json'), lessonPlanSchema.parse(lesson));
      await update({ status: 'rendering', stage: 'Preparing narration', progress: 12 });
      const result = await renderer(library, lesson, lesson.settings, (stage, progress) => update({ stage, progress }));
      await update({ ...result, workerPid: null }); return lesson;
    } catch (error) { await update({ status: 'error', stage: 'This lesson needs attention', error: error.message, workerPid: null }); throw error; }
  });
}
export async function askLesson(library, id, question, seconds = 0) {
  if (typeof question !== 'string' || !question.trim() || question.length > 3000) throw new Error('Ask a question under 3,000 characters.');
  return library.withLessonLock(id, async () => {
    const lesson = await library.lesson(id); if (lesson.status !== 'ready') throw new Error('Wait until this lesson is ready before asking a question.');
    const messages = await library.chat(id);
    const answer = await answerQuestion(library, lesson, messages, question, seconds);
    messages.push({ id: randomUUID(), role: 'user', content: question, seconds, createdAt: new Date().toISOString() },
      { id: randomUUID(), role: 'assistant', content: answer, createdAt: new Date().toISOString() });
    await writeJson(path.join(library.lessonDir(id), 'chat.json'), messages); return messages;
  });
export async function retryLesson(library, id) {
  return library.withLessonLock(id, async () => {
    const lesson = await library.lesson(id);
    if (lesson.status === 'ready') throw new Error('This lesson is already ready.');
    if (lesson.workerPid) { try { process.kill(lesson.workerPid, 0); throw new Error('This lesson is still being generated.'); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
    const settings = await library.settings();
    await library.saveLesson({ ...lesson, settings, status: 'queued', stage: 'Waiting to retry', progress: 0, error: null, workerPid: null });
    return id;
  });
}
