# JSXGraph constructions and calculus

Import `@lesson-library/constructions` for real JSXGraph SVG boards, dependent
geometry, secants and tangents, or numerical integral approximations. Use it when
moving one mathematical object should update its dependencies. It is independent
of the renderer-free linear-map helpers in `@lesson-library/math`.

```js
import { constructionBoard, secantTangent } from '@lesson-library/constructions';
export async function buildScene(root, context) {
  const box = document.createElement('div');
  box.style.cssText = 'width:800px;height:560px';
  root.append(box);
  const surface = await constructionBoard(box, {
    boundingBox: [-0.5, 5, 3, -0.5], axis: true,
  });
  const construction = secantTangent(surface, {
    f: x => x*x, domain: [-0.5, 2.2], x: 1, h: 1,
    styles: { graph: {strokeColor:'#334155'},
      secant: {strokeColor:'#c2410c'}, tangent: {strokeColor:'#0f766e'} },
  });
  await document.fonts.ready;
  return { update(t) {
    // Derive progress from the relevant measured narration beat in a lesson.
    const p = Math.max(0, Math.min(1, t / context.duration));
    construction.set({x:1, h:1 - 0.98*p});
  }};
}
```

The container must be connected and have positive explicit dimensions. Await
`constructionBoard`; JSXGraph bundles locally, with no CDN, stylesheet or remote
fonts required. Bounds are `[left, top, right, bottom]`. SVG labels default to
internal rendering; use local MathJax SVG or authored mathematical HTML for larger
equations. `surface.board` is the actual JSXGraph board, and
`surface.create(type, parents, attributes)` exposes further native constructions.
Styles are JSXGraph attributes. Keep styles free of wall-clock animation and
traces. The adapter disables interaction, resizing, navigation and transitions.
After changing authored state used by native callback parents, call
`surface.update()`. Optional `surface.dispose()` frees the board for manual reuse;
the current lesson host instead closes each chapter's browser page.

- `triangleConstruction(surface,{vertices:[[ax,ay],[bx,by],[cx,cy]],styles})`
  returns `points`, `base`, `sides`, `midpoint`, `foot`, `altitude`, and
  `setVertices(vertices)`. M is the native midpoint of AB; H is C's native
  orthogonal projection onto the infinite line AB, possibly outside the segment.
  Styles keys: `point`, `base`, `side`, `midpoint`, `foot`, `altitude`.
  Base length must be at least 1e-10 coordinate units. Label right angles and
  equal lengths explicitly when teaching those relationships.
- `secantTangent(surface,{f,domain,x,h,styles})` returns `graph`, `start`, `end`,
  `secant`, `tangent`, `set({x,h})`, and `sample()`. Both points stay on f;
  the native tangent uses JSXGraph's numerical derivative. Styles keys match
  the returned elements. Use a smooth, reviewed function and a domain containing
  both points; graph domain controls display, not the function's mathematical
  domain. Numerical differentiation does not establish differentiability.
  `h` cannot be zero or too small to separate floating-point coordinates.
  Show a limiting statement separately; do not label a small finite secant as
  exactly the tangent. `secantSample({f,x,h})` provides independent numeric values.
- `integralApproximation(surface,{f,a,b,n,method,styles})` returns `graph`, native
  JSXGraph `rectangles`, `set({a,b,n,method})`, and `sample()`. Every set is a
  complete state; omitted method means `left`. Methods are `left`, `right`,
  `middle`, `trapezoidal`; n is an integer 1–1000 and a < b. `sample()` includes
  cells, signed `value` and native `renderedValue`. Styles keys are `graph` and
  `rectangles`. `riemannSample` computes the same authored approximation without
  a browser. Trapezoidal cells have averaged endpoint heights; they are not
  midpoint rectangles. Below-axis contributions are negative. State the rule
  visibly; a refined finite sum is still an approximation, not an exact integral.

All authored functions must be pure and finite on the plotted/evaluated domain.
Callbacks are trusted JavaScript. Validation is not domain analysis, an error
bound, a symbolic proof, or protection against a pathological callback. Supply
all animated state from the requested time; never use JSXGraph `animate`, timers,
interactive drags or incremental frame history. Preserve point identities and
inspect moving labels at convergence, projection extensions and narrow partitions.
No fixed teaching sequence or chapter layout is required.

API sources: [JSXGraph tangent](https://jsxgraph.org/docs/symbols/Tangent.html),
[Riemann sum](https://jsxgraph.org/docs/symbols/Riemannsum.html),
[midpoint](https://jsxgraph.org/docs/symbols/Midpoint.html), and
[orthogonal projection](https://jsxgraph.org/docs/symbols/Orthogonalprojection.html).
JSXGraph is distributed under a choice of MIT or LGPL-3.0-or-later; this integration
uses its MIT option. Keep package license notices in redistributed dependencies.
