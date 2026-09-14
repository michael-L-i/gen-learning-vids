import test from "node:test";
import assert from "node:assert/strict";
import {
  graphModel,
  breadthFirstTrace,
  traceAt,
  discoveredPath,
  graphGeometry,
  queueLayout,
  queueTransition,
} from "../server/algorithms/index.js";
const graph = {
  nodes: ["S", "A", "B", "C", "T", "X"].map((id) => ({ id })),
  edges: [
    ["S", "A"],
    ["S", "B"],
    ["A", "C"],
    ["B", "C"],
    ["C", "T"],
    ["T", "S"],
  ].map(([from, to], i) => ({ id: `e${i}`, from, to })),
  directed: true,
};
test("BFS discovers exactly once, queue stays unique and distances leave in order", () => {
  const trace = breadthFirstTrace(graph, { start: "S" }),
    discovered = trace.steps.filter((s) => s.type === "discover");
  assert.deepEqual(
    discovered.map((s) => s.node),
    ["S", "A", "B", "C", "T"],
  );
  const popped = [];
  for (const step of trace.steps) {
    assert.equal(new Set(step.queue).size, step.queue.length);
    assert.ok(
      step.queue.every(
        (id) => step.nodes.find((n) => n.id === id).status === "queued",
      ),
    );
    if (step.type === "dequeue")
      popped.push(step.nodes.find((n) => n.id === step.node).distance);
  }
  assert.deepEqual(popped, [0, 1, 1, 2, 3]);
  const final = trace.steps.at(-1);
  assert.deepEqual(discoveredPath(final, "T"), ["S", "A", "C", "T"]);
  assert.equal(discoveredPath(final, "X"), null);
  assert.equal(final.nodes.find((n) => n.id === "X").status, "unseen");
  assert.equal(final.active, null);
  assert.deepEqual(final.queue, []);
});
test("independent all-pairs oracle confirms distances across deterministic directed graphs", () => {
  for (let seed = 0; seed < 15; seed++) {
    const nodes = Array.from({ length: 8 }, (_, i) => ({ id: String(i) })),
      edges = [];
    for (let a = 0; a < 8; a++)
      for (let b = 0; b < 8; b++)
        if ((a * 17 + b * 13 + seed * 7) % 11 < 3)
          edges.push({ id: `${a}-${b}`, from: String(a), to: String(b) });
    const distances = Array.from({ length: 8 }, (_, i) =>
      Array.from({ length: 8 }, (_, j) => (i === j ? 0 : Infinity)),
    );
    edges.forEach(
      (e) =>
        (distances[+e.from][+e.to] = Math.min(distances[+e.from][+e.to], 1)),
    );
    for (let k = 0; k < 8; k++)
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 8; j++)
          distances[i][j] = Math.min(
            distances[i][j],
            distances[i][k] + distances[k][j],
          );
    for (let start = 0; start < 8; start++) {
      const trace = breadthFirstTrace(
          { nodes, edges, directed: true },
          { start: String(start) },
        ),
        final = trace.steps.at(-1);
      final.nodes.forEach((n) =>
        assert.equal(
          n.distance,
          Number.isFinite(distances[start][+n.id])
            ? distances[start][+n.id]
            : null,
        ),
      );
    }
  }
});
test("edge order resolves ties, direction is honored, loops and parallel edges do not duplicate work", () => {
  const small = {
    nodes: ["a", "b"].map((id) => ({ id })),
    edges: [
      { id: "loop", from: "a", to: "a" },
      { id: "one", from: "a", to: "b" },
      { id: "two", from: "a", to: "b" },
    ],
  };
  const trace = breadthFirstTrace(small, { start: "a" });
  assert.deepEqual(
    trace.steps.filter((s) => s.type === "discover").map((s) => s.node),
    ["a", "b"],
  );
  assert.equal(trace.steps.filter((s) => s.type === "examine").length, 5);
  assert.equal(
    breadthFirstTrace({ ...small, directed: true }, { start: "b" }).steps.at(-1)
      .nodes[0].distance,
    null,
  );
  assert.equal(
    breadthFirstTrace(small, { start: "b" }).steps.at(-1).nodes[0].distance,
    1,
  );
  const reversed = {
    ...graph,
    edges: [graph.edges[1], graph.edges[0], ...graph.edges.slice(2)],
  };
  assert.deepEqual(
    discoveredPath(
      breadthFirstTrace(reversed, { start: "S" }).steps.at(-1),
      "T",
    ),
    ["S", "B", "C", "T"],
  );
});
test("snapshots and inputs are independent; seeking cannot change past states", () => {
  const input = structuredClone(graph),
    trace = breadthFirstTrace(input, { start: "S" }),
    saved = JSON.stringify(trace.steps);
  input.nodes[0].label = "changed";
  input.edges.reverse();
  assert.equal(trace.graph.nodes[0].label, "S");
  assert.throws(() => trace.steps[1].queue.push("X"), TypeError);
  assert.throws(() => (trace.steps.at(-1).nodes[0].distance = 9), TypeError);
  assert.equal(traceAt(trace, -3), trace.steps[0]);
  assert.equal(traceAt(trace, 999), trace.steps.at(-1));
  assert.equal(traceAt(trace, 0.9, { secondsPerStep: 0.5 }), trace.steps[1]);
  assert.equal(JSON.stringify(trace.steps), saved);
  const dangerous = graphModel({
    nodes: [{ id: "__proto__" }, { id: "constructor" }],
    edges: [{ id: "e", from: "__proto__", to: "constructor" }],
  });
  assert.equal(
    breadthFirstTrace(dangerous, { start: "__proto__" }).steps.at(-1).nodes[1]
      .distance,
    1,
  );
});
test("SVG geometry trims edges to anchors and stable queue IDs interpolate", () => {
  const model = {
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ id: "e", from: "a", to: "b" }],
    directed: true,
  };
  const geom = graphGeometry(model, {
    positions: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 100, y: 0 },
    ],
    radius: 20,
  });
  assert.deepEqual(geom.edges[0].start, [20, 0]);
  assert.deepEqual(geom.edges[0].end, [80, 0]);
  assert.equal(geom.edges[0].path, "M20 0 L80 0");
  assert.deepEqual(
    queueLayout(["a", "b"], { x: 10, width: 50, gap: 5 }).map((p) => p.x),
    [10, 65],
  );
  const mid = queueTransition(["a", "b"], ["b", "c"], {
    progress: 0.5,
    width: 60,
    gap: 10,
  });
  assert.equal(mid.find((n) => n.id === "b").x, 35);
  assert.equal(mid.find((n) => n.id === "a").opacity, 0.5);
  assert.equal(mid.find((n) => n.id === "c").opacity, 0.5);
  for (const p of [0, 1]) {
    const cells = queueTransition(["a", "b"], ["b", "c"], { progress: p });
    const visible = cells
      .filter((c) => c.opacity > 0)
      .sort((a, b) => a.x - b.x);
    assert.deepEqual(
      visible.map((c) => c.id),
      p ? ["b", "c"] : ["a", "b"],
    );
  }
});
test("invalid graphs, weighted inputs, geometry and resource limits fail clearly", () => {
  assert.throws(
    () => graphModel({ nodes: [{ id: "a" }, { id: "a" }], edges: [] }),
    /unique/,
  );
  assert.throws(
    () =>
      graphModel({
        nodes: [{ id: "a" }],
        edges: [{ id: "e", from: "a", to: "b" }],
      }),
    /unknown/,
  );
  assert.throws(
    () =>
      graphModel({
        nodes: [{ id: "a" }],
        edges: [{ id: "e", from: "a", to: "a", weight: 1 }],
      }),
    /weighted/,
  );
  assert.throws(() => breadthFirstTrace(graph, { start: "missing" }), /start/);
  assert.throws(
    () => breadthFirstTrace(graph, { start: "S", maxSteps: 2 }),
    /maxSteps/,
  );
  assert.throws(() => graphGeometry(graph, { positions: [] }), /exactly/);
  assert.throws(() => queueLayout(["a", "a"]), /unique/);
  assert.throws(() => queueTransition([], [], { progress: 1.1 }), /progress/);
  assert.throws(() => traceAt({ steps: [{}] }, NaN), /finite/);
  assert.throws(
    () => traceAt({ steps: [{}] }, 1, { secondsPerStep: 0 }),
    /positive/,
  );
  assert.throws(
    () =>
      discoveredPath({ nodes: [{ id: "a", distance: 0, parent: "a" }] }, "a"),
    /parent chain/,
  );
  const large = {
    nodes: Array.from({ length: 501 }, (_, i) => ({ id: String(i) })),
    edges: Array.from({ length: 500 }, (_, i) => ({
      id: String(i),
      from: String(i),
      to: String(i + 1),
    })),
  };
  assert.throws(
    () => breadthFirstTrace(large, { start: "0" }),
    /snapshot cells/,
  );
});
