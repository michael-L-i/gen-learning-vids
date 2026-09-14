import RAPIER from "@dimforge/rapier3d-compat";
import { Quaternion, Vector3 } from "three";
let initialization;
const finite = (v, n) => {
  if (!Number.isFinite(v)) throw new Error(`${n} must be finite`);
  return v;
};
const bounded = (v, n, min = -1e6, max = 1e6) => {
  finite(v, n);
  if (v < min || v > max) throw new Error(`${n} must be in [${min}, ${max}]`);
  return v;
};
const vector = (v, n) => {
  if (!Array.isArray(v) || v.length !== 3)
    throw new Error(`${n} must contain three coordinates`);
  return v.map((x) => bounded(x, n));
};
const xyz = (v) => ({ x: v[0], y: v[1], z: v[2] });
const array = (v) => [v.x, v.y, v.z].map((n) => finite(n, "simulation state"));
const quaternion = (v) => {
  if (!Array.isArray(v) || v.length !== 4)
    throw new Error("rotation must be [x,y,z,w]");
  v.forEach((n) => finite(n, "rotation"));
  const q = new Quaternion(...v);
  if (Math.abs(q.length() - 1) > 1e-6)
    throw new Error("rotation must be a unit quaternion");
  return q.normalize();
};
const identity = (v, set) => {
  if (typeof v !== "string" || !v || set.has(v))
    throw new Error("IDs must be unique nonempty strings");
  set.add(v);
  return v;
};
const copy = (value) => structuredClone(value);

/** Precompute actual Rapier steps, then sample the preceding tick without interpolation.
 * All quantities in a sample share sampleTime. No simulation mutation during playback.
 * Fixed/dynamic co-centered primitive colliders, gravity, initial velocities and passive joints.
 */
export async function rigidBodyPlayback({
  bodies,
  joints = [],
  gravity = [0, -9.81, 0],
  duration,
  step = 1 / 120,
}) {
  bounded(duration, "duration", 0.001, 120);
  bounded(step, "step", 0.001, 1 / 15);
  if (!Array.isArray(bodies) || !bodies.length || bodies.length > 100)
    throw new Error("Provide 1–100 bodies");
  if (!Array.isArray(joints) || joints.length > 100)
    throw new Error("Provide at most 100 joints");
  const ticks = Math.ceil(duration / step),
    actualDuration = ticks * step;
  if ((ticks + 1) * bodies.length > 250000)
    throw new Error("Playback exceeds 250000 body samples");
  const g = vector(gravity, "gravity"),
    ids = new Set();
  const definitions = bodies.map((b) => {
    const id = identity(b.id, ids),
      type = b.type ?? "dynamic";
    if (!["fixed", "dynamic"].includes(type))
      throw new Error("body type must be fixed or dynamic");
    const position = vector(b.position ?? [0, 0, 0], "position"),
      rotation = quaternion(b.rotation ?? [0, 0, 0, 1]),
      velocity = vector(b.velocity ?? [0, 0, 0], "velocity"),
      angularVelocity = vector(
        b.angularVelocity ?? [0, 0, 0],
        "angularVelocity",
      );
    if (
      type === "fixed" &&
      [...velocity, ...angularVelocity].some((v) => v !== 0)
    )
      throw new Error("Fixed bodies cannot have initial velocities");
    const shape = b.shape ?? { kind: "ball", radius: 0.5 };
    if (!["ball", "cuboid", "cylinder"].includes(shape.kind))
      throw new Error("shape must be ball, cuboid or cylinder");
    const dimensions =
      shape.kind === "cuboid"
        ? vector(shape.halfExtents, "halfExtents")
        : [
            shape.radius,
            ...(shape.kind === "cylinder" ? [shape.halfHeight] : []),
          ];
    dimensions.forEach((v) => bounded(v, "collider dimension", 1e-4, 1e4));
    return {
      id,
      type,
      position,
      rotation,
      velocity,
      angularVelocity,
      shape: { kind: shape.kind, dimensions },
      mass: bounded(b.mass ?? 1, "mass", 1e-6, 1e6),
      friction: bounded(b.friction ?? 0.5, "friction", 0, 10),
      restitution: bounded(b.restitution ?? 0, "restitution", 0, 1),
    };
  });
  const byId = new Map(definitions.map((b) => [b.id, b])),
    jointIds = new Set();
  const jointDefinitions = joints.map((j) => {
    const id = identity(j.id, jointIds),
      a = byId.get(j.a),
      b = byId.get(j.b);
    if (!a || !b || a === b)
      throw new Error("joint needs distinct declared bodies");
    if (!["revolute", "spherical", "fixed"].includes(j.kind))
      throw new Error("joint kind must be revolute, spherical or fixed");
    const anchorA = vector(j.anchorA ?? [0, 0, 0], "anchorA"),
      anchorB = vector(j.anchorB ?? [0, 0, 0], "anchorB");
    const point = (body, anchor) =>
      new Vector3(...anchor)
        .applyQuaternion(body.rotation)
        .add(new Vector3(...body.position));
    if (point(a, anchorA).distanceTo(point(b, anchorB)) > 1e-4)
      throw new Error("Initial joint anchors must coincide in world space");
    const axis = vector(j.axis ?? [0, 0, 1], "joint axis"),
      v = new Vector3(...axis);
    if (v.length() < 1e-8) throw new Error("joint axis must be nonzero");
    v.normalize();
    if (
      j.kind === "revolute" &&
      v
        .clone()
        .applyQuaternion(a.rotation)
        .distanceTo(v.clone().applyQuaternion(b.rotation)) > 1e-5
    )
      throw new Error(
        "Revolute local axes must initially align in world space",
      );
    return {
      id,
      kind: j.kind,
      a: j.a,
      b: j.b,
      anchorA,
      anchorB,
      axis: v.toArray(),
      frameA: a.rotation.clone().invert(),
      frameB: b.rotation.clone().invert(),
    };
  });
  initialization ??= RAPIER.init();
  await initialization;
  const world = new RAPIER.World(xyz(g)),
    queue = new RAPIER.EventQueue(true),
    handles = new Map(),
    colliderIds = new Map(),
    events = [],
    frames = [];
  world.timestep = step;
  world.numSolverIterations = 12;
  world.numInternalPgsIterations = 2;
  try {
    for (const b of definitions) {
      const desc = (
        b.type === "fixed"
          ? RAPIER.RigidBodyDesc.fixed()
          : RAPIER.RigidBodyDesc.dynamic()
      )
        .setTranslation(...b.position)
        .setRotation(b.rotation)
        .setLinvel(...b.velocity)
        .setAngvel(xyz(b.angularVelocity))
        .setCanSleep(false)
        .setCcdEnabled(true);
      const body = world.createRigidBody(desc);
      handles.set(b.id, body);
      const dims = b.shape.dimensions,
        collider =
          b.shape.kind === "ball"
            ? RAPIER.ColliderDesc.ball(dims[0])
            : b.shape.kind === "cuboid"
              ? RAPIER.ColliderDesc.cuboid(...dims)
              : RAPIER.ColliderDesc.cylinder(dims[1], dims[0]);
      collider
        .setMass(b.mass)
        .setFriction(b.friction)
        .setRestitution(b.restitution)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      colliderIds.set(world.createCollider(collider, body).handle, b.id);
      body.recomputeMassPropertiesFromColliders();
    }
    for (const j of jointDefinitions) {
      const a = xyz(j.anchorA),
        b = xyz(j.anchorB),
        data =
          j.kind === "revolute"
            ? RAPIER.JointData.revolute(a, b, xyz(j.axis))
            : j.kind === "spherical"
              ? RAPIER.JointData.spherical(a, b)
              : RAPIER.JointData.fixed(a, j.frameA, b, j.frameB);
      world
        .createImpulseJoint(data, handles.get(j.a), handles.get(j.b), true)
        .setContactsEnabled(false);
    }
    function snapshot(index) {
      const states = Object.fromEntries(
        definitions.map((def) => {
          const b = handles.get(def.id),
            position = array(b.translation()),
            rotation = b.rotation(),
            velocity = array(b.linvel()),
            angularVelocity = array(b.angvel());
          const mass = def.type === "fixed" ? 0 : finite(b.mass(), "mass"),
            inertia = array(b.principalInertia());
          const principal = new Quaternion();
          const local = b.principalInertiaLocalFrame();
          principal
            .set(rotation.x, rotation.y, rotation.z, rotation.w)
            .multiply(new Quaternion(local.x, local.y, local.z, local.w));
          const omega = new Vector3(...angularVelocity)
            .applyQuaternion(principal.invert())
            .toArray();
          const kinetic =
            def.type === "fixed"
              ? 0
              : 0.5 * mass * velocity.reduce((s, v) => s + v * v, 0) +
                0.5 *
                  inertia.reduce((s, v, i) => s + v * omega[i] * omega[i], 0);
          const potential =
            -mass * g.reduce((s, v, i) => s + v * position[i], 0);
          const q = [rotation.x, rotation.y, rotation.z, rotation.w];
          q.forEach((v) => finite(v, "rotation"));
          return [
            def.id,
            {
              position,
              rotation: q,
              velocity,
              angularVelocity,
              mass,
              kinetic: finite(kinetic, "kinetic energy"),
              potential: finite(potential, "potential energy"),
            },
          ];
        }),
      );
      frames.push({
        sampleIndex: index,
        sampleTime: index * step,
        bodies: states,
      });
    }
    snapshot(0);
    for (let i = 1; i <= ticks; i++) {
      world.step(queue);
      queue.drainCollisionEvents((a, b, started) =>
        events.push({
          sampleIndex: i,
          time: i * step,
          bodies: [colliderIds.get(a), colliderIds.get(b)].sort(),
          started,
        }),
      );
      snapshot(i);
    }
  } finally {
    queue.free();
    world.free();
  }
  events.sort(
    (a, b) =>
      a.sampleIndex - b.sampleIndex ||
      a.bodies.join("\0").localeCompare(b.bodies.join("\0")) ||
      Number(b.started) - Number(a.started),
  );
  return Object.freeze({
    step,
    duration: actualDuration,
    requestedDuration: duration,
    bodyIds: [...ids],
    events: copy(events),
    at(seconds) {
      finite(seconds, "time");
      if (seconds < 0 || seconds > actualDuration + 1e-10)
        throw new Error("time must lie within playback duration");
      const index = Math.min(ticks, Math.floor(seconds / step + 1e-9));
      return { ...copy(frames[index]), requestedTime: seconds };
    },
    samples() {
      return copy(frames);
    },
  });
}

/** Apply the exact sampled rigid transform to identity-keyed Three.js objects. */
export function applyRigidSample(sample, objects) {
  for (const [id, object] of Object.entries(objects)) {
    const state = sample.bodies[id];
    if (!state) throw new Error(`No sampled body ${id}`);
    if (!object?.isObject3D) throw new Error("Expected a Three.js object");
    object.position.fromArray(state.position);
    object.quaternion.fromArray(state.rotation);
  }
}
