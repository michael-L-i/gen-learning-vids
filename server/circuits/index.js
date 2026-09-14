// Pure, deterministic browser helpers. Electrical values use SI units.
const finite = (v, name) => {
  if (!Number.isFinite(v)) throw new Error(`${name} must be finite`);
  return v;
};
const positive = (v, name) => {
  finite(v, name);
  if (v <= 0) throw new Error(`${name} must be positive`);
  return v;
};
const id = (v) => {
  if (typeof v !== "string" || !v.length)
    throw new Error("Identity must be a nonempty string");
  return v;
};
const escape = (v) =>
  String(v).replace(
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
const point = (p) => ({ x: finite(p.x, "x"), y: finite(p.y, "y") });

/** Analytic ideal series RC response, t >= 0. Current enters capacitor's positive terminal. */
export function rcStep({
  resistance,
  capacitance,
  initialVoltage = 0,
  sourceVoltage,
}) {
  positive(resistance, "resistance");
  positive(capacitance, "capacitance");
  finite(initialVoltage, "initialVoltage");
  finite(sourceVoltage, "sourceVoltage");
  const tau = positive(resistance * capacitance, "time constant");
  return {
    tau,
    at(seconds) {
      finite(seconds, "seconds");
      if (seconds < 0) throw new Error("seconds must be nonnegative");
      const resistorVoltage =
        (sourceVoltage - initialVoltage) * Math.exp(-seconds / tau);
      const voltage = sourceVoltage - resistorVoltage;
      const current = resistorVoltage / resistance;
      const charge = capacitance * voltage;
      const energy = 0.5 * capacitance * voltage * voltage;
      for (const v of [voltage, current, charge, energy])
        finite(v, "computed state");
      return { seconds, voltage, current, resistorVoltage, charge, energy };
    },
  };
}

/** Linear resistors between named nodes, with ideal fixed node potentials (volts).
 * Branch current is positive from a to b. Floating components are rejected.
 * Source currents, capacitors, nonlinear devices and arbitrary voltage sources are out of scope.
 */
export function solveDC({ nodes, fixed, resistors }) {
  if (
    !Array.isArray(nodes) ||
    !nodes.length ||
    new Set(nodes.map(id)).size !== nodes.length
  )
    throw new Error("Nodes must have unique identities");
  if (!fixed || !Array.isArray(resistors))
    throw new Error("Provide fixed potentials and resistors");
  const known = new Map(Object.entries(fixed));
  for (const [n, v] of known) {
    if (!nodes.includes(n)) throw new Error(`Unknown fixed node ${n}`);
    finite(v, "potential");
  }
  const names = new Set();
  const adjacency = new Map(nodes.map((n) => [n, []]));
  for (const r of resistors) {
    id(r.id);
    if (names.has(r.id)) throw new Error("Duplicate resistor identity");
    names.add(r.id);
    if (!nodes.includes(r.a) || !nodes.includes(r.b) || r.a === r.b)
      throw new Error("Resistor needs two distinct declared nodes");
    positive(r.resistance, "resistance");
    positive(1 / r.resistance, "conductance");
    adjacency.get(r.a).push(r.b);
    adjacency.get(r.b).push(r.a);
  }
  const reached = new Set(known.keys()),
    queue = [...reached];
  for (let i = 0; i < queue.length; i++)
    for (const n of adjacency.get(queue[i]))
      if (!reached.has(n)) {
        reached.add(n);
        queue.push(n);
      }
  if (reached.size !== nodes.length)
    throw new Error(
      "Floating network: every component needs a fixed potential",
    );
  const unknown = nodes.filter((n) => !known.has(n)),
    size = unknown.length;
  const index = new Map(unknown.map((n, i) => [n, i]));
  const a = Array.from({ length: size }, () => Array(size + 1).fill(0));
  for (const r of resistors)
    for (const [n, other] of [
      [r.a, r.b],
      [r.b, r.a],
    ]) {
      if (!index.has(n)) continue;
      const i = index.get(n),
        g = 1 / r.resistance;
      a[i][i] += g;
      if (index.has(other)) a[i][index.get(other)] -= g;
      else a[i][size] += g * known.get(other);
    }
  // Scale rows before partial-pivot elimination, so uniform resistance scale is irrelevant.
  for (const row of a) {
    const scale = Math.max(...row.slice(0, size).map(Math.abs));
    for (let j = 0; j <= size; j++) row[j] /= scale;
  }
  for (let k = 0; k < size; k++) {
    let pivot = k;
    for (let i = k + 1; i < size; i++)
      if (Math.abs(a[i][k]) > Math.abs(a[pivot][k])) pivot = i;
    if (Math.abs(a[pivot][k]) < 1e-12)
      throw new Error("Ill-conditioned resistor network");
    [a[k], a[pivot]] = [a[pivot], a[k]];
    const divisor = a[k][k];
    for (let j = k; j <= size; j++) a[k][j] /= divisor;
    for (let i = 0; i < size; i++)
      if (i !== k) {
        const factor = a[i][k];
        for (let j = k; j <= size; j++) a[i][j] -= factor * a[k][j];
      }
  }
  const potentials = Object.fromEntries(
    nodes.map((n) => [
      n,
      known.has(n) ? known.get(n) : finite(a[index.get(n)][size], "solution"),
    ]),
  );
  const branches = resistors.map((r) => {
    const voltage = potentials[r.a] - potentials[r.b],
      current = voltage / r.resistance;
    finite(current, "current");
    return {
      ...r,
      voltage,
      current,
      power: finite(voltage * current, "power"),
    };
  });
  const netOutflow = Object.fromEntries(nodes.map((n) => [n, 0]));
  for (const r of branches) {
    netOutflow[r.a] += r.current;
    netOutflow[r.b] -= r.current;
  }
  return { potentials, branches, netOutflow };
}

/** Symbol SVG fragment and terminal anchors in the caller's coordinates.
 * a is the positive voltage reference; conventional current reference runs a -> b.
 * Node identity is explicit; touching/crossing SVG wires never infers connectivity.
 */
export function circuitSymbol({
  kind,
  id: identity,
  a,
  b,
  nodeA,
  nodeB,
  label = "",
  color = "#243444",
}) {
  id(identity);
  id(nodeA);
  id(nodeB);
  a = point(a);
  b = point(b);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 64)
    throw new Error("Symbol terminals must be at least 64 units apart");
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    mid = length / 2;
  const line = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} L${x2} ${y2}"/>`;
  let body;
  if (kind === "resistor")
    body =
      line(0, 0, mid - 24, 0) +
      `<path d="M${mid - 24} 0 l4 -10 8 20 8 -20 8 20 8 -20 8 10"/>` +
      line(mid + 20, 0, length, 0);
  else if (kind === "capacitor")
    body =
      line(0, 0, mid - 7, 0) +
      line(mid - 7, -24, mid - 7, 24) +
      line(mid + 7, -24, mid + 7, 24) +
      line(mid + 7, 0, length, 0);
  else if (kind === "voltageSource")
    body =
      line(0, 0, mid - 25, 0) +
      `<circle cx="${mid}" cy="0" r="25"/>` +
      line(mid + 25, 0, length, 0) +
      line(mid - 16, 0, mid - 6, 0) +
      line(mid - 11, -5, mid - 11, 5) +
      line(mid + 7, 0, mid + 17, 0);
  else throw new Error(`Unsupported circuit symbol ${kind}`);
  return {
    terminals: { a: { ...a, node: nodeA }, b: { ...b, node: nodeB } },
    svg: `<g data-component="${escape(identity)}" stroke="${escape(color)}" stroke-width="3" fill="none"><g transform="translate(${a.x} ${a.y}) rotate(${angle})">${body}</g></g>${label ? `<text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 36}" text-anchor="middle" fill="${escape(color)}">${escape(label)}</text>` : ""}`,
  };
}

export function circuitWire({ from, to, via = [], color = "#243444" }) {
  if (id(from.node) !== id(to.node))
    throw new Error("A wire must connect terminals on the same declared node");
  const points = [from, ...via, to].map(point);
  return `<polyline data-node="${escape(from.node)}" points="${points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${escape(color)}" stroke-width="3"/>`;
}

/** Sample a scalar signal into a plot-local polyline. No implied time playback. */
export function signalTrace({
  signal,
  start = 0,
  end,
  min,
  max,
  width,
  height,
  samples = 120,
}) {
  finite(start, "start");
  finite(end, "end");
  finite(min, "min");
  finite(max, "max");
  positive(width, "width");
  positive(height, "height");
  if (
    end <= start ||
    max <= min ||
    !Number.isInteger(samples) ||
    samples < 2 ||
    samples > 10000
  )
    throw new Error("Invalid signal domain, range or sample count");
  if (typeof signal !== "function")
    throw new Error("signal must be a function");
  return Array.from({ length: samples }, (_, i) => {
    const t = start + ((end - start) * i) / (samples - 1),
      v = finite(signal(t), "signal value");
    return [
      (width * i) / (samples - 1),
      height * (1 - (v - min) / (max - min)),
    ].join(",");
  }).join(" ");
}
