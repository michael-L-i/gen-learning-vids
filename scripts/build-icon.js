import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { run } from "../server/process.js";

const root = new URL("../build/", import.meta.url);
const input = await fs.readFile(new URL("icon.svg", root));
await sharp(input)
  .resize(1024, 1024)
  .png()
  .toFile(new URL("icon.png", root).pathname);
if (process.platform === "darwin") {
  const dir = new URL("icon.iconset/", root).pathname;
  await fs.mkdir(dir, { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      await sharp(input)
        .resize(size * scale, size * scale)
        .png()
        .toFile(
          path.join(dir, `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`),
        );
    }
  }
  await run("iconutil", [
    "-c",
    "icns",
    "-o",
    new URL("icon.icns", root).pathname,
    dir,
  ]);
  await fs.rm(dir, { recursive: true });
}
