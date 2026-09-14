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
