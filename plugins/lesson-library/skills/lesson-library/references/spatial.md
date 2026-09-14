# Spatial cutaways and exploded views

Use `@lesson-library/spatial` when revealing internal geometry or part relationships
helps the explanation. These independent Three.js objects do not own a camera,
renderer, narration sequence or teaching structure. Use actual measured beats and
preserve useful labels; an empty profile is not evidence of beginner knowledge.

## Actual cross-section geometry

`cutawaySolid({shape='box',size=[1,1,1],radius=.5,length=1,segments=48,
color,sectionColor,outlineColor})` returns `{group,surface,section,outline,
setSection,dispose}`. Add `group` to your Three.js scene. `surface` and `section`
are meshes; `outline` is a LineLoop. A box is centered with full XYZ size. A
cylinder is centered on local Y, with full length and 8–256 radial segments.
Dimensions are positive and at most 1e6 in consistent model units.

`setSection({normal:[nx,ny,nz],offset})` keeps **normal·point ≥ offset** in the
solid's LOCAL coordinates. The normal and offset are normalized together, so
scaling both by a positive factor describes the same plane. `setSection(null)` restores the
whole solid. It rebuilds clipped face polygons, a triangulated filled cap, and a
closed outline, returning `{points,area}` for the local section polygon. Parent
translation/rotation affects all three together. Do not pass a world-space plane
without transforming it into the solid's local frame.

This is bounded convex geometry, not general mesh Boolean CSG. Cylinder sections
are polygonal approximations to analytic conics. Plane/edge coincidences use a
relative tolerance of 1e-9 of the primitive's size; a tangent plane has no separate
interior cap. Hollow or concave parts must be modeled as separate supported solid
pieces. Caps never infer cavities. No remote assets or shader clipping are needed.

```js
import {cutawaySolid} from '@lesson-library/spatial';
const part = cutawaySolid({shape:'box',size:[2,4,6]});
scene.add(part.group);
// x >= .5 remains; cap has area 24 square model units.
const section = part.setSection({normal:[1,0,0],offset:.5});
```

Changing a plane disposes/replaces owned geometry. Update only when the plane
changes; arbitrary calls remain deterministic. Call `dispose()` when removing an
owned solid. The host currently closes each chapter page; it does not invoke
arbitrary helper cleanup callbacks.

## Exploded assembly

`explodedAssembly([{id,object,offset:[x,y,z]},...])` captures each object's base
local position, returning `set(amount)` and `anchors()`. `amount` is in [0,1];
0 restores assembly and 1 adds the full local offset. Calls never accumulate.
Distinct IDs and objects are required; listed parts cannot contain one another.
`anchors()` returns current object origins in world coordinates for label pointers.
Use object groups to move an entire part with its cap and outline. Object rotations,
materials, visibility and parenting remain authored by the caller. Do not change
base local positions after creating an assembly; make a new assembly instead.

An exploded view explains placement, not physical motion. Label it as an inspection
view. If showing dynamics too, reassemble first and drive all dynamic poses and
quantities from one simulation sample. Never imply a visual cap creates a physical
contact surface.

Package reference: [Three.js BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html).
