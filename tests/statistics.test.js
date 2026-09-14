import test from "node:test";
import assert from "node:assert/strict";
import {
  seededUniform,
  discreteDistribution,
  histogram,
  conditionalFrequency,
} from "../server/statistics/index.js";
const die = () =>
  discreteDistribution(
    Array.from({ length: 6 }, (_, i) => ({
      id: String(i + 1),
      value: i + 1,
      weight: 1,
    })),
  );
test("sampling is deterministic, counter-addressable, and stays on the support", () => {
  const d = die(),
    samples = d.sample({ seed: 123, count: 1000 });
  assert.deepEqual(
    samples.slice(120, 160),
    d.sample({ seed: 123, count: 40, start: 120 }),
  );
  assert.deepEqual(d.sampleAt(123, 25), samples[25]);
  assert.deepEqual(d.sample({ seed: 123, count: 1000 }), samples);
  assert(samples.every((s) => s.value >= 1 && s.value <= 6));
  assert.notDeepEqual(d.sample({ seed: 456, count: 20 }), samples.slice(0, 20));
  for (let i = 0; i < 10000; i++) {
    const u = seededUniform(0xffffffff, i);
    assert(u >= 0 && u < 1);
  }
});
test("normalized weights and moments agree with analytic distributions", () => {
  const d = die();
  assert(Math.abs(d.mean - 3.5) < 1e-12);
  assert(Math.abs(d.variance - 35 / 12) < 1e-12);
  const b = discreteDistribution([
    { id: "zero", value: 0, weight: 3 },
    { id: "one", value: 1, weight: 1 },
  ]);
  assert.equal(b.mean, 0.25);
  assert.equal(b.variance, 0.1875);
  assert.deepEqual(
    discreteDistribution([
      { id: "impossible", value: 999, weight: 0 },
      { id: "certain", value: 2, weight: 1 },
    ])
      .sample({ seed: 5, count: 30 })
      .map((s) => s.value),
    Array(30).fill(2),
  );
});
test("histogram assigns boundaries once and conserves observations including overflow", () => {
  const h = histogram([-1, 0, 1, 2, 3, 4], [0, 1, 3]);
  assert.deepEqual(
    h.bins.map((b) => b.count),
    [1, 3],
  );
  assert.equal(h.underflow, 1);
  assert.equal(h.overflow, 1);
  assert.equal(
    h.total,
    h.bins.reduce((n, b) => n + b.count, 0) + h.underflow + h.overflow,
  );
  assert.equal(histogram([], [-1, 1]).total, 0);
});
test("conditioning uses selected group, including zero and empty denominators", () => {
  const c = conditionalFrequency([
    { event: true, condition: true },
    { event: false, condition: true },
    { event: true, condition: false },
  ]);
  assert.equal(c.frequency, 0.5);
  assert.equal(c.numerator, 1);
  assert.equal(c.denominator, 2);
  assert.equal(c.total, 3);
  assert.equal(conditionalFrequency([]).frequency, null);
  assert.equal(
    conditionalFrequency([{ event: false, condition: true }]).frequency,
    0,
  );
});
test("reject invalid probability models, geometry and sample bounds", () => {
  for (const fn of [
    () => die().sample({ seed: -1, count: 2 }),
    () => die().sample({ seed: 1, count: 2, start: 0xffffffff }),
    () => histogram([NaN], [0, 1]),
    () => histogram([1], [1, 1]),
    () => discreteDistribution([{ id: "x", value: 1, weight: 0 }]),
    () => discreteDistribution([{ id: "x", value: 1, weight: -1 }]),
    () =>
      discreteDistribution([
        { id: "x", value: 1, weight: 1 },
        { id: "x", value: 2, weight: 1 },
      ]),
    () => conditionalFrequency([{ event: 1, condition: true }]),
  ])
    assert.throws(fn);
});
