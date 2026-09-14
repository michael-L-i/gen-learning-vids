const finite = (x, name) => {
  if (!Number.isFinite(x)) throw new Error(`${name} must be finite`);
  return x;
};
const text = (s, name, max = 400) => {
  if (typeof s !== "string" || s.length > max)
    throw new Error(`${name} must be a string of at most ${max} characters`);
  return s;
};
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
function metrics(options) {
  const fontSize = options.fontSize ?? 20;
  finite(fontSize, "fontSize");
  if (fontSize < 12 || fontSize > 40) throw new Error("fontSize must be 12–40");
  let measure = options.measureText;
  if (!measure && typeof document !== "undefined") {
    const ctx = document.createElement("canvas").getContext("2d");
    measure = (s, size) => {
      ctx.font = `${size}px system-ui`;
      return ctx.measureText(s).width;
    };
  }
  measure ??= (s, size) => [...s].length * size * 0.65;
  const width = (s, size = fontSize) => {
    const w = finite(measure(s, size), "measured text width");
    if (w < 0) throw new Error("Measured widths must be nonnegative");
    return w;
  };
  return { fontSize, width };
}
function prepare(graph, m) {
  if (
    !Array.isArray(graph.nodes) ||
    !graph.nodes.length ||
    graph.nodes.length > 80
  )
    throw new Error("Supply 1–80 diagram nodes");
  if (!Array.isArray(graph.edges) || graph.edges.length > 160)
    throw new Error("Supply at most 160 diagram edges");
  const ids = new Set(),
    nodeIds = new Set();
  const id = (s) => {
    text(s, "id", 100);
    if (!s || ids.has(s))
      throw new Error("Node and edge IDs must be nonempty and globally unique");
    ids.add(s);
    return s;
  };
  const nodes = graph.nodes.map((n) => {
    id(n.id);
    nodeIds.add(n.id);
    const label = text(n.label, "node label"),
      role = text(n.role ?? "", "node role", 40),
      lines = label.split("\n");
    if (lines.length > 6)
      throw new Error("Use at most six explicit lines per node");
    const minWidth = Math.max(
        80,
        ...lines.map((s) => m.width(s) + 32),
        m.width(role, m.fontSize * 0.65) + 32,
      ),
      minHeight = lines.length * m.fontSize * 1.25 + (role ? 42 : 28);
    const width = n.width ?? minWidth,
      height = n.height ?? minHeight;
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < minWidth ||
      height < minHeight ||
      width > 2000 ||
      height > 1000
    )
      throw new Error(
        `Node ${n.id} dimensions must fit its text and be at most 2000×1000`,
      );
    return { id: n.id, label, role, lines, width, height };
  });
  const edges = graph.edges.map((e) => {
    id(e.id);
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to))
      throw new Error(`Edge ${e.id} has an unknown endpoint`);
    const type = text(e.type ?? "relation", "relationship type", 60),
      label = text(e.label ?? type, "edge label", 200);
    if (label.includes("\n"))
      throw new Error(
        "Edge labels must be one line; explain longer relationships beside the diagram",
      );
    return {
      id: e.id,
      from: e.from,
      to: e.to,
      type,
      label,
      labelWidth: label ? m.width(label, m.fontSize * 0.8) + 12 : 0,
      labelHeight: label ? m.fontSize * 1.2 : 0,
    };
  });
  return { nodes, edges };
}
async function layoutPrepared(
  graph,
  m,
  { direction = "RIGHT", nodeSpacing = 44, layerSpacing = 64 } = {},
) {
  if (!["RIGHT", "LEFT", "DOWN", "UP"].includes(direction))
    throw new Error("Use RIGHT, LEFT, DOWN, or UP direction");
  for (const value of [nodeSpacing, layerSpacing])
    if (!Number.isFinite(value) || value < 16 || value > 400)
      throw new Error("Spacing must be 16–400");
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const elk = new ELK();
  let rootId = "__lesson_layout_root";
  while ([...graph.nodes, ...graph.edges].some((e) => e.id === rootId))
    rootId += "_";
  // No workerUrl is supplied: the bundled engine uses its in-process worker
  // shim. There is no browser Worker to terminate.
  {
    const result = await elk.layout({
      id: rootId,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": direction,
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.randomSeed": "1",
        "elk.spacing.nodeNode": String(nodeSpacing),
        "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.padding": "[top=24,left=24,bottom=24,right=24]",
      },
      children: graph.nodes.map((n) => ({
        id: n.id,
        width: n.width,
        height: n.height,
      })),
      edges: graph.edges.map((e) => ({
        id: e.id,
        sources: [e.from],
        targets: [e.to],
        labels: e.label
          ? [{ text: e.label, width: e.labelWidth, height: e.labelHeight }]
          : [],
      })),
    });
    const nodes = graph.nodes.map((n) => {
      const p = result.children.find((p) => p.id === n.id);
      return { ...n, x: finite(p.x, "node x"), y: finite(p.y, "node y") };
    });
    const edges = graph.edges.map((e) => {
      const p = result.edges.find((p) => p.id === e.id);
      if (!p.sections?.length)
        throw new Error(`ELK could not route edge ${e.id}`);
      const routes = p.sections.map((s) =>
        [s.startPoint, ...(s.bendPoints || []), s.endPoint].map((p) => ({
          x: finite(p.x, "edge x"),
          y: finite(p.y, "edge y"),
        })),
      );
      return {
        ...e,
        routes,
        labelBox: p.labels?.[0]
          ? {
              x: finite(p.labels[0].x, "label x"),
              y: finite(p.labels[0].y, "label y"),
              width: e.labelWidth,
              height: e.labelHeight,
            }
          : null,
      };
    });
    return {
      engine: "ELK layered",
      fontSize: m.fontSize,
      width: finite(result.width, "layout width"),
      height: finite(result.height, "layout height"),
      nodes,
      edges,
    };
  }
}

export async function layoutDiagram(graph, options = {}) {
  if (typeof document !== "undefined") await document.fonts.ready;
  const m = metrics(options);
  return layoutPrepared(prepare(graph, m), m, options);
}

// Lay out the union once so unchanged identities retain their geometry in both
// comparisons. An edge's endpoints define its identity; use a new ID to rewire it.
export async function layoutComparison(before, after, options = {}) {
  if (typeof document !== "undefined") await document.fonts.ready;
  const m = metrics(options),
    a = prepare(before, m),
    b = prepare(after, m);
  const nodes = new Map(a.nodes.map((n) => [n.id, n])),
    edges = new Map(a.edges.map((e) => [e.id, e]));
  for (const n of b.nodes) {
    const old = nodes.get(n.id);
    nodes.set(n.id, {
      ...n,
      width: Math.max(n.width, old?.width ?? 0),
      height: Math.max(n.height, old?.height ?? 0),
    });
  }
  for (const e of b.edges) {
    const old = edges.get(e.id);
    if (old && (old.from !== e.from || old.to !== e.to))
      throw new Error(`Edge ${e.id} changes endpoints; assign a new ID`);
    edges.set(e.id, {
      ...e,
      label: e.label || old?.label || "",
      labelWidth: Math.max(e.labelWidth, old?.labelWidth ?? 0),
      labelHeight: Math.max(e.labelHeight, old?.labelHeight ?? 0),
    });
  }
  if ([...nodes.keys()].some((id) => edges.has(id)))
    throw new Error("Node and edge IDs must be unique across both states");
  if (nodes.size > 80 || edges.size > 160)
    throw new Error("Comparison union exceeds diagram limits");
  const union = await layoutPrepared(
    { nodes: [...nodes.values()], edges: [...edges.values()] },
    m,
    options,
  );
  const state = (g) => ({
    ...union,
    nodes: g.nodes.map((n) => ({
      ...union.nodes.find((p) => p.id === n.id),
      label: n.label,
      lines: n.lines,
      role: n.role,
    })),
    edges: g.edges.map((e) => ({
      ...union.edges.find((p) => p.id === e.id),
      label: e.label,
      type: e.type,
    })),
  });
  const signatures = (g) =>
    new Map([
      ...g.nodes.map((n) => [n.id, JSON.stringify([n.label, n.role])]),
      ...g.edges.map((e) => [
        e.id,
        JSON.stringify([e.from, e.to, e.label, e.type]),
      ]),
    ]);
  const am = signatures(a),
    bm = signatures(b);
  return {
    before: state(a),
    after: state(b),
    changes: {
      added: [...bm.keys()].filter((id) => !am.has(id)),
      removed: [...am.keys()].filter((id) => !bm.has(id)),
      changed: [...bm.keys()].filter(
        (id) => am.has(id) && am.get(id) !== bm.get(id),
      ),
    },
  };
}

function progressMap(map, ids) {
  for (const [id, p] of Object.entries(map)) {
    if (!ids.has(id)) throw new Error(`Unknown diagram ID: ${id}`);
    if (!Number.isFinite(p) || p < 0 || p > 1)
      throw new Error("Reveal progress must be in [0, 1]");
  }
}
const pathData = (points) =>
  points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
function arrow(points) {
  const end = points.at(-1),
    previous = [...points]
      .reverse()
      .find((p) => Math.hypot(p.x - end.x, p.y - end.y) > 1e-8);
  if (!previous) return "";
  const dx = end.x - previous.x,
    dy = end.y - previous.y,
    len = Math.hypot(dx, dy),
    ux = dx / len,
    uy = dy / len;
  return `${end.x},${end.y} ${end.x - 10 * ux + 4 * uy},${end.y - 10 * uy - 4 * ux} ${end.x - 10 * ux - 4 * uy},${end.y - 10 * uy + 4 * ux}`;
}
export function diagramSvg(
  layout,
  {
    nodeProgress = {},
    edgeProgress = {},
    activeNodes = [],
    activeEdges = [],
    title = "Relationship diagram",
    color = "#294253",
    activeColor = "#007d80",
    background = "#ffffff",
  } = {},
) {
  const nodes = new Set(layout.nodes.map((n) => n.id)),
    edges = new Set(layout.edges.map((e) => e.id));
  progressMap(nodeProgress, nodes);
  progressMap(edgeProgress, edges);
  for (const id of activeNodes)
    if (!nodes.has(id)) throw new Error(`Unknown active node: ${id}`);
  for (const id of activeEdges)
    if (!edges.has(id)) throw new Error(`Unknown active edge: ${id}`);
  const activeN = new Set(activeNodes),
    activeE = new Set(activeEdges),
    font = layout.fontSize;
  const connections = layout.edges
    .map((e) => {
      const p = edgeProgress[e.id] ?? 1,
        ink = activeE.has(e.id) ? activeColor : "#718591";
      const routes = e.routes
        .map(
          (points) =>
            `<path d="${pathData(points)}" fill="none" stroke="${escape(ink)}" stroke-width="2.5" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - p}"/>${p === 1 ? `<polygon points="${arrow(points)}" fill="${escape(ink)}"/>` : ""}`,
        )
        .join("");
      const box = e.labelBox,
        label =
          box && e.label && p === 1
            ? `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="${escape(background)}"/><text x="${box.x + box.width / 2}" y="${box.y + box.height / 2}" font-size="${font * 0.8}" text-anchor="middle" dominant-baseline="middle" fill="${escape(ink)}">${escape(e.label)}</text>`
            : "";
      return `<g data-edge="${escape(e.id)}" data-type="${escape(e.type)}" opacity="${p === 0 ? 0 : 1}">${routes}${label}</g>`;
    })
    .join("");
  const boxes = layout.nodes
    .map((n) => {
      const lines = n.lines;
      const ink = activeN.has(n.id) ? activeColor : color,
        fill = activeN.has(n.id) ? "#e0f2f1" : background;
      const label = lines
        .map(
          (s, i) =>
            `<text x="${n.x + n.width / 2}" y="${n.y + n.height / 2 + (n.role ? 8 : 0) + (i - (lines.length - 1) / 2) * font * 1.25}" font-size="${font}" text-anchor="middle" dominant-baseline="middle" fill="${escape(ink)}">${escape(s)}</text>`,
        )
        .join("");
      return `<g data-node="${escape(n.id)}" data-role="${escape(n.role)}" opacity="${nodeProgress[n.id] ?? 1}"><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="7" fill="${escape(fill)}" stroke="${escape(ink)}" stroke-width="${activeN.has(n.id) ? 2.5 : 1.5}"/>${n.role ? `<text x="${n.x + n.width / 2}" y="${n.y + 17}" font-size="${font * 0.65}" text-anchor="middle" dominant-baseline="middle" fill="${escape(ink)}">${escape(n.role)}</text>` : ""}${label}</g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="100%" height="100%" role="img" aria-label="${escape(title)}" style="font-family:system-ui,sans-serif"><title>${escape(title)}</title>${connections}${boxes}</svg>`;
}
