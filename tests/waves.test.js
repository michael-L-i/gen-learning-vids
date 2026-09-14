import test from "node:test";
import assert from "node:assert/strict";
import {
  planeWave,
  superpose,
  sampleWave,
  sampleField,
  pointChargeField,
  fieldArrows,
  polylinePath,
  rayInterface,
} from "../server/waves/index.js";
const close = (a, b, t = 1e-10) =>
  assert.ok(Math.abs(a - b) < t, `${a} ≠ ${b}`);
const vec = (a, b) => a.forEach((v, i) => close(v, b[i]));
test("wave moves one wavelength per period; sampling is inclusive and order independent", () => {
  const w = planeWave({
    wavelength: 4,
    frequency: 2,
    direction: [3, 0],
    amplitude: 2,
  });
  close(w([0, 0], 0), 2);
  close(w([1, 0], 0.125), 2);
  close(w([4, 0], 0.5), 2);
  const args = { from: [0, 0], to: [4, 0], samples: 5, time: 0.1 };
  const a = sampleWave(w, args);
  sampleWave(w, { ...args, time: 20 });
  assert.deepEqual(sampleWave(w, args), a);
  vec(a[4].position, [4, 0]);
  close(a[0].value, a[4].value);
  const opposite = planeWave({
    wavelength: 4,
    frequency: 2,
    phase: Math.PI,
    amplitude: 2,
  });
  for (let t = 0; t < 2; t += 0.071)
    close(superpose([w, opposite])([0.7, 3], t), 0);
  close(superpose([])([0, 0]), 0);
});
test("counterpropagating waves have fixed standing-wave nodes", () => {
  const sum = superpose([
    planeWave({ wavelength: 4, frequency: 1 }),
    planeWave({ wavelength: 4, frequency: 1, direction: [-1, 0] }),
  ]);
  for (let t = 0; t < 2; t += 0.037) {
    close(sum([1, 0], t), 0);
    close(sum([0, 0], t), 2 * Math.cos(2 * Math.PI * t));
  }
});
test("point field follows inverse square and vector superposition; singularities stay explicit", () => {
  const f = pointChargeField([{ position: [0, 0], charge: 2 }]);
  vec(f([1, 0]), [2, 0]);
  vec(f([2, 0]), [0.5, 0]);
  assert.equal(f([0, 0]), null);
  const pair = pointChargeField([
    { position: [-1, 0], charge: 1 },
    { position: [1, 0], charge: 1 },
  ]);
  vec(pair([0, 0]), [0, 0]);
  const dipole = pointChargeField([
    { position: [-1, 0], charge: 1 },
    { position: [1, 0], charge: -1 },
  ]);
  vec(dipole([0, 0]), [2, 0]);
  assert.equal(
    pointChargeField([{ position: [0, 0], charge: 1 }], {
      exclusionRadius: 0.5,
    })([0.5, 0]),
    null,
  );
  vec(pointChargeField([{ position: [0, 0], charge: 0 }])([0, 0]), [0, 0]);
  const grid = sampleField(f, { columns: 3, rows: 3 });
  assert.equal(grid.length, 9);
  assert.equal(grid[4].vector, null);
});
test("field arrows project both ends, clip honestly, and omit null or zero vectors", () => {
  const arrows = fieldArrows(
    [
      { position: [1, 1], vector: [0, 4] },
      { position: [0, 0], vector: null },
      { position: [0, 0], vector: [0, 0] },
    ],
    { project: ([x, y]) => [x * 10, 100 - y * 10], scale: 2, maxLength: 3 },
  );
  assert.equal(arrows.length, 1);
  vec(arrows[0].start, [10, 90]);
  vec(arrows[0].end, [10, 60]);
  assert.equal(arrows[0].clipped, true);
  close(arrows[0].magnitude, 4);
  assert.equal(
    polylinePath([
      [0, 0],
      [1, 2],
    ]),
    "M0 0 L1 2",
  );
  assert.equal(polylinePath([]), "");
});
test("Snell law, unit lengths and reflection angles across orientations", () => {
  for (const nFrom of [1, 1.33, 1.5, 2])
    for (const nTo of [1, 1.4, 2])
      for (let theta = 0; theta < Math.PI / 2; theta += 0.071)
        for (const rotation of [0, 0.31, 2.2]) {
          const rot = ([x, y]) => [
            x * Math.cos(rotation) - y * Math.sin(rotation),
            x * Math.sin(rotation) + y * Math.cos(rotation),
          ];
          const result = rayInterface({
            incident: rot([Math.sin(theta), -Math.cos(theta)]),
            normal: rot([0, 1]),
            nFrom,
            nTo,
          });
          close(result.incidentAngle, theta);
          close(Math.hypot(...result.reflected), 1);
          vec(result.reflected, rot([Math.sin(theta), Math.cos(theta)]));
          if (result.totalInternalReflection) {
            assert.ok(nFrom * Math.sin(theta) > nTo);
            assert.equal(result.refracted, null);
          } else {
            close(Math.hypot(...result.refracted), 1);
            close(
              nFrom * Math.sin(theta),
              nTo * Math.sin(result.refractedAngle),
            );
            const reverse = rayInterface({
              incident: result.refracted.map((v) => -v),
              normal: rot([0, -1]),
              nFrom: nTo,
              nTo: nFrom,
            });
            vec(reverse.refracted, rot([-Math.sin(theta), Math.cos(theta)]));
          }
        }
});
test("critical, normal and grazing incidence have explicit behavior", () => {
  const angle = Math.asin(1 / 1.5),
    args = { normal: [0, 1], nFrom: 1.5, nTo: 1 };
  const critical = rayInterface({
    ...args,
    incident: [Math.sin(angle), -Math.cos(angle)],
  });
  assert.equal(critical.totalInternalReflection, false);
  close(critical.refractedAngle, Math.PI / 2);
  assert.equal(
    rayInterface({
      ...args,
      incident: [Math.sin(angle + 0.001), -Math.cos(angle + 0.001)],
    }).totalInternalReflection,
    true,
  );
  vec(rayInterface({ ...args, incident: [0, -9] }).refracted, [0, -1]);
  vec(
    rayInterface({ incident: [1, 0], normal: [0, 1], nFrom: 1, nTo: 1 })
      .refracted,
    [1, 0],
  );
  vec(
    rayInterface({
      incident: [0, -1],
      normal: [0, 1],
      nFrom: 1e300,
      nTo: 1e-300,
    }).refracted,
    [0, -1],
  );
});
test("invalid geometry, units and sampler values fail actionably", () => {
  for (const args of [
    { wavelength: 0, frequency: 1 },
    { wavelength: 1, frequency: -1 },
    { wavelength: 1, frequency: 1, direction: [0, 0] },
    { wavelength: 1, frequency: NaN },
  ])
    assert.throws(() => planeWave(args));
  assert.throws(
    () => rayInterface({ incident: [0, 1], normal: [0, 1], nFrom: 1, nTo: 2 }),
    /normal/,
  );
  assert.throws(
    () => rayInterface({ incident: [0, -1], normal: [0, 1], nFrom: 0, nTo: 2 }),
    /nFrom/,
  );
  assert.throws(
    () => sampleField(() => [1, 0], { columns: 1000, rows: 1000 }),
    /100000/,
  );
  assert.throws(() => sampleField(() => [Infinity, 0]), /finite/);
  assert.throws(
    () => sampleWave(() => NaN, { from: [0, 0], to: [1, 0] }),
    /finite/,
  );
  assert.throws(
    () => sampleWave(() => 1, { from: [0, 0], to: [1, 0], samples: 1 }),
    /samples/,
  );
  assert.throws(() => fieldArrows([], { scale: -1 }), /scale/);
  assert.throws(() => polylinePath([[0, NaN]]), /finite/);
  assert.throws(
    () => pointChargeField([], { exclusionRadius: -1 }),
    /exclusionRadius/,
  );
});

// The ratio can overflow even though the resulting direction is representable.
test("near-normal high-contrast rays avoid an overflowing intermediate ratio", () => {
  const r = rayInterface({
    incident: [1e-320, -1],
    normal: [0, 1],
    nFrom: 1e10,
    nTo: 1e-300,
  });
  assert.equal(r.totalInternalReflection, false);
  close(r.refracted[0], (1e10 * 1e-320) / 1e-300, 1e-20);
  close(Math.hypot(...r.refracted), 1);
});

test("rotated exact normal incidence has no spurious tangent at high contrast", () => {
  for (const angle of [0.1, 0.7, 2.4]) {
    const normal = [Math.cos(angle), Math.sin(angle)];
    for (const nFrom of [1e15, 1e20]) {
      const r = rayInterface({
        normal,
        incident: normal.map((v) => -v),
        nFrom,
        nTo: 1,
      });
      assert.equal(r.totalInternalReflection, false);
      close(r.refractedAngle, 0);
      close(r.incidentAngle, 0);
      vec(
        r.refracted,
        normal.map((v) => -v),
      );
    }
  }
});
test("overflowing point-field distance fails instead of silently returning zero", () => {
  assert.throws(
    () =>
      pointChargeField([{ position: [0, 0], charge: 1e308 }])([
        1.7e308, 1.7e308,
      ]),
    /charge distance must be finite/,
  );
});
