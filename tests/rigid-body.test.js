import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  rigidBodyPlayback,
  applyRigidSample,
} from "../server/rigid-body/index.js";
const near = (a, b, t = 1e-3) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
test("Rapier gravity states, energies and deterministic arbitrary-time seeking share a fixed tick", async () => {
  const config = {
    duration: 0.5,
    step: 1 / 240,
    bodies: [
      {
        id: "ball",
        mass: 2,
        position: [0, 5, 0],
        shape: { kind: "ball", radius: 0.2 },
      },
    ],
  };
  const p = await rigidBodyPlayback(config),
    s = p.at(0.25),
    body = s.bodies.ball;
  near(body.velocity[1], -9.81 * 0.25);
  near(body.position[1], 5 - 0.5 * 9.81 * 0.25 ** 2, 0.01);
  near(body.kinetic, 0.5 * 2 * body.velocity[1] ** 2);
  assert.equal(p.at(0.252).sampleTime, 0.25);
  p.at(0.5);
  assert.deepEqual(p.at(0.25), s);
  const second = await rigidBodyPlayback(config);
  assert.deepEqual(second.samples(), p.samples());
  const copy = p.at(0.25);
  copy.bodies.ball.position[0] = 999;
  assert.deepEqual(p.at(0.25), s);
  const object = new THREE.Object3D();
  applyRigidSample(s, { ball: object });
  assert.deepEqual(object.position.toArray(), body.position);
  assert.throws(() => p.at(-1));
  assert.throws(() => p.at(1));
});
test("actual collider contact stops a falling body and records contact events", async () => {
  const p = await rigidBodyPlayback({
    duration: 1.5,
    step: 1 / 240,
    bodies: [
      {
        id: "floor",
        type: "fixed",
        position: [0, -0.1, 0],
        shape: { kind: "cuboid", halfExtents: [3, 0.1, 3] },
        restitution: 0,
      },
      {
        id: "ball",
        position: [0, 1, 0],
        shape: { kind: "ball", radius: 0.2 },
        restitution: 0,
      },
    ],
  });
  const end = p.at(p.duration).bodies.ball;
  near(end.position[1], 0.2, 0.01);
  near(end.velocity[1], 0, 0.01);
  assert.ok(
    p.events.some((e) => e.started && e.bodies.join(",") === "ball,floor"),
  );
  const first = p.events.find((e) => e.started);
  assert.ok(first.time > 0.35 && first.time < 0.5);
});
test("revolute joint keeps pivot anchored while arm rotates under gravity", async () => {
  const angle = 0.8,
    q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      angle,
    ),
    position = new THREE.Vector3(0, -1, 0).applyQuaternion(q).toArray();
  const p = await rigidBodyPlayback({
    duration: 1,
    step: 1 / 240,
    bodies: [
      { id: "pivot", type: "fixed", shape: { kind: "ball", radius: 0.05 } },
      {
        id: "arm",
        position,
        rotation: q.toArray(),
        mass: 2,
        shape: { kind: "cuboid", halfExtents: [0.1, 1, 0.1] },
      },
    ],
    joints: [
      {
        id: "hinge",
        kind: "revolute",
        a: "pivot",
        b: "arm",
        anchorB: [0, 1, 0],
        axis: [0, 0, 1],
      },
    ],
  });
  let maxError = 0;
  for (const f of p.samples()) {
    const b = f.bodies.arm,
      anchor = new THREE.Vector3(0, 1, 0)
        .applyQuaternion(new THREE.Quaternion(...b.rotation))
        .add(new THREE.Vector3(...b.position));
    maxError = Math.max(maxError, anchor.length());
    near(b.angularVelocity[0], 0);
    near(b.angularVelocity[1], 0);
  }
  assert.ok(maxError < 0.01);
  assert.ok(Math.abs(p.at(0.5).bodies.arm.angularVelocity[2]) > 1);
  const initial = p.at(0).bodies.arm,
    total0 = initial.kinetic + initial.potential,
    end = p.at(1).bodies.arm;
  near(end.kinetic + end.potential, total0, 0.12);
});
test("invalid dimensions, identities and inconsistent initial joints fail before simulation", async () => {
  const base = { duration: 1, bodies: [{ id: "a" }] };
  for (const changes of [
    { step: 0 },
    { bodies: [{ id: "a" }, { id: "a" }] },
    { bodies: [{ id: "a", shape: { kind: "ball", radius: 1e308 } }] },
    { bodies: [{ id: "a", rotation: [0, 0, 0, 0] }] },
    { joints: [{ id: "j", kind: "revolute", a: "a", b: "missing" }] },
  ])
    await assert.rejects(rigidBodyPlayback({ ...base, ...changes }));
  await assert.rejects(
    rigidBodyPlayback({
      duration: 1,
      bodies: [
        { id: "a", type: "fixed" },
        { id: "b", position: [2, 0, 0] },
      ],
      joints: [{ id: "j", kind: "spherical", a: "a", b: "b" }],
    }),
    /coincide/,
  );
});
test("fixed bodies cannot report velocity inconsistent with a stationary pose", async () => {
  for (const extra of [{ velocity: [2, 0, 0] }, { angularVelocity: [0, 0, 2] }])
    await assert.rejects(
      rigidBodyPlayback({
        duration: 1,
        bodies: [{ id: "fixed", type: "fixed", ...extra }],
      }),
      /Fixed bodies/,
    );
});
test("fixed and spherical joints preserve their distinct degrees of freedom", async () => {
  const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      0.5,
    ),
    anchor = new THREE.Vector3(-1, 0, 0)
      .applyQuaternion(q.clone().invert())
      .toArray();
  const bodies = [
    { id: "pivot", type: "fixed", shape: { kind: "ball", radius: 0.05 } },
    {
      id: "body",
      position: [1, 0, 0],
      rotation: q.toArray(),
      shape: { kind: "cuboid", halfExtents: [0.2, 0.3, 0.4] },
    },
  ];
  const fixed = await rigidBodyPlayback({
    duration: 0.5,
    bodies,
    joints: [
      { id: "weld", kind: "fixed", a: "pivot", b: "body", anchorB: anchor },
    ],
  });
  const b = fixed.at(0.5).bodies.body;
  near(b.position[0], 1, 0.002);
  near(b.position[1], 0, 0.002);
  near(b.rotation[2], q.z, 0.002);
  const spherical = await rigidBodyPlayback({
    duration: 0.5,
    bodies,
    joints: [
      {
        id: "ballJoint",
        kind: "spherical",
        a: "pivot",
        b: "body",
        anchorB: anchor,
      },
    ],
  });
  const moving = spherical.at(0.5).bodies.body,
    p = new THREE.Vector3(...anchor)
      .applyQuaternion(new THREE.Quaternion(...moving.rotation))
      .add(new THREE.Vector3(...moving.position));
  assert.ok(p.length() < 0.01);
  assert.ok(moving.position[1] < -0.2);
});
