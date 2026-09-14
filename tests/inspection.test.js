import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  regionRect,
  interpolateRegion,
  textSpan,
  sourceReference,
} from "../server/inspection/contracts.js";
import { prepareInspectionImage } from "../server/inspection/prepare.js";
const source = {
  id: "synthetic",
  title: "Generated test image",
  url: "https://example.com/source",
  attribution: "Test author",
  rights: "Test fixture",
};
test("image regions and interpolation keep source pixel coordinates explicit", () => {
  assert.deepEqual(
    regionRect({ x: 0, y: 0, width: 100, height: 50 }, 100, 50),
    { x: 0, y: 0, width: 100, height: 50 },
  );
  assert.throws(
    () => regionRect({ x: 99, y: 0, width: 2, height: 1 }, 100, 50),
    /inside/,
  );
  assert.throws(() =>
    regionRect({ x: 0, y: 0, width: NaN, height: 1 }, 100, 50),
  );
  const a = { x: 0, y: 0, width: 100, height: 100 },
    b = { x: 20, y: 40, width: 20, height: 20 };
  assert.deepEqual(interpolateRegion(a, b, 0.5), {
    x: 10,
    y: 20,
    width: 60,
    height: 60,
  });
  assert.throws(() => interpolateRegion(a, b, 2));
});
test("UTF-16 annotations verify exact quote and refuse split surrogate pairs", () => {
  const text = "A ✈️ plane and 🚀.";
  const start = text.indexOf("plane");
  assert.deepEqual(textSpan(text, { start, end: start + 5, quote: "plane" }), {
    start,
    end: start + 5,
    text: "plane",
  });
  assert.throws(
    () => textSpan(text, { start, end: start + 5, quote: "train" }),
    /quote/,
  );
  const rocket = text.indexOf("🚀");
  assert.throws(
    () => textSpan(text, { start: rocket, end: rocket + 1 }),
    /surrogate/,
  );
  assert.equal(textSpan(text, { start: rocket, end: rocket + 2 }).text, "🚀");
});
test("source references preserve attribution and local image preparation preserves pixels and provenance", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "inspection-prep-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "input.png");
  await sharp({
    create: { width: 41, height: 23, channels: 3, background: "#123456" },
  })
    .png()
    .toFile(file);
  const result = await prepareInspectionImage(
    file,
    path.join(root, "prepared"),
    { source },
  );
  assert.equal(result.width, 41);
  assert.equal(result.height, 23);
  assert.deepEqual(result.source, source);
  assert.equal(result.sha256.length, 64);
  const actual = await sharp(path.join(root, "prepared/image.png"))
    .raw()
    .toBuffer();
  assert.equal(actual[0], 0x12);
  assert.equal(actual[1], 0x34);
  assert.equal(actual[2], 0x56);
  await assert.rejects(
    prepareInspectionImage(file, path.join(root, "prepared"), { source }),
    /already exists/,
  );
  assert.throws(() => sourceReference({ ...source, rights: "" }), /rights/);
  assert.throws(
    () => sourceReference({ ...source, url: "javascript:alert(1)" }),
    /HTTP/,
  );
});
