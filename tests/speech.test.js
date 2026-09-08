import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { speechChunks, pcmWave } from "../server/speech.js";
import { settingsSchema } from "../server/schema.js";
import { startServer } from "../server/app.js";
test("neural narration chunks retain all words without silent truncation", () => {
  const text =
    "A long derivation includes every intermediate result and keeps the units explicit. ".repeat(
      30,
    );
  const chunks = speechChunks(text);
  assert.ok(chunks.every((s) => s.length <= 220));
  assert.equal(chunks.join(" "), text.trim());
  assert.throws(() => speechChunks("x".repeat(221)), /too long/);
  assert.throws(() => speechChunks(" "), /empty/);
});
test("neural audio is written as valid mono PCM and voice settings are validated", () => {
  const wav = pcmWave(new Float32Array([-2, -0.5, 0, 0.5, 2]));
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt32LE(40), 10);
  assert.equal(wav.readInt16LE(44), -32768);
  assert.equal(wav.readInt16LE(52), 32767);
  assert.equal(settingsSchema.parse({}).tts, "kokoro");
  assert.equal(
    settingsSchema.safeParse({ kokoroVoice: "missing" }).success,
    false,
  );
  assert.equal(
    settingsSchema.parse({ tts: "system", voice: "Samantha" }).voice,
    "Samantha",
  );
});
test("voice previews use unsaved settings, cache audio, and leave preferences untouched", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "speech-preview-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let calls = 0,
    used;
  const app = await startServer({
    root,
    port: 0,
    synthesize: async (_, file, settings) => {
      calls++;
      used = settings;
      await fs.writeFile(file, pcmWave(new Float32Array(2400)));
    },
  });
  t.after(() => app.close());
  const { token } = await (await fetch(app.url + "/api/bootstrap")).json();
  const request = () =>
    fetch(app.url + "/api/speech/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Lesson-Token": token },
      body: JSON.stringify({
        settings: { kokoroVoice: "bf_emma", speechSpeed: 1.15 },
      }),
    });
  const data = await (await request()).json();
  assert.equal(used.kokoroVoice, "bf_emma");
  assert.equal(used.speechSpeed, 1.15);
  assert.equal((await app.library.settings()).kokoroVoice, "af_heart");
  assert.equal((await fetch(app.url + data.url)).status, 200);
  await request();
  assert.equal(calls, 1);
  const bad = await fetch(app.url + "/api/speech/previews/settings.json");
  assert.equal(bad.status, 404);
});
