import test from "node:test";
import assert from "node:assert/strict";
import {
  IDENTITY_2D,
  transformPoint,
  determinant2D,
  compose2D,
  interpolate2D,
  linearTransformation,
} from "../server/math/index.js";
test("basis columns reconstruct a vector; determinant agrees with signed cell area", () => {
  const map = linearTransformation({ points: [{ id: "v", point: [2, -1] }] });
  for (const m of [
    [
      [2, 1],
      [0, 1],
    ],
    [
      [-1, 0],
      [0, 2],
    ],
    [
      [1, 2],
      [2, 4],
    ],
  ]) {
    const s = map.sample(m),
      [u, v] = s.basis.map((p) => p.point);
    assert.deepEqual(
      s.points[0].point,
      u.map((x, i) => 2 * x - v[i]),
    );
    const p = s.unitCell;
    const area =
      p.reduce((sum, a, i) => {
        const b = p[(i + 1) % 4];
        return sum + a[0] * b[1] - a[1] * b[0];
      }, 0) / 2;
    assert.equal(area, s.determinant);
    assert.equal(Math.abs(area), s.areaScale);
  }
});
test("composition order and linearity", () => {
  const a = [
      [2, 1],
      [0, 1],
    ],
    b = [
      [0, -1],
      [1, 0],
    ],
    p = [3, 4];
  assert.deepEqual(
    transformPoint(compose2D(a, b), p),
    transformPoint(a, transformPoint(b, p)),
  );
  assert.deepEqual(
    transformPoint(a, [5, 7]),
    transformPoint(a, [2, 3]).map((v, i) => v + transformPoint(a, [3, 4])[i]),
  );
});
test("arbitrary seeks retain IDs, independent snapshots, and honest collapse", () => {
  const map = linearTransformation();
  const m = interpolate2D(
    IDENTITY_2D,
    [
      [-1, 0],
      [0, -1],
    ],
    0.5,
  );
  assert.equal(map.sample(m).orientation, "collapsed");
  const expected = map.sample();
  map.sample(m);
  const changed = map.sample();
  changed.lines[0].points[0][0] = 999;
  assert.deepEqual(map.sample(), expected);
  assert.deepEqual(
    map.sample(m).lines.map((l) => l.id),
    expected.lines.map((l) => l.id),
  );
});
test("reject malformed, nonfinite, unbounded and overflowing geometry", () => {
  for (const f of [
    () =>
      transformPoint(
        [
          [1, 0],
          [0, Infinity],
        ],
        [1, 2],
      ),
    () =>
      determinant2D([
        [1e308, 0],
        [0, 1e308],
      ]),
    () => interpolate2D(IDENTITY_2D, IDENTITY_2D, 2),
    () => linearTransformation({ step: 0 }),
    () => linearTransformation({ step: 1e-20 }),
    () =>
      linearTransformation({
        points: [
          { id: "a", point: [0, 1] },
          { id: "a", point: [1, 1] },
        ],
      }),
  ])
    assert.throws(f);
});
