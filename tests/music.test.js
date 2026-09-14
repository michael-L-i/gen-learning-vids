import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { musicPhrase, placePhrase, pitchInfo } from "../server/music/index.js";
import {
  validateAudioMetadata,
  encodeAudioChunk,
} from "../server/browser/audio.js";
import { renderBrowser } from "../server/browser/render.js";
import { Library } from "../server/store.js";
import { pcmWave } from "../server/speech.js";
const phrase = (tempo) =>
  musicPhrase({
    tempo,
    notes: [
      { id: "a", pitch: "C5", beats: 1 },
      { id: "b", pitch: "D5", beats: 0.5 },
      { id: "c", pitch: "E5", beats: 0.5 },
      { id: "d", pitch: "G5", beats: 2 },
    ],
  });

test("pitch spelling, beat durations and absolute note activation share one model", () => {
  assert.equal(pitchInfo("A4").frequency, 440);
  assert.equal(pitchInfo("C#4").midi, pitchInfo("Db4").midi);
  assert.equal(pitchInfo("C#4").key, "c#/4");
  const p = phrase(60),
    q = placePhrase(p, 3);
  assert.deepEqual(
    p.events.map((e) => e.onset),
    [0, 1, 1.5, 2],
  );
  assert.equal(p.duration, 4);
  assert.deepEqual(q.activeAt(4.5), ["c"]);
  assert.deepEqual(q.activeAt(3), ["a"]);
  assert.deepEqual(q.activeAt(7), []);
  assert.deepEqual(q.activeAt(2.99), []);
  assert.ok(Object.isFrozen(p.events[0]));
  assert.equal(phrase(120).duration, 2);
  assert.deepEqual(placePhrase(p, 0).activeAt(0), ["a"]);
});
test("invalid pitches, ambiguous durations, duplicate IDs and incomplete bars are rejected", () => {
  for (const p of ["H4", "C##4", "C9", "A/4", "c4", undefined])
    assert.throws(() => pitchInfo(p));
  for (const tempo of [0, NaN, 241]) assert.throws(() => phrase(tempo));
  assert.throws(() =>
    musicPhrase({ notes: [{ id: "a", pitch: "C4", beats: 3 }] }),
  );
  assert.throws(() =>
    musicPhrase({ notes: [{ id: "a", pitch: "C4", beats: 1 }] }),
  );
  assert.throws(() =>
    musicPhrase({
      notes: [
        { id: "a", pitch: "C4", beats: 2 },
        { id: "a", pitch: "D4", beats: 2 },
      ],
    }),
  );
  assert.throws(() => placePhrase(phrase(90), -1));
});
test("audio transport rejects bad rates, long buffers, nonfinite samples and clipping", () => {
  const good = { sampleRate: 24000, channels: 1, frames: 24000 };
  validateAudioMetadata(good, 1);
  for (const bad of [
    { sampleRate: 96000 },
    { channels: 3 },
    { frames: 24001 },
    { frames: 0 },
  ])
    assert.throws(() => validateAudioMetadata({ ...good, ...bad }, 1));
  assert.throws(() => validateAudioMetadata(good, 181));
  for (const v of [NaN, Infinity, 1.01, -1.01])
    assert.throws(() =>
      encodeAudioChunk(Buffer.alloc(46), [v], {
        offset: 0,
        channel: 0,
        channels: 1,
      }),
    );
  const b = Buffer.alloc(52);
  encodeAudioChunk(b, [-1, 1], { offset: 0, channel: 1, channels: 2 });
  assert.equal(b.readInt16LE(46), -32768);
  assert.equal(b.readInt16LE(50), 32767);
});
test("VexFlow and Tone produce synchronized notation and audible music in encoded narration holds", async (t) => {
  if (!process.env.LEARNVID_BROWSER_TEST)
    return t.skip("Set LEARNVID_BROWSER_TEST=1 for music integration");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "music-browser-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  await fs.mkdir(source);
  const beats = [
    { id: "listen", narration: "Listen now.", pauseAfter: 1.5 },
    { id: "explain", narration: "The rhythm ends.", pauseAfter: 0.3 },
  ];
  await fs.writeFile(
    path.join(source, "lesson.json"),
    JSON.stringify({
      title: "Music integration",
      summary: "Audible timed music",
      learningObjective: "Hear the notes",
      assumedKnowledge: [],
      tags: [],
      sources: [],
      check: { question: "Music?", answer: "Yes" },
      scenes: [
        {
          title: "Rhythm",
          seconds: 1,
          beats,
          narration: beats.map((b) => b.narration).join(" "),
        },
      ],
    }),
  );
  await fs.writeFile(
    path.join(source, "scene.js"),
    `
 import {musicPhrase,placePhrase,musicNotation,renderMusicAudio} from '@lesson-library/music';
 export async function buildScene(root,ctx){
  const p=musicPhrase({tempo:240,notes:[{id:'a',pitch:'C5',beats:1},{id:'b',pitch:'D5',beats:1},{id:'c',pitch:'E5',beats:1},{id:'d',pitch:'C5',beats:1}]});
  for(const accidental of ['Bb4','B#4']){
    const box=document.createElement('div');root.append(box);
    const checked=await musicNotation(box,{phrase:musicPhrase({notes:[{id:'altered',pitch:accidental,beats:2},{id:'natural',pitch:'B4',beats:2}]})});
    if(!checked.notes[1].getModifiers().some(m=>m.type==='n'))throw Error('B accidental needs a natural cancellation');
    box.remove();
  }
  const score=await musicNotation(root,{phrase:p});
  const placed=placePhrase(p,ctx.beats[0].spoken+.2);
  score.highlight(placed.activeAt(.96));
  if(root.querySelector('[data-music-note="c"]').getAttribute('fill')!=='#007e80')throw Error('Forward highlight failed');
  score.highlight(placed.activeAt(.42));
  if(root.querySelector('[data-music-note="a"]').getAttribute('fill')!=='#007e80'||root.querySelector('[data-music-note="c"]').getAttribute('fill')!=='#233746')throw Error('Backward highlight failed');
  let exports=0;
  return {frameKey:t=>placed.activeAt(t),update(t){score.highlight(placed.activeAt(t));},async exportAudio(){if(++exports!==1)throw Error('Audio exported repeatedly');return renderMusicAudio({events:placed.events,duration:ctx.duration});}};
 }`,
  );
  const lib = await new Library(path.join(root, "library")).init();
  const result = await renderBrowser(lib, source, {
    install: false,
    progress: () => {},
    synthesize: async (text, file) => {
      const signal = Float32Array.from(
        { length: 4800 },
        (_, i) => 0.08 * Math.sin((2 * Math.PI * 220 * i) / 24000),
      );
      await fs.writeFile(file, pcmWave(signal));
    },
  });
  assert.equal(result.status, "ready");
  assert.equal(result.duration, 2.2);
  assert.equal(result.scenes[0].beats[1].start, 1.7);
  const video = path.join(lib.root, "videos", result.video);
  const raw = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      video,
      "-vn",
      "-f",
      "f32le",
      "-ar",
      "24000",
      "-ac",
      "1",
      "pipe:1",
    ],
    { maxBuffer: 4e6 },
  );
  const samples = new Float32Array(
    raw.buffer,
    raw.byteOffset,
    raw.byteLength / 4,
  );
  const window = (a, b) =>
    samples.slice(Math.round(a * 24000), Math.round(b * 24000));
  const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
  assert.ok(rms(window(0.28, 0.36)) < 0.001, "Music must not start early");
  assert.ok(
    rms(window(0.46, 0.55)) > 0.015,
    "Encoded music must be audible in the narration hold",
  );
  assert.ok(
    Math.abs(rms(window(0.04, 0.16)) - 0.08 / Math.sqrt(2)) < 0.006,
    "Narration level and start must survive the mix",
  );
  assert.ok(
    rms(window(1.74, 1.86)) > 0.045,
    "Second narration beat must retain its timing",
  );
  const magnitude = (a, hz) => {
    let re = 0,
      im = 0;
    for (let i = 0; i < a.length; i++) {
      re += a[i] * Math.cos((2 * Math.PI * hz * i) / 24000);
      im += a[i] * Math.sin((2 * Math.PI * hz * i) / 24000);
    }
    return Math.hypot(re, im) / a.length;
  };
  const music = window(0.46, 0.59);
  assert.ok(
    magnitude(music, 523.251) > 4 * magnitude(music, 220),
    "Hold should contain the intended C5 pitch, not speech",
  );
  const work = path.join(lib.lessonDir(result.id), "browser");
  const report = JSON.parse(
    await fs.readFile(path.join(work, "render-report.json")),
  );
  assert.equal(report.scenes[0].audio.sampleRate, 24000);
  assert.ok(report.scenes[0].audio.peak > 0.02);
  assert.match(
    await fs.readFile(
      path.join(lib.lessonDir(result.id), "captions.vtt"),
      "utf8",
    ),
    /00:00:01.700 --> 00:00:01.900/,
  );
});
