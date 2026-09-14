/** Deterministic 2D wave, field and geometric-optics primitives. No DOM or clock. */
const TAU = 2 * Math.PI;
function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function positive(value, name) {
  finite(value, name);
  if (value <= 0) throw new RangeError(`${name} must be positive`);
  return value;
}
function vector(value, name) {
  if (!Array.isArray(value) || value.length !== 2)
    throw new TypeError(`${name} must be [x, y]`);
  return value.map((v) => finite(v, name));
}
function unit(value, name) {
  const v = vector(value, name),
    length = Math.hypot(...v);
  positive(length, `${name} length`);
  return v.map((n) => n / length);
}
function count(value, name, min = 2) {
  if (!Number.isInteger(value) || value < min || value > 10000)
    throw new RangeError(`${name} must be an integer from ${min} to 10000`);
  return value;
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

/** A cos(2π(direction·position/wavelength - frequency*time) + phase).
 * Positions/wavelength use matching units, time seconds, frequency Hz, phase radians.
 * This is a prescribed scalar wave, not a PDE solver; negative amplitudes allowed.
 */
export function planeWave({
  amplitude = 1,
  wavelength,
  frequency,
  direction = [1, 0],
  phase = 0,
}) {
  finite(amplitude, "amplitude");
  positive(wavelength, "wavelength");
  finite(frequency, "frequency");
  if (frequency < 0) throw new RangeError("frequency must be nonnegative");
  finite(phase, "phase");
  const d = unit(direction, "direction");
  return (position, time = 0) =>
    finite(
      amplitude *
        Math.cos(
          TAU *
            (dot(d, vector(position, "position")) / wavelength -
              frequency * finite(time, "time")) +
            phase,
        ),
      "wave result",
    );
}

/** Linear superposition of scalar samplers. Empty sum is zero. */
export function superpose(waves) {
  if (!Array.isArray(waves) || waves.some((w) => typeof w !== "function"))
    throw new TypeError("waves must be an array of scalar sampler functions");
  const samplers = [...waves];
  return (position, time = 0) => {
    vector(position, "position");
    finite(time, "time");
    return finite(
      samplers.reduce(
        (sum, w) => sum + finite(w(position, time), "wave value"),
        0,
      ),
      "sum",
    );
  };
}

/** Inclusive, equally spaced samples along a straight line in model coordinates. */
export function sampleWave(wave, { from, to, samples = 201, time = 0 }) {
  if (typeof wave !== "function")
    throw new TypeError("wave must be a function");
  const a = vector(from, "from"),
    b = vector(to, "to");
  count(samples, "samples");
  finite(time, "time");
  return Array.from({ length: samples }, (_, i) => {
    const fraction = i / (samples - 1),
      position = a.map((v, j) => v * (1 - fraction) + b[j] * fraction);
    return { position, value: finite(wave(position, time), "wave value") };
  });
}

/** Sample vector fields on an inclusive rectangular grid; null explicitly masks a singularity. */
export function sampleField(
  field,
  { x = [-1, 1], y = [-1, 1], columns = 11, rows = 11, time = 0 } = {},
) {
  if (typeof field !== "function")
    throw new TypeError("field must be a function");
  vector(x, "x bounds");
  vector(y, "y bounds");
  if (x[1] <= x[0] || y[1] <= y[0])
    throw new RangeError("bounds must increase");
  count(columns, "columns");
  count(rows, "rows");
  finite(time, "time");
  if (columns * rows > 100000)
    throw new RangeError("field grid must have at most 100000 samples");
  return Array.from({ length: columns * rows }, (_, i) => {
    const u = (i % columns) / (columns - 1),
      v = Math.floor(i / columns) / (rows - 1);
    const position = [x[0] * (1 - u) + x[1] * u, y[0] * (1 - v) + y[1] * v];
    const result = field(position, time);
    return {
      position,
      vector: result === null ? null : vector(result, "field value"),
    };
  });
}

/** In-plane section of the 3D inverse-square point-charge field k*q*r/|r|³.
 * `constant` supplies the unit convention. Returns null inside each exclusion radius.
 * Exclusion masks a singularity; it does not soften or modify the physical field.
 */
export function pointChargeField(
  charges,
  { constant = 1, exclusionRadius = 0 } = {},
) {
  if (!Array.isArray(charges)) throw new TypeError("charges must be an array");
  positive(constant, "constant");
  finite(exclusionRadius, "exclusionRadius");
  if (exclusionRadius < 0)
    throw new RangeError("exclusionRadius must be nonnegative");
  const sources = charges
    .map(({ position, charge }) => ({
      position: vector(position, "charge position"),
      charge: finite(charge, "charge"),
    }))
    .filter((c) => c.charge !== 0);
  return (position) => {
    const p = vector(position, "position"),
      result = [0, 0];
    for (const source of sources) {
      const delta = p.map((v, i) => v - source.position[i]),
        radius = finite(Math.hypot(...delta), "charge distance");
      if (radius <= exclusionRadius) return null;
      const magnitude = (constant * source.charge) / radius / radius;
      for (let i = 0; i < 2; i++) result[i] += magnitude * (delta[i] / radius);
    }
    return vector(result, "field result");
  };
}

/** SVG path data only, leaving stroke, labels and DOM ownership to the author. */
export function polylinePath(points) {
  if (!Array.isArray(points)) throw new TypeError("points must be an array");
  return points
    .map((p, i) => `${i ? "L" : "M"}${vector(p, "point").join(" ")}`)
    .join(" ");
}

/** Map model vectors to SVG arrows. Scale has model length per field unit;
 * maxLength caps model length and is reported as `clipped`. Map both endpoints,
 * so inverted SVG y axes and anisotropic maps retain correct directions.
 */
export function fieldArrows(
  samples,
  { project = (p) => p, scale = 1, maxLength = 1, headSize = 6 } = {},
) {
  if (!Array.isArray(samples)) throw new TypeError("samples must be an array");
  if (typeof project !== "function")
    throw new TypeError("project must be a function");
  positive(scale, "scale");
  positive(maxLength, "maxLength");
  positive(headSize, "headSize");
  return samples.flatMap((sample) => {
    const p = vector(sample.position, "position");
    if (sample.vector === null) return [];
    const v = vector(sample.vector, "vector"),
      magnitude = finite(Math.hypot(...v), "field magnitude");
    if (magnitude === 0) return [];
    const length = Math.min(maxLength, magnitude * scale);
    const start = vector(project(p), "projected start");
    const end = vector(
      project(p.map((n, i) => n + (v[i] / magnitude) * length)),
      "projected end",
    );
    const delta = end.map((n, i) => n - start[i]),
      pixelLength = Math.hypot(...delta);
    if (pixelLength === 0) return [];
    const d = unit(delta, "arrow"),
      h = Math.min(headSize, pixelLength / 2);
    const base = end.map((n, i) => n - h * d[i]);
    return [
      {
        start,
        end,
        magnitude,
        clipped: magnitude * scale > maxLength,
        path: `${polylinePath([start, end])} ${polylinePath([[base[0] - (h * d[1]) / 2, base[1] + (h * d[0]) / 2], end, [base[0] + (h * d[1]) / 2, base[1] - (h * d[0]) / 2]])}`,
      },
    ];
  });
}

/** Geometric optics at one flat, lossless isotropic interface.
 * Incident points TOWARD the interface; normal points INTO the incident medium.
 * Returns unit directions and angles (radians from the normal). No Fresnel power,
 * phase, absorption, diffraction, evanescent field or multi-surface tracing.
 */
export function rayInterface({ incident, normal, nFrom, nTo }) {
  const d = unit(incident, "incident"),
    n = unit(normal, "normal");
  positive(nFrom, "nFrom");
  positive(nTo, "nTo");
  const projection = dot(d, n);
  if (projection > 1e-12)
    throw new RangeError(
      "normal must point into the incident medium, opposing incident",
    );
  const cosine = Math.max(0, Math.min(1, -projection));
  const reflected = unit(
    d.map((v, i) => v + 2 * cosine * n[i]),
    "reflected",
  );
  // Project onto an explicitly perpendicular basis. Subtracting the normal
  // component leaves a parallel rounding residue at exact normal incidence.
  const tangent = [-n[1], n[0]],
    signedSine = dot(d, tangent);
  const sine = Math.min(1, Math.abs(signedSine)),
    ratio = nFrom / nTo;
  const transmittedSine =
    sine === 0
      ? 0
      : Number.isFinite(ratio)
        ? ratio * sine
        : (nFrom * sine) / nTo;
  const criticalAngle = nFrom > nTo ? Math.asin(nTo / nFrom) : null;
  const common = {
    reflected,
    incidentAngle: Math.atan2(sine, cosine),
    criticalAngle,
  };
  // A 1e-12 tolerance treats floating-point critical-angle roundoff as grazing.
  if (transmittedSine > 1 + 1e-12)
    return {
      ...common,
      refracted: null,
      refractedAngle: null,
      totalInternalReflection: true,
    };
  const s = Math.min(1, transmittedSine),
    c = Math.sqrt(Math.max(0, 1 - s * s));
  // Normal incidence also avoids 0 * an overflowing index ratio.
  const refracted =
    sine === 0
      ? n.map((v) => -v)
      : unit(
          tangent.map((v, i) => Math.sign(signedSine) * v * s - c * n[i]),
          "refracted",
        );
  return {
    ...common,
    refracted,
    refractedAngle: Math.asin(s),
    totalInternalReflection: false,
  };
}
