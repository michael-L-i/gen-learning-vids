import * as THREE from "three";

const finite = (n, name) => {
  if (!Number.isFinite(n)) throw new Error(`${name} must be finite`);
  return n;
};
const positive = (n, name) => {
  finite(n, name);
  if (n <= 0 || n > 1e6) throw new Error(`${name} must be in (0, 1e6]`);
  return n;
};
const vec = (v, name) => {
  if (!Array.isArray(v) || v.length !== 3)
    throw new Error(`${name} must contain three coordinates`);
  return v.map((n) => finite(n, name));
};
const vertex = (v) => new THREE.Vector3(...v);
const geometry = (polygons) => {
  const coordinates = [];
  for (const polygon of polygons)
    for (let i = 1; i + 1 < polygon.length; i++)
      for (const p of [polygon[0], polygon[i], polygon[i + 1]])
        coordinates.push(...p.toArray());
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(coordinates, 3));
  g.computeVertexNormals();
  return g;
};
function solidFaces(shape, size, radius, length, segments) {
  if (shape === "box") {
    const [x, y, z] = vec(size, "size").map((n) => positive(n, "size") / 2);
    const points = [
      [-x, -y, -z],
      [x, -y, -z],
      [x, y, -z],
      [-x, y, -z],
      [-x, -y, z],
      [x, -y, z],
      [x, y, z],
      [-x, y, z],
    ].map(vertex);
    return [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
      [0, 1, 5, 4],
      [3, 7, 6, 2],
    ].map((face) => face.map((i) => points[i]));
  }
  if (shape === "cylinder") {
    positive(radius, "radius");
    positive(length, "length");
    if (!Number.isInteger(segments) || segments < 8 || segments > 256)
      throw new Error("segments must be an integer from 8 to 256");
    const ring = (y) =>
      Array.from(
        { length: segments },
        (_, i) =>
          new THREE.Vector3(
            radius * Math.cos((i * 2 * Math.PI) / segments),
            y,
            radius * Math.sin((i * 2 * Math.PI) / segments),
          ),
      );
    const bottom = ring(-length / 2),
      top = ring(length / 2);
    return [
      bottom,
      [...top].reverse(),
      ...bottom.map((p, i) => {
        const j = (i + 1) % segments;
        return [p, top[i], top[j], bottom[j]];
      }),
    ];
  }
  throw new Error("shape must be box or cylinder");
}

/** Real clipped convex geometry, filled section cap and section outline.
 * Plane is LOCAL: keep normal·point >= offset. Cylinder is a polygonal prism on Y.
 * No shader clipping, CSG, hollow mesh inference, or arbitrary concave input.
 */
export function cutawaySolid({
  shape = "box",
  size = [1, 1, 1],
  radius = 0.5,
  length = 1,
  segments = 48,
  color = "#9aabba",
  sectionColor = "#e9b768",
  outlineColor = "#624518",
} = {}) {
  const faces = solidFaces(shape, size, radius, length, segments);
  const scale = Math.max(...faces.flat().map((p) => p.length()));
  const tolerance = scale * 1e-9;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.7,
    metalness: 0.05,
  });
  const sectionMaterial = new THREE.MeshStandardMaterial({
    color: sectionColor,
    roughness: 0.8,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const outlineMaterial = new THREE.LineBasicMaterial({ color: outlineColor });
  const group = new THREE.Group(),
    surface = new THREE.Mesh(geometry(faces), material),
    section = new THREE.Mesh(new THREE.BufferGeometry(), sectionMaterial),
    outline = new THREE.LineLoop(new THREE.BufferGeometry(), outlineMaterial);
  group.add(surface, section, outline);
  let disposed = false;
  function replace(object, next) {
    object.geometry.dispose();
    object.geometry = next;
  }
  function setSection(plane = null) {
    if (disposed) throw new Error("cutaway is disposed");
    if (plane === null) {
      replace(surface, geometry(faces));
      replace(section, new THREE.BufferGeometry());
      replace(outline, new THREE.BufferGeometry());
      section.visible = outline.visible = false;
      return { points: [], area: 0 };
    }
    const normal = vertex(vec(plane.normal, "normal"));
    const normalLength = positive(normal.length(), "normal length");
    normal.normalize();
    const offset = finite(
      finite(plane.offset ?? 0, "offset") / normalLength,
      "normalized offset",
    );
    const hits = [],
      clipped = [];
    const distance = (p) => normal.dot(p) - offset;
    const add = (p) => {
      if (!hits.some((h) => h.distanceTo(p) <= tolerance)) hits.push(p.clone());
    };
    for (const face of faces) {
      const output = [];
      for (let i = 0; i < face.length; i++) {
        const a = face[i],
          b = face[(i + 1) % face.length],
          da = distance(a),
          db = distance(b);
        if (Math.abs(da) <= tolerance) add(a);
        if (da >= 0) output.push(a.clone());
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
          const p = a.clone().lerp(b, da / (da - db));
          output.push(p);
          add(p);
        }
      }
      if (output.length >= 3) clipped.push(output);
    }
    // A tangent face is already present in the surface, not a new interior section.
    const distances = faces.flat().map(distance),
      crosses =
        Math.min(...distances) < -tolerance &&
        Math.max(...distances) > tolerance;
    const points = crosses ? hits : [];
    let area = 0;
    if (points.length >= 3) {
      const center = points
        .reduce((s, p) => s.add(p), new THREE.Vector3())
        .multiplyScalar(1 / points.length);
      const axis =
        Math.abs(normal.x) < 0.8
          ? new THREE.Vector3(1, 0, 0)
          : new THREE.Vector3(0, 1, 0);
      const u = axis.cross(normal).normalize(),
        v = normal.clone().cross(u);
      points.sort(
        (a, b) =>
          Math.atan2(
            a.clone().sub(center).dot(v),
            a.clone().sub(center).dot(u),
          ) -
          Math.atan2(
            b.clone().sub(center).dot(v),
            b.clone().sub(center).dot(u),
          ),
      );
      // Outward normal of retained half is -normal.
      points.reverse();
      for (let i = 1; i + 1 < points.length; i++)
        area +=
          points[i]
            .clone()
            .sub(points[0])
            .cross(points[i + 1].clone().sub(points[0]))
            .length() / 2;
    }
    replace(surface, geometry(clipped));
    replace(section, geometry(points.length >= 3 ? [points] : []));
    replace(outline, new THREE.BufferGeometry().setFromPoints(points));
    section.visible = outline.visible = points.length >= 3;
    return { points: points.map((p) => p.toArray()), area };
  }
  setSection(null);
  return {
    group,
    surface,
    section,
    outline,
    setSection,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of [surface, section, outline]) o.geometry.dispose();
      material.dispose();
      sectionMaterial.dispose();
      outlineMaterial.dispose();
    },
  };
}

/** Absolute local explosion offsets; never accumulates across seek order.
 * Capture base positions once. Parent transforms remain under caller control.
 */
export function explodedAssembly(parts) {
  if (!Array.isArray(parts) || !parts.length)
    throw new Error("parts must be a nonempty array");
  const ids = new Set(),
    objects = new Set();
  const entries = parts.map(({ id, object, offset }) => {
    if (typeof id !== "string" || !id || ids.has(id))
      throw new Error("part IDs must be unique");
    ids.add(id);
    if (!object?.isObject3D || objects.has(object))
      throw new Error("parts need distinct Three.js objects");
    objects.add(object);
    return {
      id,
      object,
      base: object.position.clone(),
      offset: vertex(vec(offset, "offset")),
    };
  });
  // Parent and child offsets together are ambiguous; require independent parts.
  for (const a of entries)
    for (const b of entries)
      for (let p = a.object.parent; p; p = p.parent)
        if (p === b.object)
          throw new Error("exploded parts cannot contain one another");
  return {
    set(amount) {
      finite(amount, "amount");
      if (amount < 0 || amount > 1)
        throw new Error("amount must be between 0 and 1");
      for (const e of entries)
        e.object.position.copy(e.base).addScaledVector(e.offset, amount);
    },
    anchors() {
      return Object.fromEntries(
        entries.map((e) => [
          e.id,
          e.object.getWorldPosition(new THREE.Vector3()).toArray(),
        ]),
      );
    },
  };
}
