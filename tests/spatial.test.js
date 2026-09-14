import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { cutawaySolid, explodedAssembly } from "../server/spatial/index.js";
const near = (a, b, t = 1e-6) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
const volume = (...geometries) =>
  geometries.reduce((total, g) => {
    const a = g.getAttribute("position");
    let sum = 0;
    for (let i = 0; i < a.count; i += 3) {
      const p = new THREE.Vector3().fromBufferAttribute(a, i),
        q = new THREE.Vector3().fromBufferAttribute(a, i + 1),
        r = new THREE.Vector3().fromBufferAttribute(a, i + 2);
      sum += p.dot(q.cross(r)) / 6;
    }
    return total + sum;
  }, 0);
test("box cutaway includes a closed section cap with correct polygon area and volume", () => {
  const c = cutawaySolid({ size: [2, 4, 6] });
  near(volume(c.surface.geometry), 48);
  const s = c.setSection({ normal: [1, 0, 0], offset: 0.5 });
  near(s.area, 24);
  assert.equal(s.points.length, 4);
  s.points.forEach((p) => near(p[0], 0.5));
  near(volume(c.surface.geometry, c.section.geometry), 12);
  const normals = c.section.geometry.getAttribute("normal");
  near(normals.getX(0), -1);
  c.setSection(null);
  near(volume(c.surface.geometry), 48);
  assert.equal(c.section.visible, false);
  c.dispose();
  assert.throws(() => c.setSection(null), /disposed/);
});
test("diagonal and rotated cutaways retain local-space sections; seeking does not accumulate", () => {
  const c = cutawaySolid({ size: [2, 2, 2] });
  const plane = { normal: [1, 1, 1], offset: 0 };
  const first = c.setSection(plane);
  assert.equal(first.points.length, 6);
  near(first.area, 3 * Math.sqrt(3));
  near(volume(c.surface.geometry, c.section.geometry), 4);
  c.group.position.set(3, 4, 5);
  c.group.rotation.set(0.2, 0.4, 0.6);
  c.group.updateMatrixWorld(true);
  for (const p of first.points) {
    const world = c.group.localToWorld(new THREE.Vector3(...p));
    const local = c.group.worldToLocal(world);
    near(local.x + local.y + local.z, 0);
  }
  c.setSection({ normal: [1, 0, 0], offset: 3 });
  assert.equal(c.surface.geometry.getAttribute("position").count, 0);
  assert.deepEqual(c.setSection(plane), first);
  c.dispose();
});
test("cylinder section is real bounded polygon geometry, tangent plane has no duplicate cap", () => {
  const c = cutawaySolid({
    shape: "cylinder",
    radius: 2,
    length: 4,
    segments: 64,
  });
  const s = c.setSection({ normal: [0, 1, 0], offset: 0 });
  near(s.area, (64 * 4 * Math.sin((2 * Math.PI) / 64)) / 2);
  near(volume(c.surface.geometry, c.section.geometry), s.area * 2, 1e-5);
  c.setSection({ normal: [0, 1, 0], offset: -2 });
  assert.equal(c.section.visible, false);
  c.dispose();
  assert.throws(() => cutawaySolid({ shape: "sphere" }), /shape/);
});
test("exploded parts seek absolutely and expose transformed anchors", () => {
  const group = new THREE.Group(),
    a = new THREE.Object3D(),
    b = new THREE.Object3D();
  group.add(a, b);
  a.position.set(1, 2, 3);
  group.position.set(10, 0, 0);
  const assembly = explodedAssembly([
    { id: "a", object: a, offset: [0, 0, 4] },
    { id: "b", object: b, offset: [2, 0, 0] },
  ]);
  assembly.set(0.5);
  assert.deepEqual(assembly.anchors().a, [11, 2, 5]);
  assembly.set(1);
  assembly.set(0.5);
  assert.deepEqual(a.position.toArray(), [1, 2, 5]);
  assembly.set(0);
  assert.deepEqual(a.position.toArray(), [1, 2, 3]);
  assert.throws(() => assembly.set(2));
  assert.throws(
    () =>
      explodedAssembly([
        { id: "x", object: group, offset: [0, 0, 0] },
        { id: "y", object: a, offset: [0, 0, 0] },
      ]),
    /contain/,
  );
});
test("equivalent scaled plane equations yield identical sections", () => {
  const c = cutawaySolid({ size: [2, 2, 2] });
  assert.deepEqual(
    c.setSection({ normal: [2, 0, 0], offset: 1 }),
    c.setSection({ normal: [1, 0, 0], offset: 0.5 }),
  );
  near(c.setSection({ normal: [2, 0, 0], offset: 1 }).area, 4);
  c.dispose();
});
