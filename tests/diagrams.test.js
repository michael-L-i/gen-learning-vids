import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  layoutDiagram,
  layoutComparison,
  diagramSvg,
} from "../server/diagrams/index.js";
import { renderBrowserScenes } from "../server/browser/host.js";
const graph = {
  nodes: [
    { id: "a", label: "First premise", role: "premise" },
    { id: "b", label: "Second premise", role: "premise" },
    { id: "c", label: "Conclusion", role: "claim" },
  ],
  edges: [
    { id: "ac", from: "a", to: "c", type: "supports" },
    { id: "bc", from: "b", to: "c", type: "supports" },
  ],
};
test("actual ELK layouts preserve stable IDs, labeled routes and nonoverlapping boxes", async () => {
  const a = await layoutDiagram(graph),
    b = await layoutDiagram(graph);
  assert.deepEqual(a, b);
  assert.equal(a.engine, "ELK layered");
  assert.deepEqual(
    a.nodes.map((n) => n.id),
    ["a", "b", "c"],
  );
  for (let i = 0; i < a.nodes.length; i++)
    for (let j = i + 1; j < a.nodes.length; j++) {
      const x = a.nodes[i],
        y = a.nodes[j];
      assert.ok(
        x.x + x.width <= y.x ||
          y.x + y.width <= x.x ||
          x.y + x.height <= y.y ||
          y.y + y.height <= x.y,
      );
    }
  for (const e of a.edges) {
    assert.ok(e.routes[0].length >= 2);
    assert.ok(e.labelBox.width > 0);
    assert.equal(e.to, "c");
  }
});
test("cycles, self loops and branching are layout capabilities, not rejected as logical invalidity", async () => {
  const a = await layoutDiagram(
    {
      ...graph,
      edges: [
        ...graph.edges,
        { id: "ca", from: "c", to: "a", label: "feedback" },
        { id: "bb", from: "b", to: "b", label: "repeat" },
      ],
    },
    { direction: "DOWN" },
  );
  assert.equal(a.edges.length, 4);
  assert.ok(
    a.edges.every((e) =>
      e.routes.every((r) =>
        r.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      ),
    ),
  );
});
test("comparison union retains geometry across additions, removals and changed labels", async () => {
  const after = {
    nodes: [
      { id: "a", label: "A changed premise", role: "premise" },
      { id: "c", label: "Conclusion", role: "claim" },
    ],
    edges: [{ id: "ac", from: "a", to: "c", label: "", type: "supports" }],
  };
  const cmp = await layoutComparison(graph, after);
  for (const n of cmp.after.nodes) {
    const prev = cmp.before.nodes.find((x) => x.id === n.id);
    assert.deepEqual(
      [n.x, n.y, n.width, n.height],
      [prev.x, prev.y, prev.width, prev.height],
    );
  }
  assert.deepEqual(cmp.before.edges[0].routes, cmp.after.edges[0].routes);
  assert.ok(
    cmp.before.edges[0].labelBox,
    "Removed edge label still reserves comparison geometry",
  );
  assert.deepEqual(cmp.changes.removed, ["b", "bc"]);
  assert.deepEqual(cmp.changes.changed, ["a", "ac"]);
  await assert.rejects(
    () =>
      layoutComparison(graph, {
        ...graph,
        edges: [{ id: "ac", from: "c", to: "a" }],
      }),
    /changes endpoints/,
  );
});
test("invalid IDs/endpoints/sizes fail and SVG escaping/reveals are deterministic", async () => {
  await assert.rejects(
    () => layoutDiagram({ ...graph, nodes: [...graph.nodes, graph.nodes[0]] }),
    /unique/,
  );
  await assert.rejects(
    () =>
      layoutDiagram({
        ...graph,
        edges: [{ id: "x", from: "a", to: "missing" }],
      }),
    /unknown endpoint/,
  );
  await assert.rejects(
    () =>
      layoutDiagram({
        nodes: [{ id: "a", label: "Wide label", width: 3 }],
        edges: [],
      }),
    /fit/,
  );
  const a = await layoutDiagram({
    nodes: [
      { id: "root", label: '<script>alert("x")</script>', role: "A & B" },
    ],
    edges: [],
  });
  assert.ok(diagramSvg(a).includes("&lt;script&gt;"));
  assert.ok(!diagramSvg(a).includes("<script>"));
  const g = await layoutDiagram(graph),
    options = { edgeProgress: { ac: 0.5 }, activeNodes: ["a"] };
  assert.equal(diagramSvg(g, options), diagramSvg(g, options));
  assert.throws(() => diagramSvg(g, { edgeProgress: { ac: NaN } }));
  assert.throws(() => diagramSvg(g, { activeNodes: ["missing"] }));
  const svg = diagramSvg(g, { edgeProgress: { ac: 0.5, bc: 0 } });
  assert.ok(
    !svg.includes("<polygon"),
    "Arrowheads wait until complete relationship reveal",
  );
});
test("browser bundles real ELK and renders arbitrary-time relationship reveals", async (t) => {
  if (!process.env.LEARNVID_BROWSER_TEST)
    return t.skip("Set LEARNVID_BROWSER_TEST=1 for ELK browser integration");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "diagram-browser-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(dir, "timeline.json"),
    JSON.stringify([{ title: "Diagram", narration: "", duration: 1 }]),
  );
  await fs.writeFile(
    path.join(dir, "scene.js"),
    `import {layoutDiagram,diagramSvg} from '@lesson-library/diagrams';export async function buildScene(root){const layout=await layoutDiagram(${JSON.stringify(graph)});const render=p=>diagramSvg(layout,{edgeProgress:{ac:p},activeNodes:['a']});const expected=render(.5);render(1);if(render(.5)!==expected)throw Error('History-dependent SVG');root.style.padding='80px';return {frameKey:t=>Math.round(t*30)%2,update(t){root.innerHTML=render(Math.round(t*30)%2?1:.25);}};}`,
  );
  await renderBrowserScenes({
    module: path.join(dir, "scene.js"),
    timeline: path.join(dir, "timeline.json"),
    output: dir,
  });
  assert.notDeepEqual(
    await fs.readFile(path.join(dir, "scene-0-0.05.png")),
    await fs.readFile(path.join(dir, "scene-0-0.95.png")),
  );
});

test("changed wide-glyph labels reserve measured space in both comparison states", async () => {
  const before = { nodes: [{ id: "n", label: "i" }], edges: [] };
  const after = { nodes: [{ id: "n", label: "WWWWWWWWWW" }], edges: [] };
  const pair = await layoutComparison(before, after, {
    measureText: (text, size) =>
      [...text].reduce((n, c) => n + (c === "W" ? size : size * 0.2), 0),
  });
  assert.equal(pair.before.nodes[0].width, 232);
  assert.equal(pair.after.nodes[0].width, 232);
  assert.ok(diagramSvg(pair.after).includes("WWWWWWWWWW"));
});
