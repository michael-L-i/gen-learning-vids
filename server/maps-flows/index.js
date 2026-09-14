import { geoMercator, geoPath, geoInterpolate, geoDistance } from "d3-geo";
import { scaleUtc } from "d3-scale";
import { utcDay, utcMonth, utcYear } from "d3-time";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";

const finite = (v, name) => {
  if (!Number.isFinite(v)) throw new TypeError(`${name} must be finite`);
  return v;
};
const positive = (v, name) => {
  if (finite(v, name) <= 0) throw new RangeError(`${name} must be positive`);
  return v;
};
const idOf = (id) => {
  if (typeof id !== "string" || !id.trim())
    throw new TypeError("IDs must be nonempty strings");
  return id;
};
const coordinate = (p) => {
  if (
    !Array.isArray(p) ||
    p.length < 2 ||
    !Number.isFinite(p[0]) ||
    !Number.isFinite(p[1]) ||
    Math.abs(p[0]) > 180 ||
    Math.abs(p[1]) > 90
  )
    throw new RangeError(
      "Coordinates must be [longitude, latitude] in degrees",
    );
  return p.slice(0, 2);
};
function geometry(g) {
  if (!g || typeof g !== "object")
    throw new TypeError("GeoJSON geometry is required");
  if (g.type === "GeometryCollection") {
    if (!Array.isArray(g.geometries))
      throw new TypeError("Invalid GeometryCollection");
    return { type: g.type, geometries: g.geometries.map(geometry) };
  }
  const depth = {
    Point: 0,
    MultiPoint: 1,
    LineString: 1,
    MultiLineString: 2,
    Polygon: 2,
    MultiPolygon: 3,
  }[g.type];
  if (depth === undefined) throw new TypeError("Unsupported GeoJSON geometry");
  const walk = (a, d) => {
    if (!d) return coordinate(a);
    if (!Array.isArray(a) || !a.length)
      throw new TypeError("Empty geometry coordinates");
    return a.map((x) => walk(x, d - 1));
  };
  const coordinates = walk(g.coordinates, depth);
  const rings =
    g.type === "Polygon"
      ? coordinates
      : g.type === "MultiPolygon"
        ? coordinates.flat()
        : [];
  for (const r of rings)
    if (r.length < 4 || r[0][0] !== r.at(-1)[0] || r[0][1] !== r.at(-1)[1])
      throw new RangeError(
        "Polygon rings must be closed with at least four coordinates",
      );
  if (
    (g.type === "LineString" && coordinates.length < 2) ||
    (g.type === "MultiLineString" && coordinates.some((l) => l.length < 2))
  )
    throw new RangeError("Lines require at least two coordinates");
  return { type: g.type, coordinates };
}

/** Bounded Mercator view. Polygon input uses D3 spherical winding. */
export function geographicMap({
  features = [],
  bounds,
  width,
  height,
  padding = 16,
}) {
  positive(width, "width");
  positive(height, "height");
  finite(padding, "padding");
  if (padding < 0 || 2 * padding >= Math.min(width, height))
    throw new RangeError("padding leaves no map area");
  if (
    !Array.isArray(bounds) ||
    bounds.length !== 4 ||
    !bounds.every(Number.isFinite)
  )
    throw new TypeError("bounds must be [west,south,east,north]");
  const [w, s, e, n] = bounds;
  if (w < -180 || e > 180 || w >= e || s < -85 || n > 85 || s >= n)
    throw new RangeError(
      "Use ordered non-antimeridian bounds within ±85° latitude",
    );
  if (!Array.isArray(features))
    throw new TypeError("features must be an array");
  const ids = new Set();
  const data = features.map((f) => {
    const id = idOf(f.id);
    if (ids.has(id)) throw new RangeError("Duplicate feature ID");
    ids.add(id);
    return {
      type: "Feature",
      id,
      properties: { ...f.properties },
      geometry: geometry(f.geometry),
    };
  });
  const projection = geoMercator()
    .fitExtent(
      [
        [padding, padding],
        [width - padding, height - padding],
      ],
      {
        type: "MultiPoint",
        coordinates: [
          [w, s],
          [e, n],
        ],
      },
    )
    .clipExtent([
      [padding, padding],
      [width - padding, height - padding],
    ]);
  projection.clipExtent([projection([w, n]), projection([e, s])]);
  const path = geoPath(projection);
  const point = (p) => {
    const q = coordinate(p);
    if (q[0] < w || q[0] > e || q[1] < s || q[1] > n) return null;
    const out = projection(q);
    out.forEach((x) => finite(x, "projected coordinate"));
    return out;
  };
  return {
    paths: data.map((f) => ({
      id: f.id,
      label: f.properties.name ?? f.id,
      path: path(f) ?? "",
    })),
    point,
    route({ id, from, to, progress = 1, steps = 128 }) {
      idOf(id);
      const a = coordinate(from),
        b = coordinate(to);
      finite(progress, "progress");
      if (!Number.isInteger(steps) || steps < 2 || steps > 4096)
        throw new RangeError("steps must be an integer from 2 to 4096");
      const angle = geoDistance(a, b);
      if (Math.PI - angle < 1e-8)
        throw new RangeError("Antipodal routes have no unique shortest path");
      const t = Math.max(0, Math.min(1, progress)),
        interpolate = geoInterpolate(a, b);
      const line = (end) => ({
        type: "LineString",
        coordinates: Array.from({ length: steps + 1 }, (_, i) =>
          interpolate((end * i) / steps),
        ),
      });
      return {
        id,
        path: path(line(1)) ?? "",
        revealedPath: t === 0 ? "" : (path(line(t)) ?? ""),
        point: point(interpolate(t)),
        angularDistance: angle,
      };
    },
  };
}

function timestamp(value) {
  if (value instanceof Date) return finite(+value, "date");
  if (typeof value === "number") {
    finite(value, "timestamp");
    if (!Number.isFinite(+new Date(value)))
      throw new RangeError("Timestamp outside Date range");
    return value;
  }
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value)
  )
    throw new TypeError("Use a Date, epoch milliseconds, or UTC ISO date");
  const ms = Date.parse(value);
  finite(ms, "date");
  if (new Date(ms).toISOString().slice(0, 10) !== value.slice(0, 10))
    throw new RangeError("Invalid calendar date");
  if (
    value.includes("T") &&
    new Date(ms).toISOString() !== value.replace(/(?<=:\d{2})Z$/, ".000Z")
  )
    throw new RangeError("Invalid UTC time");
  return ms;
}

/** Explicit mapping from narration seconds to UTC calendar time. */
export function utcTimeline({ domain, duration, range = [0, 1] }) {
  if (!Array.isArray(domain) || domain.length !== 2)
    throw new TypeError("domain needs two dates");
  const [a, b] = domain.map(timestamp);
  if (a >= b) throw new RangeError("Dates must increase");
  positive(duration, "duration");
  if (
    !Array.isArray(range) ||
    range.length !== 2 ||
    !range.every(Number.isFinite) ||
    range[0] >= range[1]
  )
    throw new RangeError("range must increase");
  const scale = scaleUtc().domain([a, b]).range(range).clamp(true);
  const atTime = (value) => {
    const ms = Math.max(a, Math.min(b, timestamp(value)));
    return {
      timestamp: ms,
      iso: new Date(ms).toISOString(),
      progress: (ms - a) / (b - a),
      x: scale(ms),
    };
  };
  return {
    at(seconds) {
      finite(seconds, "seconds");
      return atTime(a + (b - a) * Math.max(0, Math.min(1, seconds / duration)));
    },
    atTime,
    ticks({ unit = "month", every = 1 } = {}) {
      const interval = { day: utcDay, month: utcMonth, year: utcYear }[unit];
      if (!interval || !Number.isInteger(every) || every < 1 || every > 10000)
        throw new RangeError(
          "Use day/month/year and a positive integer every <= 10000",
        );
      if (interval.count(new Date(a), new Date(b)) / every > 2000)
        throw new RangeError("Too many ticks; increase every");
      return scale
        .ticks(interval.every(every))
        .map((d) => ({ id: d.toISOString(), ...atTime(d) }));
    },
  };
}

/** Acyclic amounts, with optional fixed pixel scale for honest comparisons. */
export function flowLayout(
  { nodes, links, unit },
  {
    width,
    height,
    nodeWidth = 20,
    nodePadding = 20,
    iterations = 16,
    pixelsPerUnit,
  } = {},
) {
  positive(width, "width");
  positive(height, "height");
  positive(nodeWidth, "nodeWidth");
  finite(nodePadding, "nodePadding");
  if (
    nodeWidth >= width ||
    nodePadding < 0 ||
    !Number.isInteger(iterations) ||
    iterations < 0 ||
    iterations > 64
  )
    throw new RangeError("Invalid flow layout dimensions or iterations");
  if (typeof unit !== "string" || !unit.trim())
    throw new TypeError("A shared amount unit is required");
  if (
    !Array.isArray(nodes) ||
    nodes.length < 2 ||
    nodes.length > 200 ||
    !Array.isArray(links) ||
    !links.length ||
    links.length > 1000
  )
    throw new RangeError("Use 2–200 nodes and 1–1000 links");
  const ids = new Map(),
    edgeIds = new Set();
  const ns = nodes.map((n) => {
    const id = idOf(n.id);
    if (ids.has(id)) throw new RangeError("Duplicate node ID");
    const out = { id, label: String(n.label ?? id), incoming: 0, outgoing: 0 };
    ids.set(id, out);
    return out;
  });
  const ls = links.map((l) => {
    const id = idOf(l.id);
    if (edgeIds.has(id)) throw new RangeError("Duplicate link ID");
    edgeIds.add(id);
    if (!ids.has(l.source) || !ids.has(l.target) || l.source === l.target)
      throw new RangeError("Links require distinct existing node IDs");
    if (l.unit !== undefined && l.unit !== unit)
      throw new RangeError("Mixed amount units");
    if (finite(l.value, "amount") < 0)
      throw new RangeError("Amounts cannot be negative");
    ids.get(l.source).outgoing += l.value;
    ids.get(l.target).incoming += l.value;
    return { id, source: l.source, target: l.target, value: l.value };
  });
  if (!ls.some((l) => l.value > 0))
    throw new RangeError("At least one amount must be positive");
  ns.forEach((n) => {
    finite(n.incoming, "total");
    finite(n.outgoing, "total");
  });
  const indegree = new Map(ns.map((n) => [n.id, 0])),
    adjacency = new Map(ns.map((n) => [n.id, []]));
  ls.forEach((l) => {
    indegree.set(l.target, indegree.get(l.target) + 1);
    adjacency.get(l.source).push(l.target);
  });
  const queue = ns.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  for (let i = 0; i < queue.length; i++)
    for (const target of adjacency.get(queue[i])) {
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  if (queue.length !== ns.length)
    throw new RangeError("Sankey flows must be acyclic");
  const generator = sankey()
    .nodeId((n) => n.id)
    .nodeWidth(nodeWidth)
    .nodePadding(nodePadding)
    .nodeSort(null)
    .linkSort(null)
    .extent([
      [0, 0],
      [width, height],
    ])
    .iterations(iterations);
  const graph = generator({ nodes: ns, links: ls });
  if (pixelsPerUnit !== undefined) {
    positive(pixelsPerUnit, "pixelsPerUnit");
    const columns = new Map();
    ns.forEach((n) => {
      if (!columns.has(n.layer)) columns.set(n.layer, []);
      columns.get(n.layer).push(n);
    });
    for (const column of columns.values()) {
      const used =
        column.reduce((s, n) => s + n.value * pixelsPerUnit, 0) +
        (column.length - 1) * nodePadding;
      if (!Number.isFinite(used) || used > height)
        throw new RangeError(
          "Fixed amount scale exceeds height; reduce pixelsPerUnit or increase height",
        );
      let y = (height - used) / 2;
      for (const n of column) {
        n.y0 = y;
        n.y1 = y + n.value * pixelsPerUnit;
        y = n.y1 + nodePadding;
      }
    }
    ls.forEach((l) => {
      l.width = l.value * pixelsPerUnit;
    });
    generator.update(graph);
  } else
    pixelsPerUnit =
      ls.find((l) => l.value > 0).width / ls.find((l) => l.value > 0).value;
  const shape = sankeyLinkHorizontal();
  for (const n of ns)
    [n.x0, n.x1, n.y0, n.y1, n.value].forEach((v) =>
      finite(v, "layout coordinate"),
    );
  for (const l of ls) {
    [l.width, l.y0, l.y1].forEach((v) => finite(v, "link coordinate"));
    if (l.source.x1 > l.target.x0)
      throw new RangeError(
        "Flow layers overlap; increase width or reduce nodeWidth",
      );
  }
  return {
    unit,
    pixelsPerUnit,
    nodes: ns.map((n) => ({
      id: n.id,
      label: n.label,
      x0: n.x0,
      x1: n.x1,
      y0: n.y0,
      y1: n.y1,
      value: n.value,
      incoming: n.incoming,
      outgoing: n.outgoing,
      balance: n.outgoing - n.incoming,
    })),
    links: ls.map((l) => ({
      id: l.id,
      source: l.source.id,
      target: l.target.id,
      value: l.value,
      width: l.width,
      y0: l.y0,
      y1: l.y1,
      path: shape(l),
    })),
  };
}
