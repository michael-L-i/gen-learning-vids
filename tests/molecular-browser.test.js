import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import express from "express";
import { build } from "esbuild";
import { chromium } from "playwright";

test("real local Mol* canvas loads, measures, and restores pixels across camera/selection/visibility seeks", async (t) => {
  if (!process.env.LEARNVID_BROWSER_TEST)
    return t.skip("Set LEARNVID_BROWSER_TEST=1 for real Mol* rendering");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "molecular-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await build({
    entryPoints: [
      new URL("../server/molecular/index.js", import.meta.url).pathname,
    ],
    bundle: true,
    platform: "browser",
    format: "esm",
    outfile: path.join(dir, "viewer.js"),
  });
  // Synthetic Cartesian fixture, not a real learner structure: C1→N1 is exactly 5Å.
  const atoms = [
    ["C1", "C", 0, 0, 0],
    ["C2", "C", 1.4, 0, 0],
    ["N1", "N", 3, 4, 0],
    ["O1", "O", 3, 5.3, 0],
  ];
  const pdb =
    atoms
      .map(
        ([name, element, x, y, z], i) =>
          `HETATM${String(i + 1).padStart(5)} ${name.padEnd(4)} LIG A   1    ${x.toFixed(3).padStart(8)}${y.toFixed(3).padStart(8)}${z.toFixed(3).padStart(8)}  1.00 10.00          ${element.padStart(2)}  `,
      )
      .join("\n") + "\nEND\n";
  await fs.writeFile(path.join(dir, "fixture.pdb"), pdb);
  await fs.writeFile(
    path.join(dir, "index.html"),
    '<style>body{margin:0}#v{position:relative;width:640px;height:360px}</style><div id="v"></div>',
  );
  const app = express();
  app.use(express.static(dir));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-unsafe-swiftshader"],
  });
  t.after(() => browser.close());
  const page = await browser.newPage({
    viewport: { width: 640, height: 360 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route("**/*", (route) =>
    route
      .request()
      .url()
      .startsWith(origin + "/")
      ? route.continue()
      : route.abort(),
  );
  await page.goto(origin);
  const data = await page.evaluate(async () => {
    const { createMolecularViewer } = await import("/viewer.js");
    window.viewer = await createMolecularViewer(document.querySelector("#v"), {
      url: "/fixture.pdb",
      format: "pdb",
      components: [
        { id: "all", selector: "all", color: "#4477aa" },
        {
          id: "n",
          selector: { label_atom_id: "N1" },
          representation: "spacefill",
          sizeFactor: 0.6,
          color: "#cc5522",
        },
      ],
    });
    window.a = viewer.cameraFor("all", { radius: 5 });
    window.b = viewer.cameraFor(
      { label_atom_id: "N1" },
      { radius: 2, direction: [1, 0, -1] },
    );
    viewer.render({ camera: a });
    const out = {
      atoms: viewer.atomCount,
      distance: viewer.distance(
        { label_atom_id: "C1" },
        { label_atom_id: "N1" },
      ).angstroms,
      camera: viewer.getCamera(),
      center: viewer.project(a.target),
      errors: [],
    };
    for (const fn of [
      () => viewer.atom("all"),
      () => viewer.count({ label_atom_id: "absent" }),
      () => viewer.render({ camera: a, visible: ["missing"] }),
    ])
      try {
        fn();
      } catch (e) {
        out.errors.push(e.message);
      }
    return out;
  });
  assert.equal(data.atoms, 4);
  assert.equal(data.distance, 5);
  assert.equal(data.errors.length, 3);
  assert(Math.abs(data.center.x - 320) < 0.01);
  assert(Math.abs(data.center.y - 180) < 0.01);
  const first = await page.screenshot();
  await page.evaluate(() =>
    viewer.render({
      camera: b,
      visible: ["n"],
      highlight: { label_atom_id: "N1" },
    }),
  );
  const second = await page.screenshot();
  assert.notDeepEqual(second, first);
  await page.evaluate(() => viewer.render({ camera: a }));
  const restored = await page.screenshot();
  assert.deepEqual(restored, first);
  assert.deepEqual(await page.evaluate(() => viewer.getCamera()), data.camera);
  // Highlight and visibility changes separately affect pixels, even with camera held fixed.
  await page.evaluate(() =>
    viewer.render({ camera: a, highlight: { label_atom_id: "N1" } }),
  );
  assert.notDeepEqual(await page.screenshot(), first);
  await page.evaluate(() => viewer.render({ camera: a, visible: ["n"] }));
  assert.notDeepEqual(await page.screenshot(), first);
  await page.evaluate(() => viewer.render({ camera: a }));
  assert.deepEqual(await page.screenshot(), first);
  await page.evaluate(() => viewer.dispose());
  assert.equal(await page.locator("canvas").count(), 0);
  assert.deepEqual(errors, []);
});
