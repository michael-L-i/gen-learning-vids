/** Deterministic, immutable graph-search traces and SVG-ready layout data. */
function finite(v, name) {
  if (!Number.isFinite(v)) throw new TypeError(`${name} must be finite`);
  return v;
}
function positive(v, name) {
  finite(v, name);
  if (v <= 0) throw new RangeError(`${name} must be positive`);
  return v;
}
function id(v, name) {
  if (typeof v !== "string" || !v.length)
    throw new TypeError(`${name} must be a nonempty string`);
  return v;
}
function freeze(value) {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function ids(values, name) {
  if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`);
  values.forEach((v) => id(v, name));
  if (new Set(values).size !== values.length)
    throw new RangeError(`${name} must be unique`);
  return [...values];
}

/** Validate and copy graph identity. Edges are unweighted; order is the tie-break. */
export function graphModel({ nodes, edges, directed = false }) {
  if (!Array.isArray(nodes) || !Array.isArray(edges))
    throw new TypeError("nodes and edges must be arrays");
  if (typeof directed !== "boolean")
    throw new TypeError("directed must be boolean");
  if (nodes.length > 1000 || edges.length > 10000)
    throw new RangeError("graph limit is 1000 nodes and 10000 edges");
  const nodeIds = ids(
      nodes.map((n) => n.id),
      "node IDs",
    ),
    known = new Set(nodeIds);
  const cleanNodes = nodes.map((n) => ({
    id: n.id,
    label: n.label === undefined ? n.id : id(n.label, "label"),
  }));
  ids(
    edges.map((e) => e.id),
    "edge IDs",
  );
  const cleanEdges = edges.map((e) => {
    if (!known.has(e.from) || !known.has(e.to))
      throw new RangeError(`edge ${e.id} refers to an unknown node`);
    if ("weight" in e)
      throw new TypeError(
        "weighted edges are unsupported; breadth-first distances count edges",
      );
    return { id: e.id, from: e.from, to: e.to };
  });
  return freeze({ nodes: cleanNodes, edges: cleanEdges, directed });
}

/** Breadth-first search, marking discovery at enqueue time.
 * Every step is a complete frozen snapshot. Directed edges follow from→to;
 * undirected adjacency follows input edge order. Parallel edges/self-loops are
 * examined individually but never enqueue a discovered node twice.
 */
export function breadthFirstTrace(input, { start, maxSteps = 10000 } = {}) {
  const graph = graphModel(input);
  id(start, "start");
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100000)
    throw new RangeError("maxSteps must be an integer from 1 to 100000");
  const nodes = new Map(
    graph.nodes.map((n) => [
      n.id,
      {
        id: n.id,
        status: "unseen",
        distance: null,
        parent: null,
        parentEdge: null,
      },
    ]),
  );
  if (!nodes.has(start))
    throw new RangeError("start must identify a graph node");
  const adjacency = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges) {
    adjacency.get(e.from).push({ edge: e.id, to: e.to });
    if (!graph.directed && e.from !== e.to)
      adjacency.get(e.to).push({ edge: e.id, to: e.from });
  }
  const queue = [],
    steps = [];
  let active = null;
  const snapshot = (type, details = {}) => {
    if ((steps.length + 1) * graph.nodes.length > 250000)
      throw new RangeError(
        "trace exceeds 250000 node snapshot cells; use a smaller graph",
      );
    if (steps.length >= maxSteps)
      throw new RangeError(
        "trace exceeds maxSteps; use a smaller graph or raise the explicit limit",
      );
    const index = steps.length;
    steps.push(
      freeze({
        id: `step-${index}`,
        index,
        type,
        active,
        edge: null,
        ...details,
        queue: [...queue],
        nodes: [...nodes.values()].map((n) => ({ ...n })),
      }),
    );
  };
  snapshot("initial");
  Object.assign(nodes.get(start), { status: "queued", distance: 0 });
  queue.push(start);
  snapshot("discover", { node: start });
  while (queue.length) {
    active = queue.shift();
    nodes.get(active).status = "active";
    snapshot("dequeue", { node: active });
    for (const { edge, to } of adjacency.get(active)) {
      snapshot("examine", { edge, node: to });
      const target = nodes.get(to);
      if (target.status === "unseen") {
        Object.assign(target, {
          status: "queued",
          distance: nodes.get(active).distance + 1,
          parent: active,
          parentEdge: edge,
        });
        queue.push(to);
        snapshot("discover", { edge, node: to });
      } else snapshot("skip", { edge, node: to });
    }
    nodes.get(active).status = "done";
    snapshot("finish", { node: active });
    active = null;
  }
  snapshot("complete");
  return freeze({ algorithm: "breadth-first", graph, start, steps });
}

/** Uniformly timed random-access playback; negative/late times clamp to endpoints. */
export function traceAt(trace, time, { secondsPerStep = 1 } = {}) {
  finite(time, "time");
  positive(secondsPerStep, "secondsPerStep");
  if (!Array.isArray(trace?.steps) || !trace.steps.length)
    throw new TypeError("trace must have steps");
  const quotient = time / secondsPerStep,
    nearest = Math.round(quotient);
  // Division can place exact frame boundaries a few ULPs below an integer.
  const tolerance = 4 * Number.EPSILON * Math.max(1, Math.abs(quotient));
  const step =
    Math.abs(quotient - nearest) <= tolerance ? nearest : Math.floor(quotient);
  return trace.steps[Math.max(0, Math.min(trace.steps.length - 1, step))];
}

/** Recover a discovered node's BFS-tree path from any complete snapshot. */
export function discoveredPath(snapshot, target) {
  id(target, "target");
  if (!Array.isArray(snapshot?.nodes))
    throw new TypeError("snapshot must contain nodes");
  const nodes = new Map(snapshot.nodes.map((n) => [n.id, n]));
  if (!nodes.has(target))
    throw new RangeError("target must identify a snapshot node");
  if (nodes.get(target).distance === null) return null;
  const path = [],
    seen = new Set();
  let current = target;
  while (current !== null) {
    if (seen.has(current) || !nodes.has(current))
      throw new RangeError("snapshot has an invalid parent chain");
    seen.add(current);
    path.unshift(current);
    current = nodes.get(current).parent;
  }
  return path;
}

/** Explicit SVG coordinates; no implicit graph-layout algorithm. Straight edges
 * are trimmed at circles. Self-loops and overlapping node circles are rejected
 * for drawing (search still supports both). Parallel edges share one segment.
 */
export function graphGeometry(input, { positions, radius = 24 } = {}) {
  const graph = graphModel(input);
  positive(radius, "radius");
  if (!Array.isArray(positions))
    throw new TypeError("positions must be [{id,x,y}]");
  ids(
    positions.map((p) => p.id),
    "position IDs",
  );
  const known = new Set(graph.nodes.map((n) => n.id));
  if (
    positions.length !== known.size ||
    positions.some((p) => !known.has(p.id))
  )
    throw new RangeError("positions must match graph node IDs exactly");
  const lookup = new Map(
    positions.map((p) => [p.id, { x: finite(p.x, "x"), y: finite(p.y, "y") }]),
  );
  const nodes = graph.nodes.map((n) => ({ ...n, ...lookup.get(n.id), radius }));
  const edges = graph.edges.map((e) => {
    const a = lookup.get(e.from),
      b = lookup.get(e.to),
      dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.hypot(dx, dy);
    if (!Number.isFinite(length) || length <= 2 * radius)
      throw new RangeError(
        `edge ${e.id} needs separated nonoverlapping endpoint circles`,
      );
    const start = [a.x + (dx / length) * radius, a.y + (dy / length) * radius],
      end = [b.x - (dx / length) * radius, b.y - (dy / length) * radius];
    return {
      ...e,
      start,
      end,
      path: `M${start.join(" ")} L${end.join(" ")}`,
      directed: graph.directed,
    };
  });
  return freeze({ nodes, edges });
}

/** Stable-ID queue geometry: the first item is the next one to leave. */
export function queueLayout(
  queue,
  { x = 0, y = 0, width = 72, height = 44, gap = 12 } = {},
) {
  const values = ids(queue, "queue IDs");
  finite(x, "x");
  finite(y, "y");
  positive(width, "width");
  positive(height, "height");
  finite(gap, "gap");
  if (gap < 0) throw new RangeError("gap must be nonnegative");
  return values.map((id, index) => ({
    id,
    index,
    x: finite(x + index * (width + gap), "cell x"),
    y,
    width,
    height,
  }));
}

/** Queue movement between snapshots. New entries fade into their final cell;
 * departing entries fade out in their old cell. Each union member keeps its ID.
 * Returned data contains no markup; authors own labels, colors and rendering.
 */
export function queueTransition(before, after, { progress, ...layout } = {}) {
  finite(progress, "progress");
  if (progress < 0 || progress > 1)
    throw new RangeError("progress must be between 0 and 1");
  const a = new Map(queueLayout(before, layout).map((p) => [p.id, p])),
    b = new Map(queueLayout(after, layout).map((p) => [p.id, p]));
  return [...new Set([...before, ...after])].map((id) => {
    const from = a.get(id),
      to = b.get(id),
      origin = from || to,
      end = to || from;
    return {
      ...end,
      id,
      x: origin.x + (end.x - origin.x) * progress,
      y: origin.y + (end.y - origin.y) * progress,
      opacity: from && to ? 1 : to ? progress : 1 - progress,
      phase: from && to ? "retained" : to ? "entering" : "leaving",
    };
  });
}
