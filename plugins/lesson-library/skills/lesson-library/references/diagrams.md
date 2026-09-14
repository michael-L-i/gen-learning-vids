# Relationship and reasoning diagrams

Use `@lesson-library/diagrams` for actual ELK.js layout and deterministic SVG
rendering of arguments, relations or branching decisions. Roles and relationships
are authored data. Layout does not validate an argument, infer a causal claim,
check exhaustive branches or turn a graph into a proof.

```js
import { layoutDiagram, diagramSvg } from '@lesson-library/diagrams';
export async function buildScene(root, context) {
  const layout = await layoutDiagram({
    nodes: [
      {id:'condition',label:'Smoke detected',role:'condition'},
      {id:'outcome',label:'Alarm sounds',role:'outcome'},
    ],
    edges: [{id:'rule',from:'condition',to:'outcome',
      type:'sufficient',label:'activates'}],
  });
  const beat = context.beats.find(b => b.id === 'forward');
  return { update(t) {
    const p = Math.max(0,Math.min(1,(t-beat.start)/1.2));
    root.innerHTML = diagramSvg(layout, {
      edgeProgress:{rule:p}, activeEdges:['rule'], title:'An authored rule',
    });
  }};
}
```

Await layout once inside `buildScene`, then derive every reveal from the requested
time and measured beat boundaries. ELK's bundled in-process layout runs locally;
no worker URL or network service is needed. Do not recompute layout each frame,
use CSS auto-animation, or change meaning merely to improve the drawing.

`layoutDiagram({nodes,edges},options)` accepts 1–80 nodes and at most 160 edges.
IDs must be nonempty, unique across nodes and edges, and stable across lesson
states. Nodes have `id`, `label`, optional `role`, `width`, and `height`. Use
explicit newlines (at most six lines) where a label should wrap. Roles appear
above their node labels. Edges have `id`, `from`, `to`, optional `type` (default
`relation`) and a one-line `label` (defaults to type). Use concise labels or explain
longer claims beside the diagram. The helper preserves relationship types as SVG
metadata; it does not assign them logical meaning.

Options: `direction` is RIGHT/LEFT/DOWN/UP, `fontSize` is 12–40 (default20),
`nodeSpacing` and `layerSpacing` are 16–400 (defaults44/64). Font is system sans.
Labels determine minimum node dimensions; undersized explicit boxes fail. In a
browser, layout awaits fonts and uses Canvas's actual system-font measurement.
In Node, the default width estimate is approximate; use
`measureText(text,fontSize) => widthInPixels` for a reviewed custom measurement,
or calculate the final layout in the capture browser. Inspect actual font/layout
results; cross-machine font metrics can differ. Labels are not automatically
wrapped or shortened. Very dense graphs may still need a different decomposition.

The returned serializable layout contains `width`, `height`, `fontSize`, node
boxes/label lines and edge `routes`/`labelBox` coordinates. Routes come from ELK's
layered orthogonal routing. Cycles, self-loops and parallel edges are allowed;
ELK's internal cycle handling never means a semantic edge was reversed. This
adapter is a flat directed graph, without compound nodes, explicit ports or
hyperedges. A decision node is a role you assign, not a special truth evaluator.
Supply and review branch labels (for example yes/no) yourself.

`diagramSvg(layout,options)` returns one self-contained SVG with escaped text,
`data-node`, `data-edge`, `data-role` and `data-type` attributes. Options include
`nodeProgress`/`edgeProgress` maps (values0–1; missing IDs default1),
`activeNodes`/`activeEdges` arrays, `title`, `color`, `activeColor` and `background`.
Unknown IDs and invalid progress fail. Nodes fade; relationship strokes reveal
along their native routes. Arrowheads and relationship labels appear only when
the route is complete, so partial reveals do not leave an arrowhead at an unreached
node. Highlights and reveals never alter geometry. Use a correctly sized container
and preserve orientation/givens as the explanation changes.

For comparisons use `layoutComparison(beforeGraph,afterGraph,options)`. It lays
out the union once and returns `{before,after,changes}`. Both layouts share the
same dimensions and positions for every common node and edge. Changed labels and
roles reserve enough space for both states, using the same measurer. Render each
state with `diagramSvg`; do not swap raw label strings into an already sized SVG.
`changes` lists added, removed and label/role/type-changed IDs, not semantic truth
or validity. An edge ID cannot change endpoints; give a rewired relationship a
new ID. The union has the same node/edge count limits as a single diagram.

For an argument, distinguish givens, intermediate claims and the conclusion. For
a relation map, name what each arrow asserts. For a branching decision, preserve
the condition and label alternatives at the split. Motion should reveal the
relationship being explained; avoid making a diagram's mere placement imply
proof, chronology or causal direction. State model assumptions and supply actual
reasoning or counterexamples. No fixed lesson sequence is required.

API sources: [ELK.js](https://github.com/kieler/elkjs),
[ELK JSON graph format](https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/jsonformat.html),
[ELK layered layout](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html).
ELK.js carries Eclipse Public License2.0 notices and its stated secondary-license
option. Preserve upstream notices when distributing the package or generated
runtime bundles; the dependency is not MIT licensed.
