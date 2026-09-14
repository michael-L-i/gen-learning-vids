/** Deterministic, renderer-independent 2D linear transformation geometry. */
function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function vector(value, name = "vector") {
  if (!Array.isArray(value) || value.length !== 2)
    throw new TypeError(`${name} must have two coordinates`);
  return value.map((v) => finite(v, name));
}
function matrix(value) {
  if (!Array.isArray(value) || value.length !== 2)
    throw new TypeError("matrix must have two rows");
  return value.map((row) => vector(row, "matrix row"));
}
export const IDENTITY_2D = Object.freeze([
  Object.freeze([1, 0]),
  Object.freeze([0, 1]),
]);
export function determinant2D(value) {
  const [[a, b], [c, d]] = matrix(value);
  return finite(a * d - b * c, "determinant");
}
export function transformPoint(value, point) {
  const [[a, b], [c, d]] = matrix(value),
    [x, y] = vector(point);
  return vector([a * x + b * y, c * x + d * y], "transformed point");
}
/** compose2D(after,before) applies before first (column-vector convention). */
export function compose2D(after, before) {
  const a = matrix(after),
    b = matrix(before);
  const x = transformPoint(a, [b[0][0], b[1][0]]),
    y = transformPoint(a, [b[0][1], b[1][1]]);
  return [
    [x[0], y[0]],
    [x[1], y[1]],
  ];
}
/** Entrywise interpolation. Intermediate maps may be singular, even for invertible endpoints. */
export function interpolate2D(from, to, progress) {
  const a = matrix(from),
    b = matrix(to);
  finite(progress, "progress");
  if (progress < 0 || progress > 1)
    throw new RangeError("progress must be in [0, 1]");
  return matrix(
    a.map((row, i) =>
      row.map((v, j) => (1 - progress) * v + progress * b[i][j]),
    ),
  );
}
/** Immutable input geometry, stable IDs, and fresh snapshots suitable for arbitrary seeks. */
export function linearTransformation({
  xRange = [-3, 3],
  yRange = [-3, 3],
  step = 1,
  points = [],
} = {}) {
  const xr = vector(xRange, "xRange"),
    yr = vector(yRange, "yRange");
  if (xr[0] >= xr[1] || yr[0] >= yr[1])
    throw new RangeError("grid ranges must increase");
  if (finite(step, "step") <= 0) throw new RangeError("step must be positive");
  const sourcePoints = points.map(({ id, point }) => ({
    id,
    point: vector(point),
  }));
  if (
    sourcePoints.some((p) => typeof p.id !== "string" || !p.id) ||
    new Set(sourcePoints.map((p) => p.id)).size !== sourcePoints.length
  )
    throw new TypeError("point IDs must be nonempty unique strings");
  const lines = [];
  function addLines(range, axis) {
    const first = Math.ceil(range[0] / step),
      last = Math.floor(range[1] / step);
    if (
      !Number.isSafeInteger(first) ||
      !Number.isSafeInteger(last) ||
      last - first > 2000
    )
      throw new RangeError("grid exceeds 2001 lines per axis");
    for (let n = first; n <= last; n++) {
      const at = finite(n * step, "grid coordinate");
      lines.push({
        id: `${axis}:${n}`,
        axis,
        at,
        points:
          axis === "x"
            ? [
                [at, yr[0]],
                [at, yr[1]],
              ]
            : [
                [xr[0], at],
                [xr[1], at],
              ],
      });
    }
  }
  addLines(xr, "x");
  addLines(yr, "y");
  return Object.freeze({
    sample(value = IDENTITY_2D) {
      const m = matrix(value),
        det = determinant2D(m);
      const apply = (p) => transformPoint(m, p);
      return {
        matrix: m,
        determinant: det,
        areaScale: Math.abs(det),
        orientation:
          det === 0 ? "collapsed" : det > 0 ? "preserved" : "reversed",
        basis: [
          { id: "e1", point: apply([1, 0]) },
          { id: "e2", point: apply([0, 1]) },
        ],
        unitCell: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ].map(apply),
        lines: lines.map((line) => ({
          ...line,
          points: line.points.map(apply),
        })),
        points: sourcePoints.map((p) => ({ id: p.id, point: apply(p.point) })),
      };
    },
  });
}
