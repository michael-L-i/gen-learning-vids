// Deterministic physics models and SVG helpers for authored browser scenes.
const finite = (value, name) => {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
};
const positive = (value, name) => {
  finite(value, name);
  if (value <= 0) throw new Error(`${name} must be positive`);
  return value;
};
const point = (p, name = "point") => {
  if (!Array.isArray(p) || p.length !== 2)
    throw new Error(`${name} must contain x and y`);
  return p.map((v) => finite(v, name));
};
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (n) => Number(n.toFixed(5));
const path = (points) =>
  points.map((p, i) => `${i ? "L" : "M"}${p.map(fmt).join(" ")}`).join(" ");
const strokePath = (points, stroke, width, extra = "") =>
  `<path d="${path(points)}" fill="none" stroke="${esc(stroke)}" stroke-width="${positive(width, "stroke width")}" ${extra}/>`;

export function harmonicOscillator({
  mass,
  stiffness,
  position = 0,
  velocity = 0,
}) {
  positive(mass, "mass");
  positive(stiffness, "stiffness");
  finite(position, "position");
  finite(velocity, "velocity");
  const omega = Math.sqrt(stiffness / mass);
  return Object.freeze({
    omega,
    period: (2 * Math.PI) / omega,
    at(t) {
      finite(t, "time");
      const x =
        position * Math.cos(omega * t) +
        (velocity / omega) * Math.sin(omega * t);
      const v =
        -position * omega * Math.sin(omega * t) +
        velocity * Math.cos(omega * t);
      return {
        t,
        x,
        v,
        a: -omega * omega * x,
        force: -stiffness * x,
        kinetic: 0.5 * mass * v * v,
        potential: 0.5 * stiffness * x * x,
      };
    },
  });
}

export function constantAcceleration({
  position = [0, 0],
  velocity = [0, 0],
  acceleration = [0, 0],
}) {
  const p = point(position, "position"),
    v = point(velocity, "velocity"),
    a = point(acceleration, "acceleration");
  return Object.freeze({
    at(t) {
      finite(t, "time");
      return {
        t,
        position: p.map((x, i) => x + v[i] * t + 0.5 * a[i] * t * t),
        velocity: v.map((x, i) => x + a[i] * t),
        acceleration: [...a],
      };
    },
  });
}

export function cartesianFrame({ origin = [0, 0], scale = 1 } = {}) {
  const o = point(origin, "origin");
  positive(scale, "scale");
  return Object.freeze({
    point(p) {
      const [x, y] = point(p);
      return [o[0] + scale * x, o[1] - scale * y];
    },
    vector(p) {
      const [x, y] = point(p);
      return [scale * x, -scale * y];
    },
  });
}

export function body({
  center,
  size = [80, 60],
  angle = 0,
  shape = "block",
  fill = "#e6edf4",
  stroke = "#243649",
  strokeWidth = 3,
}) {
  const [x, y] = point(center),
    [w, h] = point(size, "size");
  positive(w, "width");
  positive(h, "height");
  finite(angle, "angle");
  positive(strokeWidth, "stroke width");
  if (!["block", "disk"].includes(shape))
    throw new Error("body shape must be block or disk");
  if (shape === "disk" && w !== h)
    throw new Error("A disk needs equal width and height");
  const local = {
    center: [0, 0],
    left: [-w / 2, 0],
    right: [w / 2, 0],
    top: [0, -h / 2],
    bottom: [0, h / 2],
  };
  const anchors = Object.fromEntries(
    Object.entries(local).map(([key, [dx, dy]]) => [
      key,
      [
        x + dx * Math.cos(angle) - dy * Math.sin(angle),
        y + dx * Math.sin(angle) + dy * Math.cos(angle),
      ],
    ]),
  );
  const geometry =
    shape === "disk"
      ? `<circle cx="0" cy="0" r="${w / 2}"/>`
      : `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="5"/>`;
  return {
    anchors,
    bounds: {
      x:
        x - (Math.abs(w * Math.cos(angle)) + Math.abs(h * Math.sin(angle))) / 2,
      y:
        y - (Math.abs(w * Math.sin(angle)) + Math.abs(h * Math.cos(angle))) / 2,
      width: Math.abs(w * Math.cos(angle)) + Math.abs(h * Math.sin(angle)),
      height: Math.abs(w * Math.sin(angle)) + Math.abs(h * Math.cos(angle)),
    },
    svg: `<g transform="translate(${x} ${y}) rotate(${(angle * 180) / Math.PI})" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${strokeWidth}">${geometry}</g>`,
  };
}

export function spring({
  from,
  to,
  coils = 9,
  amplitude = 12,
  stroke = "#526b81",
  strokeWidth = 3,
}) {
  const a = point(from),
    b = point(to);
  positive(amplitude, "amplitude");
  if (!Number.isInteger(coils) || coils < 1 || coils > 200)
    throw new Error("coils must be an integer from 1 to 200");
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = Math.hypot(dx, dy);
  positive(length, "spring length");
  const at = (s, n = 0) => [
    a[0] + dx * s - (dy / length) * n,
    a[1] + dy * s + (dx / length) * n,
  ];
  const points = [a, at(0.12)];
  for (let i = 0; i < coils * 2; i++)
    points.push(
      at(
        0.12 + (0.76 * (i + 0.5)) / (coils * 2),
        i % 2 ? amplitude : -amplitude,
      ),
    );
  points.push(at(0.88), b);
  return {
    anchors: { from: [...a], to: [...b] },
    svg: strokePath(points, stroke, strokeWidth),
  };
}

export function pulley({
  center,
  radius = 30,
  stroke = "#526b81",
  strokeWidth = 3,
}) {
  const [x, y] = point(center);
  positive(radius, "radius");
  positive(strokeWidth, "stroke width");
  return {
    anchors: {
      center: [x, y],
      left: [x - radius, y],
      right: [x + radius, y],
      top: [x, y - radius],
      bottom: [x, y + radius],
    },
    svg: `<g fill="none" stroke="${esc(stroke)}" stroke-width="${strokeWidth}"><circle cx="${x}" cy="${y}" r="${radius}"/><circle cx="${x}" cy="${y}" r="4"/></g>`,
  };
}

export function ramp({
  from,
  to,
  depth = 60,
  fill = "#e7edf1",
  stroke = "#526b81",
  strokeWidth = 2,
}) {
  const a = point(from),
    b = point(to);
  positive(depth, "depth");
  positive(strokeWidth, "stroke width");
  if (a[0] === b[0])
    throw new Error("ramp endpoints need different x coordinates");
  const base = Math.max(a[1], b[1]) + depth;
  return {
    anchors: { from: [...a], to: [...b] },
    svg: `<path d="${path([a, b, [b[0], base], [a[0], base]])} Z" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${strokeWidth}"/>`,
  };
}

export function rope({ points, stroke = "#526b81", strokeWidth = 3 }) {
  if (!Array.isArray(points) || points.length < 2)
    throw new Error("rope needs at least two points");
  return strokePath(
    points.map((p) => point(p)),
    stroke,
    strokeWidth,
  );
}

export function vectorArrow({
  from,
  vector,
  scale = 1,
  color = "#ba5522",
  strokeWidth = 3,
  head = 11,
}) {
  const a = point(from),
    v = point(vector);
  positive(scale, "arrow scale");
  positive(head, "arrow head");
  const dx = v[0] * scale,
    dy = v[1] * scale,
    l = Math.hypot(dx, dy);
  positive(strokeWidth, "stroke width");
  const to = [a[0] + dx, a[1] + dy];
  if (l < 1e-9) return { from: [...a], to, svg: "" };
  const h = Math.min(head, l * 0.6),
    ux = dx / l,
    uy = dy / l;
  const left = [to[0] - ux * h - uy * h * 0.45, to[1] - uy * h + ux * h * 0.45],
    right = [to[0] - ux * h + uy * h * 0.45, to[1] - uy * h - ux * h * 0.45];
  return {
    from: [...a],
    to,
    svg:
      strokePath([a, to], color, strokeWidth) +
      `<path d="${path([left, to, right])} Z" fill="${esc(color)}"/>`,
  };
}

export function angleMarker({
  center,
  radius = 30,
  start,
  end,
  color = "#526b81",
  strokeWidth = 2,
}) {
  const [x, y] = point(center);
  positive(radius, "radius");
  finite(start, "start angle");
  finite(end, "end angle");
  positive(strokeWidth, "stroke width");
  if (Math.abs(end - start) > 2 * Math.PI)
    throw new Error("angle sweep cannot exceed one turn");
  const count = Math.max(2, Math.ceil(Math.abs(end - start) * 16));
  return strokePath(
    Array.from({ length: count + 1 }, (_, i) => {
      const a = start + ((end - start) * i) / count;
      return [x + radius * Math.cos(a), y + radius * Math.sin(a)];
    }),
    color,
    strokeWidth,
  );
}

export function sampleState(model, { start = 0, end, samples = 241 }) {
  finite(start, "start");
  finite(end, "end");
  if (end <= start) throw new Error("end must exceed start");
  if (!Number.isInteger(samples) || samples < 2 || samples > 100000)
    throw new Error("samples must be an integer from 2 to 100000");
  if (typeof model?.at !== "function")
    throw new Error("model must expose at(time)");
  return Array.from({ length: samples }, (_, i) =>
    model.at(start + ((end - start) * i) / (samples - 1)),
  );
}

// Plot state samples from the same model as the diagram. No physics easing.
export function linkedGraph({
  states,
  x = "t",
  y,
  box,
  xDomain,
  yDomain,
  color = "#167d84",
  xLabel = "",
  yLabel = "",
  cursor = null,
  strokeWidth = 3,
}) {
  if (!Array.isArray(states) || states.length < 2)
    throw new Error("graph needs at least two states");
  const b = rect(box),
    xd = domain(xDomain, "x domain"),
    yd = domain(yDomain, "y domain");
  positive(strokeWidth, "stroke width");
  const get = (state, field) =>
    finite(
      typeof field === "function" ? field(state) : state[field],
      "graph value",
    );
  const coords = states.map((s) => [get(s, x), get(s, y)]);
  const map = ([px, py]) => [
    b.x + ((px - xd[0]) / (xd[1] - xd[0])) * b.width,
    b.y + b.height - ((py - yd[0]) / (yd[1] - yd[0])) * b.height,
  ];
  if (
    coords.some(
      (p) =>
        p[0] < xd[0] - 1e-10 ||
        p[0] > xd[1] + 1e-10 ||
        p[1] < yd[0] - 1e-10 ||
        p[1] > yd[1] + 1e-10,
    )
  )
    throw new Error("graph samples lie outside explicit domains");
  const axisX = map([0, Math.max(yd[0], Math.min(0, yd[1]))])[1];
  let svg =
    strokePath(
      [
        [b.x, b.y],
        [b.x, b.y + b.height],
        [b.x + b.width, b.y + b.height],
      ],
      "#aebbc8",
      1.5,
    ) +
    strokePath(
      [
        [b.x, axisX],
        [b.x + b.width, axisX],
      ],
      "#c7d0d9",
      1,
    );
  svg += strokePath(coords.map(map), color, strokeWidth);
  let marker = null;
  if (cursor) {
    const p = [get(cursor, x), get(cursor, y)];
    if (p[0] < xd[0] || p[0] > xd[1] || p[1] < yd[0] || p[1] > yd[1])
      throw new Error("cursor lies outside graph domains");
    marker = map(p);
    svg +=
      strokePath(
        [
          [marker[0], b.y],
          [marker[0], b.y + b.height],
        ],
        "#8595a5",
        1,
        'stroke-dasharray="4 5"',
      ) +
      `<circle cx="${marker[0]}" cy="${marker[1]}" r="5" fill="${esc(color)}"/>`;
  }
  svg += `<text x="${b.x + b.width}" y="${b.y + b.height + 25}" text-anchor="end" fill="#526174" font-size="18">${esc(xLabel)}</text><text x="${b.x}" y="${b.y - 12}" fill="${esc(color)}" font-size="20">${esc(yLabel)}</text>`;
  return { svg, point: map, marker };
}
function domain(d, name) {
  const p = point(d, name);
  if (p[1] <= p[0]) throw new Error(`${name} must increase`);
  return p;
}
function rect(r) {
  if (!r) throw new Error("rectangle required");
  finite(r.x, "x");
  finite(r.y, "y");
  positive(r.width, "width");
  positive(r.height, "height");
  return { ...r };
}
const intersects = (a, b, gap = 0) =>
  a.x < b.x + b.width + gap &&
  a.x + a.width + gap > b.x &&
  a.y < b.y + b.height + gap &&
  a.y + a.height + gap > b.y;

// Callers supply measured text boxes (e.g. SVG getBBox); no font-width guesses.
export function placeLabels(labels, { bounds, obstacles = [], gap = 8 } = {}) {
  const area = rect(bounds);
  finite(gap, "gap");
  if (gap < 0) throw new Error("gap cannot be negative");
  if (
    !Array.isArray(labels) ||
    new Set(labels.map((l) => l.id)).size !== labels.length
  )
    throw new Error("labels need unique IDs");
  const occupied = obstacles.map(rect),
    placements = [],
    unplaced = [];
  for (const label of labels) {
    if (typeof label.id !== "string" || !label.id)
      throw new Error("label ID required");
    const a = point(label.anchor);
    positive(label.width, "label width");
    positive(label.height, "label height");
    const offsets =
      label.offsets ??
      [gap, gap + 16, gap + 40, gap + 72].flatMap((distance) => [
        [distance, -label.height / 2],
        [-distance - label.width, -label.height / 2],
        [-label.width / 2, -distance - label.height],
        [-label.width / 2, distance],
      ]);
    if (!Array.isArray(offsets))
      throw new Error("label offsets must be an array");
    const candidates = offsets.map((p) => {
      const [dx, dy] = point(p, "label offset");
      return {
        x: a[0] + dx,
        y: a[1] + dy,
        width: label.width,
        height: label.height,
      };
    });
    const chosen = candidates.find(
      (r) =>
        r.x >= area.x &&
        r.y >= area.y &&
        r.x + r.width <= area.x + area.width &&
        r.y + r.height <= area.y + area.height &&
        !occupied.some((o) => intersects(r, o, gap)),
    );
    if (!chosen) {
      unplaced.push(label.id);
      continue;
    }
    occupied.push(chosen);
    placements.push({ id: label.id, anchor: [...a], ...chosen });
  }
  return { placements, unplaced };
}
