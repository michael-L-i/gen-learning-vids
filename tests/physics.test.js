import test from "node:test";
import assert from "node:assert/strict";
import {
  harmonicOscillator,
  constantAcceleration,
  cartesianFrame,
  body,
  spring,
  pulley,
  ramp,
  rope,
  vectorArrow,
  angleMarker,
  sampleState,
  linkedGraph,
  placeLabels,
} from "../server/physics/index.js";
const near = (a, b, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
test("oscillator solves arbitrary initial conditions and conserves total energy", () => {
  const m = harmonicOscillator({
    mass: 2,
    stiffness: 8,
    position: 0.3,
    velocity: -0.2,
  });
  near(m.at(0).x, 0.3);
  near(m.at(0).v, -0.2);
  const energy = m.at(0).kinetic + m.at(0).potential;
  for (const t of [0, 0.1, 0.8, 1.7, 6.4]) {
    const s = m.at(t),
      dt = 1e-5;
    near(s.kinetic + s.potential, energy);
    near(s.force, 2 * s.a);
    near((m.at(t + dt).x - m.at(t - dt).x) / (2 * dt), s.v, 1e-7);
    near((m.at(t + dt).v - m.at(t - dt).v) / (2 * dt), s.a, 1e-7);
  }
  near(m.at(m.period).x, 0.3);
  near(m.at(m.period).v, -0.2);
  assert.deepEqual(m.at(1), m.at(1));
  assert.throws(() => m.at(NaN), /finite/);
  assert.throws(
    () => harmonicOscillator({ mass: 0, stiffness: 1 }),
    /positive/,
  );
});
test("constant acceleration snapshots and screen coordinates preserve the same state", () => {
  const input = [0, 18],
    m = constantAcceleration({
      position: input,
      velocity: [16, 12],
      acceleration: [0, -10],
    });
  input[0] = 100;
  const s = m.at(1.5);
  assert.deepEqual(s.position, [24, 24.75]);
  assert.deepEqual(s.velocity, [16, -3]);
  const frame = cartesianFrame({ origin: [100, 600], scale: 20 });
  assert.deepEqual(frame.point(s.position), [580, 105]);
  assert.deepEqual(frame.vector(s.velocity), [320, 60]);
  s.acceleration[1] = 1;
  assert.equal(m.at(1.5).acceleration[1], -10);
  assert.throws(() => constantAcceleration({ position: [0] }), /x and y/);
  assert.throws(() => cartesianFrame({ scale: -1 }), /positive/);
});
test("rotated bodies retain attachment points and arbitrary spring orientation", () => {
  const b = body({ center: [100, 100], size: [80, 40], angle: Math.PI / 2 });
  near(b.anchors.right[0], 100);
  near(b.anchors.right[1], 140);
  near(b.anchors.top[0], 120);
  near(b.bounds.width, 40);
  near(b.bounds.height, 80);
  const s = spring({ from: [40, 20], to: b.anchors.left });
  assert.deepEqual(s.anchors.to, b.anchors.left);
  assert.match(s.svg, /M40 20/);
  assert.throws(() => spring({ from: [0, 0], to: [0, 0] }), /positive/);
  assert.throws(
    () => body({ center: [0, 0], shape: "disk", size: [20, 40] }),
    /equal/,
  );
  assert.match(
    body({ center: [0, 0], fill: '" onload="alert(1)' }).svg,
    /&quot;/,
  );
});
test("pulley, ramp, rope and angle markers compose without scene ownership", () => {
  const p = pulley({ center: [100, 100], radius: 20 });
  assert.deepEqual(p.anchors.left, [80, 100]);
  const r = ramp({ from: [0, 10], to: [100, 50] });
  assert.deepEqual(r.anchors.to, [100, 50]);
  assert.match(
    rope({ points: [p.anchors.left, [80, 200]] }),
    /M80 100 L80 200/,
  );
  assert.match(
    angleMarker({ center: [0, 0], start: 0, end: Math.PI / 2 }),
    /path/,
  );
  assert.throws(
    () => angleMarker({ center: [0, 0], start: 0, end: 10 }),
    /one turn/,
  );
});
test("force arrows follow direction and disappear at zero magnitude", () => {
  const a = vectorArrow({ from: [100, 20], vector: [-2, 0], scale: 30 });
  assert.deepEqual(a.to, [40, 20]);
  assert.match(a.svg, /M100 20 L40 20/);
  assert.equal(vectorArrow({ from: [0, 0], vector: [0, 0] }).svg, "");
  assert.throws(
    () => vectorArrow({ from: [0, 0], vector: [NaN, 0] }),
    /finite/,
  );
});
test("linked graphs and cursors use the supplied state without another motion model", () => {
  const model = harmonicOscillator({ mass: 1, stiffness: 4, position: 1 });
  const states = sampleState(model, { end: Math.PI, samples: 101 }),
    cursor = model.at(Math.PI / 2);
  const g = linkedGraph({
    states,
    y: "x",
    box: { x: 10, y: 20, width: 400, height: 100 },
    xDomain: [0, Math.PI],
    yDomain: [-1, 1],
    cursor,
    xLabel: "t (s)",
    yLabel: "x < 1",
  });
  assert.deepEqual(g.marker, [210, 120]);
  assert.deepEqual(g.point([0, 1]), [10, 20]);
  assert.match(g.svg, /x &lt; 1/);
  near(states.at(-1).t, Math.PI);
  assert.throws(
    () =>
      linkedGraph({
        states,
        y: "x",
        box: { x: 0, y: 0, width: 100, height: 100 },
        xDomain: [0, 1],
        yDomain: [-1, 1],
      }),
    /outside/,
  );
  assert.throws(() => sampleState(model, { end: 0 }), /exceed/);
});
test("label placement avoids measured obstacles and explicitly reports no available slot", () => {
  const result = placeLabels(
    [
      { id: "force", anchor: [100, 100], width: 50, height: 20 },
      { id: "body", anchor: [100, 100], width: 50, height: 20 },
      { id: "large", anchor: [100, 100], width: 500, height: 500 },
    ],
    {
      bounds: { x: 0, y: 0, width: 250, height: 200 },
      obstacles: [{ x: 90, y: 80, width: 40, height: 40 }],
    },
  );
  assert.equal(result.placements.length, 2);
  assert.deepEqual(result.unplaced, ["large"]);
  for (const p of result.placements) {
    assert.ok(
      p.x >= 0 && p.y >= 0 && p.x + p.width <= 250 && p.y + p.height <= 200,
    );
    assert.ok(
      p.x + p.width <= 90 || p.x >= 130 || p.y + p.height <= 80 || p.y >= 120,
    );
  }
  assert.deepEqual(
    result,
    placeLabels(
      [
        { id: "force", anchor: [100, 100], width: 50, height: 20 },
        { id: "body", anchor: [100, 100], width: 50, height: 20 },
        { id: "large", anchor: [100, 100], width: 500, height: 500 },
      ],
      {
        bounds: { x: 0, y: 0, width: 250, height: 200 },
        obstacles: [{ x: 90, y: 80, width: 40, height: 40 }],
      },
    ),
  );
  assert.throws(
    () =>
      placeLabels([{ id: "a" }, { id: "a" }], {
        bounds: { x: 0, y: 0, width: 1, height: 1 },
      }),
    /unique/,
  );
});
