import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import express from "express";
import sharp from "sharp";
import { build } from "esbuild";
import { chromium } from "playwright";
test("OpenSeadragon A-B-A pixels/anchors and DOM Range wrapped replacement are deterministic", async (t) => {
  if (!process.env.LEARNVID_BROWSER_TEST)
    return t.skip("Set LEARNVID_BROWSER_TEST=1 for real browser integration");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "inspection-browser-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await sharp(
    Buffer.from(
      '<svg width="2000" height="1200"><rect width="2000" height="1200" fill="#e7e2d9"/><rect x="400" y="300" width="300" height="200" fill="#bb4030"/><path d="M0 0 L2000 1200 M0 1200 L2000 0" stroke="#204060" stroke-width="12"/></svg>',
    ),
  )
    .png()
    .toFile(path.join(dir, "source.png"));
  await build({
    stdin: {
      contents: `export * from ${JSON.stringify(fileURLToPath(new URL("../server/inspection/index.js", import.meta.url)))};`,
      resolveDir: fileURLToPath(new URL("..", import.meta.url)),
    },
    bundle: true,
    format: "iife",
    globalName: "Inspection",
    outfile: path.join(dir, "bundle.js"),
  });
  const app = express();
  app.get("/", (req, res) =>
    res.send("<!doctype html><html><body></body></html>"),
  );
  app.use(express.static(dir));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const origin = `http://127.0.0.1:${server.address().port}`,
    browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/");
  await page.setContent(
    '<style>body{margin:0;font-family:Arial}#image{width:800px;height:500px}#text{position:absolute;left:820px;top:0;width:300px;font-size:26px;line-height:1.5}</style><div id="image"></div><div id="text"></div>',
  );
  await page.addScriptTag({ url: origin + "/bundle.js" });
  await page.evaluate(async (origin) => {
    const source = {
      id: "s",
      title: "Test",
      url: "https://example.com",
      attribution: "Test",
      rights: "Fixture",
    };
    window.view = await Inspection.createImageInspector(
      document.querySelector("#image"),
      { url: origin + "/source.png", source },
    );
    window.a = { x: 250, y: 200, width: 800, height: 500 };
    window.b = { x: 800, y: 500, width: 500, height: 300 };
    window.mark = { id: "mark", x: 400, y: 300, width: 300, height: 200 };
    view.setRegions([mark]);
    await view.focus(a);
    window.annotations = Inspection.createTextAnnotations(
      document.querySelector("#text"),
      {
        source,
        text: "A long source quotation wraps over several lines. Small words remain attached to their source offsets.",
      },
    );
    annotations.setRanges([{ id: "long", start: 0, end: 80 }]);
  }, origin);
  const first = await page.locator("#image").screenshot(),
    anchorA = await page.evaluate(() => view.anchor(mark));
  assert.ok(Math.abs(anchorA.screen.x - 150) < 1e-8);
  assert.ok(Math.abs(anchorA.screen.y - 100) < 1e-8);
  assert.ok(Math.abs(anchorA.screen.width - 300) < 1e-8);
  await page.evaluate(() => view.focus(b));
  assert.notDeepEqual(await page.locator("#image").screenshot(), first);
  await page.evaluate(() => view.focus(a));
  assert.deepEqual(await page.locator("#image").screenshot(), first);
  assert.deepEqual(await page.evaluate(() => view.anchor(mark)), anchorA);
  const result = await page.evaluate(() => {
    const long = annotations.refresh();
    annotations.setRanges([{ id: "short", start: 2, end: 6, quote: "long" }]);
    const short = annotations.refresh();
    const count = document.querySelector("#text svg").children.length;
    document.querySelector("#text").style.width = "190px";
    const resized = annotations.refresh();
    const wrapped = annotations.setRanges([
      { id: "wrapped", start: 0, end: 80 },
    ]);
    return { long, short, count, resized, wrapped };
  });
  assert.ok(result.long[0].rects.length > 1);
  assert.equal(result.short[0].text, "long");
  assert.equal(result.count, result.short[0].rects.length);
  assert.equal(result.resized[0].start, 2);
  assert.equal(result.resized[0].text, "long");
  assert.ok(result.wrapped[0].rects.length > result.long[0].rects.length);
  await page.evaluate(() => {
    view.dispose();
    annotations.dispose();
  });
  assert.deepEqual(errors, []);
});
