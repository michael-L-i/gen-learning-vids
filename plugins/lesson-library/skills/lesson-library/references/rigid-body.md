# Rapier rigid-body playback

Import `rigidBodyPlayback` and `applyRigidSample` from `@lesson-library/rigid-body`.
This uses the installed `@dimforge/rapier3d-compat` WASM solver, not drawn substitutes
or an analytic collision approximation. It can be used separately from spatial
cutaways. Its embedded WASM needs no remote fetch or extra host asset route.

## Define a bounded physical model

Await `rigidBodyPlayback({bodies,joints=[],gravity=[0,-9.81,0],duration,step=1/120})`
inside `buildScene`. SI units are recommended: metres, seconds, kilograms; Y is
normally up. Explicitly state gravity, constraints, initial conditions and contacts
that matter. A chosen rigid-body model does not establish those conditions.

Bodies have unique string `id`, `type:'fixed'|'dynamic'` (default dynamic),
`position:[x,y,z]`, unit `rotation:[x,y,z,w]`, `velocity:[vx,vy,vz]`,
`angularVelocity:[wx,wy,wz]` in radians/second, `mass` (default 1), `friction`
(default .5) and `restitution` (default 0). A single centered collider uses
`shape:{kind:'ball',radius}`, `{kind:'cuboid',halfExtents:[x,y,z]}`, or
`{kind:'cylinder',radius,halfHeight}` (Y axis). Defaults are zero motion/position,
identity rotation and a ball of radius .5. Fixed bodies must have zero initial
linear and angular velocity. Material mixing uses Rapier's defaults.
The display mesh must match collider dimensions; decorative parts are not colliders.

Passive joints have `id,kind,a,b,anchorA,anchorB`; anchors are LOCAL to their bodies
and must initially coincide in world space (within 1e-4 model units). Supported
kinds are `spherical`, `fixed` and `revolute`. Revolute adds `axis:[x,y,z]`, the same
local axis on both bodies, which must initially align in world space. A fixed joint
preserves the initial relative rotation. Contacts between the two joined bodies
are disabled. No motors, gear ratios, arbitrary constraints, compound colliders,
forces changing with time, or kinematic bodies are exposed by this bounded adapter.

Coordinates/velocities/gravity/anchors are limited to ±1e6, collider dimensions to
[1e-4,1e4], mass to [1e-6,1e6], friction to [0,10], restitution to [0,1]. Duration
is .001–120 seconds; step is .001–1/15 second. At most 100 bodies, 100 joints and
250000 stored body samples. These input bounds do not guarantee numerical accuracy;
choose scales/timestep deliberately and check contact/constraint errors.

## Seek, draw and measure together

The adapter steps forward once, stores poses and solver velocities/energies, and
frees the Rapier world. `playback.at(seconds)` returns a detached sample with
`requestedTime`, **`sampleTime`**, `sampleIndex`, and `bodies[id]` containing
`position`, quaternion `rotation`, `velocity`, `angularVelocity`, `mass`,
`kinetic` and `potential`. Kinetic energy includes rotation using the solver's
principal inertia; potential is −mass·gravity·position relative to the origin.
Fixed bodies report zero mass and energy. Contact/joint constraints can dissipate
energy; numerical stepping is approximate, not an exact conservation guarantee.

Sampling returns the preceding stored tick, with a tiny roundoff allowance at tick
boundaries. There is deliberately no interpolation through a collision. Use
`sampleTime` for diagram, graph cursor and readouts; label stretched playback or
holds. `duration` is rounded up to a whole tick; `requestedDuration` retains input.
Out-of-range times throw. Reordered seeks and repeated runs with the same config
and installed engine are tested; no promise of bit identity across versions or
platforms. A finer timestep improves temporal resolution at a memory/time cost.

`playback.samples()` returns detached copies for plots. `playback.events` holds
`{sampleIndex,time,bodies:[idA,idB],started}` collision transitions, observed after
that solver step. Events mark solver contact detection, not a continuous exact
impact-time calculation. They are not force or impulse measurements.

`applyRigidSample(sample,{id:threeObject,...})` sets object LOCAL positions and
quaternions from the sampled model coordinates. Put objects in the same unscaled
model frame; a common transformed parent is fine for viewing. It does not resize
meshes, infer IDs or apply physics to unrelated decorations.

```js
const playback = await rigidBodyPlayback({duration:2,bodies:[
  {id:'floor',type:'fixed',position:[0,-.1,0],
   shape:{kind:'cuboid',halfExtents:[3,.1,3]}},
  {id:'ball',position:[0,1,0],shape:{kind:'ball',radius:.2}},
]});
return {update(t) {
  const state = playback.at(Math.min(t,playback.duration));
  applyRigidSample(state,{ball:ballMesh,floor:floorMesh});
  timeLabel.textContent = `${state.sampleTime.toFixed(2)} s`;
  renderer.render(scene,camera);
}};
```

Sources: [Rapier joints](https://rapier.rs/docs/user_guides/javascript/joints/),
[Rigid bodies](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/),
[Determinism](https://rapier.rs/docs/user_guides/javascript/determinism/).
