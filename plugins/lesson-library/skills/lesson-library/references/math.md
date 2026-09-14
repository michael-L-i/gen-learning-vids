# Linear transformations

Optional browser import: `@lesson-library/math`. These renderer-independent
helpers provide 2D geometry; authors control SVG/Canvas/Three.js presentation,
labels, narration, and timing. They impose no teaching sequence.

```js
import { linearTransformation, interpolate2D, IDENTITY_2D } from '@lesson-library/math';
const model = linearTransformation({
  xRange: [-3, 3], yRange: [-2, 2], step: 1,
  points: [{ id: 'v', point: [1, 1] }],
});
// Inside update(seconds), derive progress from measured context.beats.
const state = model.sample(interpolate2D(IDENTITY_2D, [[2, 1], [0, 1]], progress));
// Draw state.lines, state.basis, state.unitCell, and state.points.
```

Matrices are rows `[[a,b],[c,d]]` and act on column vectors: `(x,y)` maps to
`(a*x+b*y,c*x+d*y)`. Coordinates are mathematical, with y up; convert them to
screen coordinates consistently. `basis` contains transformed e1 and e2 endpoints;
`unitCell` is the four transformed unit-square vertices in original order.
`lines` contains stable `id`, source `axis`/`at`, and two transformed endpoints.
`points` preserves supplied unique IDs. Every sample returns fresh arrays.

`transformPoint(matrix, point)`, `determinant2D(matrix)`, and
`compose2D(after, before)` are separately composable. `interpolate2D(from,to,t)`
uses entrywise interpolation with t in [0,1]. This is a path through linear maps,
not generally a rigid rotation or physical motion. Invertible endpoint matrices
can pass through a singular intermediate map. Negative determinants reverse
orientation; `areaScale` is the determinant's absolute value. `orientation` uses
exact floating-point sign/zero, not a numerical rank or conditioning test.

All inputs/results must be finite, grid ranges increasing, and step positive.
Grid positions are integer multiples of step; at most 2001 lines per axis.
Finite floating-point geometry is not symbolic algebra or a proof system.
No CAS, general equation manipulation, automatic label placement, clipping, or
function-domain analysis is included. Verify the chosen mathematical model and
inspect intermediate frames, including collapse if the animation crosses one.
