/** Small deterministic statistical geometry/data tools; no renderer or inference policy. */
function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function integer(value, name, max = 0xffffffff) {
  if (!Number.isInteger(value) || value < 0 || value > max)
    throw new RangeError(`${name} must be an integer in [0, ${max}]`);
  return value;
}
/** Counter-addressed integer mixing for reproducible visual simulations, not cryptography. */
export function seededUniform(seed, index) {
  integer(seed, "seed");
  integer(index, "index");
  let x = (index + seed + 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 0x100000000;
}
/** Finite numeric support and explicit nonnegative weights. */
export function discreteDistribution(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 10000)
    throw new RangeError("provide 1–10000 outcomes");
  const outcomes = entries.map(({ id, value, weight }) => {
    if (typeof id !== "string" || !id)
      throw new TypeError("outcome IDs must be nonempty strings");
    finite(value, "outcome value");
    finite(weight, "weight");
    if (weight < 0) throw new RangeError("weights must be nonnegative");
    return { id, value, weight };
  });
  if (new Set(outcomes.map((o) => o.id)).size !== outcomes.length)
    throw new TypeError("outcome IDs must be unique");
  const total = finite(
    outcomes.reduce((sum, o) => sum + o.weight, 0),
    "total weight",
  );
  if (total <= 0) throw new RangeError("total weight must be positive");
  let cumulative = 0;
  const active = [];
  const probabilities = outcomes.map((o) => {
    const probability = o.weight / total;
    if (o.weight > 0) {
      cumulative += probability;
      active.push({ ...o, cumulative });
    }
    return Object.freeze({ id: o.id, value: o.value, probability });
  });
  active.at(-1).cumulative = 1; // Preserve the last positive outcome despite rounding.
  const mean = finite(
    probabilities.reduce((sum, o) => sum + o.value * o.probability, 0),
    "mean",
  );
  const variance = finite(
    probabilities.reduce(
      (sum, o) =>
        sum + (o.probability === 0 ? 0 : o.probability * (o.value - mean) ** 2),
      0,
    ),
    "variance",
  );
  function sampleAt(seed, index) {
    const u = seededUniform(seed, index);
    let lo = 0,
      hi = active.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (u < active[mid].cumulative) hi = mid;
      else lo = mid + 1;
    }
    return { index, outcomeId: active[lo].id, value: active[lo].value };
  }
  return Object.freeze({
    outcomes: Object.freeze(probabilities),
    mean,
    variance,
    sampleAt,
    sample({ seed, count, start = 0 }) {
      integer(seed, "seed");
      integer(count, "count", 1000000);
      integer(start, "start");
      if (count && start + count - 1 > 0xffffffff)
        throw new RangeError("sample indices exceed uint32 range");
      return Array.from({ length: count }, (_, i) => sampleAt(seed, start + i));
    },
  });
}
/** Half-open bins [left,right), except the final bin includes its right edge. */
export function histogram(values, edges) {
  if (!Array.isArray(values) || values.length > 1000000)
    throw new RangeError("provide at most 1000000 values");
  if (!Array.isArray(edges) || edges.length < 2 || edges.length > 10001)
    throw new RangeError("provide 2–10001 edges");
  edges = edges.map((e) => finite(e, "edge"));
  if (edges.some((e, i) => i && e <= edges[i - 1]))
    throw new RangeError("edges must strictly increase");
  const bins = edges
    .slice(0, -1)
    .map((left, i) => ({
      id: `bin:${i}`,
      left,
      right: edges[i + 1],
      count: 0,
    }));
  let underflow = 0,
    overflow = 0;
  for (const value of values) {
    finite(value, "observation");
    if (value < edges[0]) {
      underflow++;
      continue;
    }
    if (value > edges.at(-1)) {
      overflow++;
      continue;
    }
    let lo = 0,
      hi = bins.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (value >= edges[mid]) lo = mid;
      else hi = mid - 1;
    }
    bins[lo].count++;
  }
  return {
    bins,
    underflow,
    overflow,
    total: values.length,
    inRange: values.length - underflow - overflow,
  };
}
/** Two Boolean events, with an explicit conditioning denominator; empty group => null. */
export function conditionalFrequency(observations) {
  if (!Array.isArray(observations) || observations.length > 1000000)
    throw new RangeError("provide at most 1000000 observations");
  const counts = { both: 0, eventOnly: 0, conditionOnly: 0, neither: 0 };
  for (const { event, condition } of observations) {
    if (typeof event !== "boolean" || typeof condition !== "boolean")
      throw new TypeError("event and condition must be Boolean");
    counts[
      event
        ? condition
          ? "both"
          : "eventOnly"
        : condition
          ? "conditionOnly"
          : "neither"
    ]++;
  }
  const denominator = counts.both + counts.conditionOnly;
  return {
    counts,
    total: observations.length,
    numerator: counts.both,
    denominator,
    frequency: denominator ? counts.both / denominator : null,
  };
}
