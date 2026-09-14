import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { sourceReference } from "./contracts.js";
/** Prepare a bounded local raster and provenance; no network access or silent resizing.
 * EXIF orientation is applied explicitly. Regions thereafter address prepared pixels.
 */
export async function prepareInspectionImage(
  input,
  outputDirectory,
  { source } = {},
) {
  const reference = sourceReference(source),
    output = path.resolve(outputDirectory),
    bytes = await fs.readFile(input),
    original = await sharp(bytes, { limitInputPixels: 40000000 }).metadata();
  if ((original.pages ?? 1) !== 1)
    throw new Error("Prepare a single source page/frame at a time");
  const { data, info } = await sharp(bytes, { limitInputPixels: 40000000 })
    .rotate()
    .png()
    .toBuffer({ resolveWithObject: true });
  if (info.width > 16384 || info.height > 16384)
    throw new Error("Prepared dimensions must not exceed 16384 pixels");
  await fs.mkdir(path.dirname(output), { recursive: true });
  try {
    await fs.access(output);
    throw new Error("Output directory already exists; choose a new directory");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = await fs.mkdtemp(
    path.join(path.dirname(output), ".inspection-"),
  );
  const manifest = {
    image: "image.png",
    width: info.width,
    height: info.height,
    source: reference,
    originalSha256: createHash("sha256").update(bytes).digest("hex"),
    sha256: createHash("sha256").update(data).digest("hex"),
    preparation: "EXIF orientation applied; PNG conversion; no resizing",
    files: ["image.png", "source.json"],
  };
  try {
    await fs.writeFile(path.join(temporary, "image.png"), data);
    await fs.writeFile(
      path.join(temporary, "source.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    await fs.rename(temporary, output);
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return manifest;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [input, output, metadata] = process.argv.slice(2);
  if (!input || !output || !metadata)
    throw new Error(
      "Usage: node server/inspection/prepare.js INPUT OUTPUT_DIRECTORY SOURCE_JSON",
    );
  console.log(
    JSON.stringify(
      await prepareInspectionImage(input, output, {
        source: JSON.parse(await fs.readFile(metadata, "utf8")),
      }),
      null,
      2,
    ),
  );
}
