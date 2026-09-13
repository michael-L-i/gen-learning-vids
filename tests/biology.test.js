import test from "node:test";
import assert from "node:assert/strict";
import { membraneNodes, chloroplastNodes } from "../server/biology/diagrams.js";
import {
  prepareAnimation,
  animationSvg,
  beatTimeline,
} from "../server/animation/render.js";
import { clipPrompt } from "../server/animation/plan.js";
test("biology helpers compose, render and retain transformable groups", async () => {
  const m = membraneNodes({
    id: "mem",
    x: 60,
    y: 500,
    width: 1160,
    height: 80,
    columns: 28,
  });
  const c = chloroplastNodes({
    id: "chl",
    x: 280,
    y: 170,
    width: 720,
    height: 280,
  });
  const p = await prepareAnimation({
    kind: "animation",
    background: "#FFFFFF",
    beats: [{ id: "b", narration: "Follow the membrane.", seconds: 1 }],
    nodes: [...m.nodes, ...c.nodes],
    tracks: [],
  });
  const svg = animationSvg(p, beatTimeline(p.animation), 0.5);
  assert.match(svg, /translate\(60 500\)/);
  assert.match(svg, /translate\(280 170\)/);
  assert.equal(m.anchors.bottom.y, 580);
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(Buffer.from(svg))
    .raw()
    .toBuffer({ resolveWithObject: true });
  let green = 0;
  for (let i = 0; i < data.length; i += info.channels)
    if (data[i + 1] > data[i] + 15 && data[i + 1] > data[i + 2] + 15) green++;
  assert.ok(green > 20000, "Organelle and membrane must actually rasterize");
  assert.match(clipPrompt("photosynthesis"), /protons build up in the lumen/);
});
test("biology helpers bound geometry and reject malformed parameters", () => {
  assert.throws(() => membraneNodes({ id: "m", columns: 100 }));
  assert.throws(() => chloroplastNodes({ id: "c", height: 10 }));
  assert.throws(() => membraneNodes({ id: "bad id" }));
});

test("dense fractional membranes remain within the shared geometry limits", async () => {
  const { validateAnimation } = await import("../server/animation/schema.js");
  for (const width of [160, 333.33, 777.77, 1200]) {
    for (const height of [40, 51.73, 600]) {
      const { nodes } = membraneNodes({
        id: "membrane",
        width,
        height,
        columns: 32,
      });
      validateAnimation({
        kind: "animation",
        background: "#FFFFFF",
        beats: [{ id: "b", narration: "A membrane", seconds: 1 }],
        nodes,
        tracks: [],
      });
      // Two head groups for every lipid column, including split paths.
      assert.equal(
        nodes
          .filter((n) => n.id.includes("heads"))
          .map((n) => n.path)
          .join("")
          .split("M").length - 1,
        64,
      );
    }
  }
});
