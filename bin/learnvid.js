#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { Library } from '../server/store.js';
import { createLesson, runJob, startWorker, askLesson, retryLesson } from '../server/engine.js';
import { doctor } from '../server/providers.js';
import { textFromExport, scanNotes, importNotes } from '../server/imports.js';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  library: { type: 'string' }, port: { type: 'string' }, dev: { type: 'boolean' }, open: { type: 'boolean' },
  wait: { type: 'boolean' }, source: { type: 'string', multiple: true }, goal: { type: 'string' },
  brief: { type: 'string' }, style: { type: 'string' }, plan: { type: 'string' }, help: { type: 'boolean' },
} });
const [command, ...args] = positionals;
const print = value => console.log(JSON.stringify(value, null, 2));
const openUrl = url => { const bin = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'; const child = spawn(bin, [url], { stdio: 'ignore' }); child.on('error', () => console.log(`Open ${url}`)); child.unref(); };
async function main() {
  if (!command || values.help || command === 'help') {
    console.log(`Lesson Library — one library, any entry point

learnvid serve [--open] [--dev] [--port 4317]
learnvid create "Topic" [--goal "What to understand"] [--source FILE] [--brief FILE] [--style paper|midnight|sage] [--wait]
learnvid create "Topic" --plan FILE [--wait]   Render an agent-authored lesson JSON
learnvid list
learnvid show ID
learnvid ask ID "Question about the lesson"
learnvid retry ID [--wait]
learnvid import FILE
learnvid scan DIRECTORY
learnvid import-notes DIRECTORY RELATIVE_PATH...
learnvid profile [FILE]                      Read profile, or replace with FILE
learnvid settings [FILE]                     Read settings, or replace with JSON FILE
learnvid doctor
learnvid open

All commands accept --library PATH (or LEARNVID_HOME). Default: ~/Lesson Library.
Creation runs in the background unless --wait is provided. Source files are copied into the private library.
`); return;
  }
  const library = await new Library(values.library).init();
  switch (command) {
    case 'serve': {
      const { startServer } = await import('../server/app.js'); const instance = await startServer({ root: library.root, port: values.port === undefined ? 4317 : Number(values.port), dev: values.dev });
      console.log(`Lesson Library → ${instance.url}\nLibrary → ${library.root}`); if (values.open) openUrl(instance.url);
      const stop = async () => { await instance.close(); process.exit(0); }; process.once('SIGINT', stop); process.once('SIGTERM', stop); break;
    }
    case 'create': {
      const sourceIds = [];
      for (const file of values.source || []) { const content = textFromExport(await fs.readFile(file, 'utf8'), file); const s = await library.addSource({ title: path.basename(file), content, origin: path.resolve(file) }); sourceIds.push(s.id); }
      const plan = values.plan ? JSON.parse(await fs.readFile(values.plan, 'utf8')) : undefined;
      const lesson = await createLesson(library, { topic: args.join(' ') || plan?.title, goal: values.goal, style: values.style, sourceIds, brief: values.brief ? await fs.readFile(values.brief, 'utf8') : '' }, plan);
      if (values.wait) print(await runJob(library, lesson.id)); else { startWorker(library, lesson.id); print({ id: lesson.id, status: 'queued', library: library.root }); } break;
    }
    case 'run-job': await runJob(library, args[0]); break;
    case 'list': print((await library.lessons()).map(({ id, title, status, duration, stage }) => ({ id, title, status, duration, stage }))); break;
    case 'show': print(await library.lesson(args[0])); break;
    case 'ask': print(await askLesson(library, args[0], args.slice(1).join(' '))); break;
    case 'retry': await retryLesson(library, args[0]); if (values.wait) print(await runJob(library, args[0])); else { startWorker(library, args[0]); print({ status: 'queued' }); } break;
    case 'doctor': print({ library: library.root, tools: await doctor(), settings: await library.settings() }); break;
    case 'import': { const file = args[0]; print(await library.addSource({ title: path.basename(file), content: textFromExport(await fs.readFile(file, 'utf8'), file), origin: path.resolve(file) })); break; }
    case 'scan': print(await scanNotes(args[0])); break;
    case 'import-notes': print(await importNotes(library, args[0], args.slice(1))); break;
    case 'profile': if (args[0]) { await library.saveProfile(await fs.readFile(args[0], 'utf8')); print({ saved: true }); } else console.log(await library.profile()); break;
    case 'settings': if (args[0]) print(await library.saveSettings(JSON.parse(await fs.readFile(args[0], 'utf8')))); else print(await library.settings()); break;
    case 'open': { let url = 'http://127.0.0.1:4317'; try { url = JSON.parse(await fs.readFile(path.join(library.root, '.server.json'), 'utf8')).url; } catch {} openUrl(url); break; }
    default: throw new Error(`Unknown command: ${command}. Run learnvid help.`);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
