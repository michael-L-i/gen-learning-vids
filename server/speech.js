import fs from "node:fs/promises";
import path from "node:path";
import { run } from "./process.js";
import { atomicWrite, defaultLibrary } from "./store.js";

export const kokoroModel = "onnx-community/Kokoro-82M-v1.0-ONNX";
const models = new Map();
let loadQueue = Promise.resolve();
// Kokoro's tokenizer truncates long input. Bound chunks before phonemization.
export function speechChunks(text, maxLength = 220) {
  const chunks = [];
  for (const { segment } of new Intl.Segmenter("en", {
    granularity: "sentence",
  }).segment(text)) {
    let current = "";
    for (const word of segment.trim().split(/\s+/).filter(Boolean)) {
      if (word.length > maxLength)
        throw new Error(
          "Narration contains a word too long for speech. Spell out symbols and formulas in spoken language.",
        );
      if (current && current.length + word.length + 1 > maxLength) {
        chunks.push(current);
        current = "";
      }
      current += (current ? " " : "") + word;
    }
    if (current) chunks.push(current);
  }
  if (!chunks.length) throw new Error("Narration is empty.");
  return chunks;
}
export function pcmWave(samples, rate = 24000) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(
      -1,
      Math.min(1, Number.isFinite(samples[i]) ? samples[i] : 0),
    );
    b.writeInt16LE(Math.round(v * (v < 0 ? 32768 : 32767)), 44 + i * 2);
  }
  return b;
}
async function loadKokoro(cacheDir) {
  cacheDir = path.resolve(
    cacheDir || path.join(defaultLibrary(), ".models", "kokoro"),
  );
  if (!models.has(cacheDir)) {
    const loading = loadQueue
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(cacheDir, { recursive: true, mode: 0o700 });
        const [{ KokoroTTS }, { env }] = await Promise.all([
          import("kokoro-js"),
          import("@huggingface/transformers"),
        ]);
        env.cacheDir = cacheDir;
        const model = await KokoroTTS.from_pretrained(kokoroModel, {
          device: "cpu",
          dtype: "q8",
        });
        return { model, queue: Promise.resolve() };
      });
    loadQueue = loading;
    models.set(cacheDir, loading);
    loading.catch(() => models.delete(cacheDir));
  }
  return models.get(cacheDir);
}
async function speakKokoro(text, output, settings, cacheDir) {
  const chunks = speechChunks(text);
  let runtime;
  try {
    runtime = await loadKokoro(cacheDir);
  } catch (e) {
    throw new Error(
      `Kokoro could not load. The first use needs internet access to download its model. Check the connection and retry. ${e.message}`,
    );
  }
  const task = runtime.queue
    .catch(() => {})
    .then(async () => {
      const audioChunks = [];
      for (const chunk of chunks) {
        const audio = await runtime.model.generate(chunk, {
          voice: settings.kokoroVoice || "af_heart",
          speed: settings.speechSpeed || 1,
        });
        if (!audio.audio?.length || audio.sampling_rate !== 24000)
          throw new Error("Kokoro returned invalid audio.");
        audioChunks.push(audio.audio);
      }
      const samples = new Float32Array(
        audioChunks.reduce((n, c) => n + c.length, 0),
      );
      let cursor = 0;
      for (const chunk of audioChunks) {
        samples.set(chunk, cursor);
        cursor += chunk.length;
      }
      await atomicWrite(output, pcmWave(samples));
    });
  runtime.queue = task;
  await task;
}
export async function speak(text, output, settings, { cacheDir } = {}) {
  if (settings.tts === "kokoro")
    return speakKokoro(text, output, settings, cacheDir);
  if (settings.tts === "piper") {
    if (!settings.piperModel)
      throw new Error(
        "Choose a Piper voice model in Settings before generating a lesson.",
      );
    await run(
      "piper",
      ["--model", settings.piperModel, "--output_file", output],
      { input: text },
    );
  } else if (process.platform === "darwin") {
    const input = output + ".txt";
    await atomicWrite(input, text);
    const args = [
      "-f",
      input,
      "-o",
      output,
      "--data-format=LEI16@22050",
      "-r",
      String(settings.speechRate),
    ];
    if (settings.voice) args.push("-v", settings.voice);
    await run("say", args);
    await fs.unlink(input);
  } else {
    const args = ["-w", output, "-s", String(settings.speechRate), "--stdin"];
    if (settings.voice) args.push("-v", settings.voice);
    await run("espeak", args, { input: text });
  }
}
