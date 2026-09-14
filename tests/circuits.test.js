import test from "node:test";
import assert from "node:assert/strict";
import {
  rcStep,
  solveDC,
  circuitSymbol,
  circuitWire,
  signalTrace,
} from "../server/circuits/index.js";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
test("RC initial, one time constant, KVL, capacitor law and discharge polarity", () => {
  const rc = rcStep({ resistance: 1000, capacitance: 0.001, sourceVoltage: 5 });
  assert.equal(rc.tau, 1);
  assert.equal(rc.at(0).voltage, 0);
  assert.equal(rc.at(0).current, 0.005);
  near(rc.at(1).voltage, 5 * (1 - Math.exp(-1)));
  for (const t of [0, 0.1, 1, 5, 50]) {
    const s = rc.at(t);
    near(s.voltage + s.resistorVoltage, 5);
    near(s.charge, 0.001 * s.voltage);
    if (t > 0)
      near(
        ((rc.at(t + 1e-5).voltage - rc.at(Math.max(0, t - 1e-5)).voltage) /
          (t === 0 ? 1e-5 : 2e-5)) *
          0.001,
        s.current,
      );
  }
  const discharge = rcStep({
    resistance: 1000,
    capacitance: 0.001,
    sourceVoltage: 0,
    initialVoltage: 5,
  });
  assert.equal(discharge.at(0).current, -0.005);
  near(discharge.at(1).voltage, 5 / Math.E);
  assert.deepEqual(rc.at(1), rc.at(1));
  assert.throws(() => rc.at(-1));
  assert.throws(() =>
    rcStep({ resistance: 0, capacitance: 1, sourceVoltage: 1 }),
  );
});
test("branched divider satisfies nodal KCL and power balance", () => {
  const result = solveDC({
    nodes: ["s", "j", "g"],
    fixed: { s: 12, g: 0 },
    resistors: [
      { id: "r1", a: "s", b: "j", resistance: 1000 },
      { id: "r2", a: "j", b: "g", resistance: 2000 },
      { id: "r3", a: "j", b: "g", resistance: 2000 },
    ],
  });
  near(result.potentials.j, 6);
  near(result.netOutflow.j, 0);
  near(
    result.branches.reduce((s, r) => s + r.power, 0),
    12 * result.netOutflow.s,
  );
  const reversed = solveDC({
    nodes: ["a", "b"],
    fixed: { a: 0, b: 5 },
    resistors: [{ id: "r", a: "a", b: "b", resistance: 1000 }],
  });
  assert.equal(reversed.branches[0].current, -0.005);
});
test("DC rejects invalid topology, floating nodes, nonfinite and duplicate identities", () => {
  const base = {
    nodes: ["a", "b"],
    fixed: { a: 0 },
    resistors: [{ id: "r", a: "a", b: "b", resistance: 10 }],
  };
  for (const change of [
    { fixed: {} },
    { nodes: ["a", "a"] },
    { fixed: { missing: 1 } },
    { resistors: [] },
    { resistors: [{ ...base.resistors[0], resistance: NaN }] },
    { resistors: [base.resistors[0], base.resistors[0]] },
  ])
    assert.throws(() => solveDC({ ...base, ...change }));
});
test("symbols preserve transformed terminal identities, escape labels, and reject cross-node wires", () => {
  const s = circuitSymbol({
    kind: "capacitor",
    id: "C",
    a: { x: 20, y: 30 },
    b: { x: 20, y: 150 },
    nodeA: "out",
    nodeB: "0",
    label: "<C>",
  });
  assert.deepEqual(s.terminals.a, { x: 20, y: 30, node: "out" });
  assert.match(s.svg, /rotate\(90\)/);
  assert.match(s.svg, /&lt;C&gt;/);
  assert.throws(() => circuitWire({ from: s.terminals.a, to: s.terminals.b }));
  assert.match(
    circuitWire({
      from: s.terminals.a,
      to: { x: 100, y: 20, node: "out" },
      via: [{ x: 100, y: 30 }],
    }),
    /100,30/,
  );
  assert.throws(() =>
    circuitSymbol({
      kind: "diode",
      id: "d",
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      nodeA: "a",
      nodeB: "b",
    }),
  );
});
test("signal trace has exact endpoints and deterministic independent samples", () => {
  const input = {
    signal: (t) => t,
    start: 0,
    end: 2,
    min: 0,
    max: 2,
    width: 100,
    height: 50,
    samples: 3,
  };
  assert.equal(signalTrace(input), "0,50 50,25 100,0");
  assert.equal(signalTrace(input), signalTrace(input));
  assert.throws(() => signalTrace({ ...input, signal: () => NaN }));
});
test("voltage source polarity stays upright for vertical terminals", () => {
  const s = circuitSymbol({
    kind: "voltageSource",
    id: "V",
    a: { x: 20, y: 0 },
    b: { x: 20, y: 100 },
    nodeA: "plus",
    nodeB: "minus",
  });
  assert.match(s.svg, /<text x="20" y="39"[^>]*>\+<\/text>/);
  assert.match(s.svg, /<text x="20" y="61"[^>]*>−<\/text>/);
});
test("coupled unknown nodes solve independently of uniform resistance scale", () => {
  for (const scale of [1e-12, 1, 1e12]) {
    const result = solveDC({
      nodes: ["s", "a", "b", "g"],
      fixed: { s: 9, g: 0 },
      resistors: [
        { id: "r1", a: "s", b: "a", resistance: scale },
        { id: "r2", a: "a", b: "b", resistance: scale },
        { id: "r3", a: "b", b: "g", resistance: scale },
      ],
    });
    near(result.potentials.a, 6);
    near(result.potentials.b, 3);
  }
});
test("RC preserves initial and near-zero voltage without subtractive cancellation", () => {
  const model = rcStep({
    resistance: 1,
    capacitance: 1,
    initialVoltage: 1,
    sourceVoltage: 1e16,
  });
  assert.equal(model.at(0).voltage, 1);
  assert.equal(model.at(1e-16).voltage, 2);
  const small = rcStep({ resistance: 1, capacitance: 1, sourceVoltage: 5 });
  assert.ok(Math.abs(small.at(1e-20).voltage / 5e-20 - 1) < 1e-15);
  assert.throws(
    () =>
      rcStep({
        resistance: 1,
        capacitance: 1,
        initialVoltage: -1e308,
        sourceVoltage: 1e308,
      }),
    /voltage step/,
  );
});
test("signal traces reject unrepresentable spans and coordinates but avoid intermediate overflow", () => {
  const base = {
    signal: () => 0,
    start: 0,
    end: 1,
    min: 0,
    max: 1,
    width: 100,
    height: 50,
    samples: 3,
  };
  assert.throws(
    () => signalTrace({ ...base, min: -1e308, max: 1e308 }),
    /value span/,
  );
  assert.throws(
    () => signalTrace({ ...base, start: -1e308, end: 1e308 }),
    /time span/,
  );
  assert.throws(
    () => signalTrace({ ...base, signal: () => 1e308, height: 1e308 }),
    /trace y/,
  );
  assert.equal(
    signalTrace({ ...base, width: 1e308 }),
    "0,50 5e+307,50 1e+308,50",
  );
});
test("DC rejects nonrepresentable aggregate currents and conductance", () => {
  const resistors = [
    { id: "r1", a: "a", b: "b", resistance: 1e-308 },
    { id: "r2", a: "a", b: "b", resistance: 1e-308 },
  ];
  assert.throws(
    () => solveDC({ nodes: ["a", "b"], fixed: { a: 1, b: 0 }, resistors }),
    /aggregate node current/,
  );
  assert.throws(
    () => solveDC({ nodes: ["a", "b"], fixed: { a: 1 }, resistors }),
    /aggregate conductance/,
  );
});
test("geometry rejects nonrepresentable spans and keeps large finite source coordinates valid", () => {
  const base = {
    kind: "voltageSource",
    id: "v",
    a: { x: -1e308, y: 0 },
    b: { x: 1e308, y: 0 },
    nodeA: "a",
    nodeB: "b",
  };
  assert.throws(() => circuitSymbol(base), /terminal x span/);
  assert.throws(
    () =>
      circuitWire({
        from: { ...base.a, node: "n" },
        to: { ...base.b, node: "n" },
      }),
    /wire x span/,
  );
  const valid = circuitSymbol({
    ...base,
    a: { x: 1e308, y: 0 },
    b: { x: 1e308, y: 100 },
    label: "V",
  });
  assert.doesNotMatch(valid.svg, /Infinity|NaN/);
});
