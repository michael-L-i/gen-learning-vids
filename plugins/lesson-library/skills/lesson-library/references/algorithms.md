# Algorithm traces and stable visual identity

Import from `@lesson-library/algorithms` in authored browser scenes. This module
provides a bounded breadth-first-search (BFS) trace, explicit graph geometry, and
queue layouts/transitions. It executes its own deterministic implementation over
validated data; it does not evaluate supplied code or prescribe a lesson sequence.
Use actual snapshot state for labels, queue contents and highlights. Explain the
problem, input order and meaning of distance before showing a trace.

## Graph and trace contract

```js
import {breadthFirstTrace, graphGeometry, queueTransition} from '@lesson-library/algorithms';
const graph = {
  nodes: [{id:'S',label:'Start'}, {id:'A'}, {id:'B'}],
  edges: [{id:'SA',from:'S',to:'A'}, {id:'SB',from:'S',to:'B'}],
  directed: false,
};
const trace = breadthFirstTrace(graph,{start:'S'});
const geometry = graphGeometry(graph,{positions:[
  {id:'S',x:150,y:250},{id:'A',x:400,y:150},{id:'B',x:400,y:350},
],radius:28});
// Choose events from trace.steps to match the reasoning and measured beats.
const discoveredA = trace.steps.find(s=>s.type==='discover' && s.node==='A');
```

`graphModel({nodes,edges,directed=false})` copies and deeply freezes graph data.
Node IDs and edge IDs are nonempty strings, unique in their respective sets.
Labels default to IDs; they are plain text, not trusted markup. Use `textContent`
or escape labels when rendering SVG. Edge endpoints must exist. A `weight` field
is rejected: BFS finds fewest-edge paths, not arbitrary weighted shortest paths.
Input edge order is the neighbor tie-break, so equal-length parent paths depend
on it. Directed graphs follow `from → to`; undirected graphs examine both ways.
Self-loops and parallel edges are supported by the search.

`breadthFirstTrace(graph,{start,maxSteps=10000})` returns a deeply frozen
`{algorithm:'breadth-first',graph,start,steps}`. Each complete snapshot has:

- `id` (`step-N`), `index`, and `type`.
- `active`: the node currently being expanded, or null.
- `edge`: the examined edge ID for examine/discover/skip, otherwise null.
- `node`: affected node ID when relevant; absent for initial/complete.
- `queue`: stable node IDs in first-in-first-out order, with the head first.
- `nodes`: `{id,status,distance,parent,parentEdge}` for every node.

Statuses are `unseen`, `queued`, `active`, `done`. Unseen distances and parents
are null; start has distance zero and null parent. Events proceed through
`initial`, `discover` (enqueue), `dequeue`, `examine`, `discover` or `skip`,
`finish`, and `complete`. Discovery happens **at enqueue time**, preventing a
second incoming edge from creating a duplicate queue entry. After a `finish`
snapshot, the active node is marked done; the next dequeue updates active.
The final active value is null. Disconnected nodes remain unseen.

The trace is eager and stores full snapshots for predictable seeking, not a
production graph-processing engine. Limits: 1000 nodes, 10000 edges, maxSteps
1–100000, and a hard budget of 250000 node records across snapshots. Exceeding a
limit throws; no partial trace is returned. Snapshot storage/copying costs
O(V × number of events), beyond ordinary BFS's O(V+E) adjacency traversal.
Do not imply that this illustrative trace implementation is a benchmark.

`traceAt(trace,time,{secondsPerStep=1})` offers uniform random-access playback,
clamping before/after the trace. Time must be finite and step duration positive. Quotients within
`4 * Number.EPSILON * max(1, abs(time/secondsPerStep))` of an integer
are treated as that boundary to absorb division roundoff.
For narration, prefer event selection tied to `context.beats` over uniform pacing:
one meaningful state change may need much more explanation than another.
`discoveredPath(snapshot,target)` follows parent IDs back to the start, returning
a node-ID list or null for an unseen target. It detects missing or cyclic parent
chains in supplied snapshots; traces produced by the engine already satisfy this.

## Composition helpers

`graphGeometry(graph,{positions:[{id,x,y}],radius=24})` returns frozen
`{nodes,edges}`. Nodes retain labels and IDs with `x,y,radius`. Edges retain IDs
and endpoints with trimmed `[x,y]` `start`/`end`, SVG `path`, and `directed`.
Positions must match node IDs exactly. Coordinates and radius use SVG pixels.
The helper does not draw arrowheads; add them when `directed` is true.
Straight-edge drawing rejects self-loops and circles with overlapping edge
endpoints; author curved paths for those graphs. Parallel edges share a segment.
Search can still operate on graphs that need a richer author-supplied layout.

`queueLayout(ids,{x=0,y=0,width=72,height=44,gap=12})` returns stable-ID rectangles
`{id,index,x,y,width,height}`. IDs must be unique, dimensions positive, gap
nonnegative. Head is leftmost. `queueTransition(beforeIds,afterIds,{progress,...layout})`
returns the union of IDs with interpolated positions, `opacity`, and `phase`
(`retained`, `entering`, `leaving`). Progress must be within [0,1]. Retained items
move to their new cell; entering/leaving items fade at their final/initial cell.
Render all union items, retaining their IDs. At the endpoints, visible geometry
matches the respective queue exactly. Label this as a visualization transition;
queue state changes are discrete algorithm events, not elapsed computation time.

Do not silently interpolate distances, parent pointers or visited status: those
are discrete state. If queue cells move between snapshots, decide explicitly
when the logical state and labels switch. Keep processing holds and questions
separate from automatic playback. Verify intermediate moving frames for overlap
and ensure narration never refers to an unshown enqueue or skipped edge.

Reference: [MIT 6.006, breadth-first search](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/resources/lecture-9-breadth-first-search/).
