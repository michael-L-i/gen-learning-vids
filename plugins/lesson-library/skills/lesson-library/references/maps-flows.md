# Geographic timelines and quantitative flows

Import `geographicMap`, `utcTimeline`, and `flowLayout` from
`@lesson-library/maps-flows`. These optional tools use real D3 geography, UTC
scales/calendar intervals, and d3-sankey. Compose the returned SVG geometry and
labels with a scene's own layout. They do not fetch maps, infer historical facts,
simulate transport, or enforce a conservation law.

## Geography

```js
const map = geographicMap({
  features: geojson.features, // every Feature needs a unique string id
  bounds: [-8, 48, 13, 58], // west, south, east, north; degrees
  width: 560, height: 400, padding: 16,
});
// map.paths: [{id, label, path}], ready for SVG <path d=...>.
const anchor = map.point([4.48, 51.92]); // [x,y], or null outside bounds
const connector = map.route({id:'connection', from:[4.48,51.92],
  to:[9.99,53.55], progress:0.5});
// connector.path, revealedPath, point, angularDistance (radians)
```

Coordinates are longitude then latitude, in degrees. Output is in the supplied
SVG viewBox's units, independent of device pixel ratio. The Mercator view fits
and clips to the given geographic rectangle. Bounds cannot cross the
antimeridian and latitude bounds must lie within ±85°. Features can extend
outside the bounds; geometry is clipped and exterior anchors return null.
Paths use D3's spherical polygon convention: exterior rings smaller than a
hemisphere must be clockwise, holes counterclockwise. RFC 7946's convention is
the opposite; normalize downloaded rings before use and preserve provenance.
Closed rings and finite coordinates are checked; topological validity and
winding correctness remain author responsibilities.

`route` samples a shortest spherical great-circle connector (128 steps by
default, configurable 2–4096). Progress clamps to [0,1]. Antipodal endpoints
are rejected because the shortest route is not unique. A connector may cross
land: label it schematic unless actual navigable route data is supplied. This
API does not calculate travel time or ellipsoidal survey distances.

## Calendar time

```js
const calendar = utcTimeline({domain:['2024-01-01','2024-03-01'],
  duration:10, range:[0,600]});
const date = calendar.at(5); // timestamp, iso, progress, x
const ticks = calendar.ticks({unit:'month', every:1});
```

`duration` is narration seconds; the domain is calendar time. Dates accept valid
Date objects, epoch milliseconds, or UTC ISO strings (`YYYY-MM-DD`, or full
seconds with optional three-digit milliseconds and `Z`). The mapping clamps at
both endpoints. `atTime(date)` returns the same state for calendar input. Ticks
use UTC day/month/year boundaries, not assumed 30-day months. More than 2,000
requested ticks are rejected. Explain any interpolation between dated records;
a smooth transition is not evidence of observations between them.

## Amounts and stable relationships

```js
const graph = {unit:'tonnes/month',
  nodes:[{id:'origin'},{id:'a',label:'Destination A'}],
  links:[{id:'origin-a',source:'origin',target:'a',value:80}]};
const flow = flowLayout(graph, {width:500,height:350,pixelsPerUnit:3});
// flow.nodes: id,label,x0,x1,y0,y1,value,incoming,outgoing,balance
// flow.links: id,source,target,value,width,y0,y1,path
```

Each link has a unique ID and nonnegative finite amount. Nodes have unique IDs;
endpoints must exist and the directed graph must be acyclic. At least one link
must be positive; zero links preserve identities with zero width. All amounts
share `unit` (an optional per-link unit must match). Input is copied. Input order
sets node/link order within layers; preserve IDs and array order between states.
Defaults: nodeWidth 20, nodePadding 20, iterations 16. The bounded helper accepts
2–200 nodes, 1–1000 links, and 0–64 relaxation iterations.

Use the **same `pixelsPerUnit`** across dates or scenarios when comparing widths.
The helper uses D3's topology and horizontal layout, then centers each column
with the requested node/link heights and updates link anchors using D3. If that
scale cannot fit, it throws instead of silently shrinking it. Without this
option D3 fits the amounts independently to the viewport; the returned
`pixelsPerUnit` reports that normalization. Independently fitted diagrams do not
support absolute cross-date width comparisons. Keep an amount/unit label visible.

A node's displayed `value` is max(incoming,outgoing). `balance` is outgoing minus
incoming: sources are positive, sinks negative, and an intermediate imbalance
is explicitly reported. The layout does not explain that imbalance or certify
conservation. Label storage, losses, units, and accounting boundaries yourself.

Derive the calendar, labels, map connectors and flow amounts from one
scene-owned state in `update(seconds)`. Calls are independent of previous calls;
no playback loop is started. Test A→B→A states, including text and units.

Primary API references: [D3 geography](https://d3js.org/d3-geo),
[UTC scales](https://d3js.org/d3-scale/time),
[D3 Sankey](https://github.com/d3/d3-sankey).
