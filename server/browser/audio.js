import fs from "node:fs/promises";

export function validateAudioMetadata(
  { sampleRate, channels, frames },
  duration,
) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 180)
    throw new Error("Exported audio chapters must be at most 180 seconds");
  if (![24000, 44100, 48000].includes(sampleRate))
    throw new Error("Exported audio sampleRate must be 24000, 44100 or 48000");
  if (!Number.isInteger(channels) || channels < 1 || channels > 2)
    throw new Error("Exported audio must have one or two channels");
  if (
    !Number.isInteger(frames) ||
    frames < 1 ||
    frames > Math.ceil(duration * sampleRate)
  )
    throw new Error(
      "Exported audio must be nonempty and fit the measured chapter duration",
    );
}

export function encodeAudioChunk(wave, samples, { offset, channel, channels }) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    if (!Number.isFinite(v) || Math.abs(v) > 1)
      throw new Error(
        "Exported audio samples must be finite and within [-1, 1]",
      );
    peak = Math.max(peak, Math.abs(v));
    wave.writeInt16LE(
      Math.round(v * (v < 0 ? 32768 : 32767)),
      44 + ((offset + i) * channels + channel) * 2,
    );
  }
  return peak;
}

export async function exportSceneAudio(page, { duration, file }) {
  const meta = await page.evaluate(async () => {
    if (typeof window.lessonScene.exportAudio !== "function") return null;
    const audio = await window.lessonScene.exportAudio();
    if (!audio || !Array.isArray(audio.channels) || !audio.channels.length)
      throw new Error(
        "exportAudio must return {sampleRate, channels: [Float32Array]}",
      );
    if (
      !audio.channels.every(
        (c) =>
          c instanceof Float32Array && c.length === audio.channels[0].length,
      )
    )
      throw new Error(
        "Exported audio channels must be equally sized Float32Arrays",
      );
    window.__lessonExportedAudio = audio;
    return {
      sampleRate: audio.sampleRate,
      channels: audio.channels.length,
      frames: audio.channels[0].length,
    };
  });
  if (meta === null) return null;
  validateAudioMetadata(meta, duration);
  const { sampleRate, channels, frames } = meta;
  const wave = Buffer.alloc(44 + frames * channels * 2);
  wave.write("RIFF");
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write("WAVEfmt ", 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(channels, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate * channels * 2, 28);
  wave.writeUInt16LE(channels * 2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(wave.length - 44, 40);
  let peak = 0;
  for (let channel = 0; channel < channels; channel++)
    for (let offset = 0; offset < frames; offset += 32768) {
      const samples = await page.evaluate(
        ({ channel, offset }) =>
          Array.from(
            window.__lessonExportedAudio.channels[channel].subarray(
              offset,
              offset + 32768,
            ),
          ),
        { channel, offset },
      );
      peak = Math.max(
        peak,
        encodeAudioChunk(wave, samples, { offset, channel, channels }),
      );
    }
  await fs.writeFile(file, wave);
  await page.evaluate(() => {
    delete window.__lessonExportedAudio;
  });
  return { ...meta, peak };
}
