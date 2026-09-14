# Physics drawings and linked motion

Import helpers from `@lesson-library/physics` in authored browser scenes. These
are composable SVG fragments, screen-space anchors and explicit analytic models;
they do not prescribe chapters or solve an arbitrary mechanics problem.

## Models and coordinates

`harmonicOscillator({mass, stiffness, position, velocity})` returns `omega`,
`period` and `at(t)`: `{t,x,v,a,force,kinetic,potential}`. It models one ideal
undamped mass on a linear spring about equilibrium, with SI inputs and no
external forcing. `position` and `velocity` specify the initial state. Numerical
results do not select the right physical model for the problem.

`constantAcceleration({position:[x,y], velocity:[vx,vy], acceleration:[ax,ay]})`
returns `at(t)` with position, velocity and acceleration arrays. It is free motion
only: the author must determine and stop at contacts or switch to another model.
Nonrepresentable derived frequencies, states and graph spans fail explicitly.
Both models accept finite physical times, including negative times as mathematical
continuations. Keep the lesson inside its stated physical domain.

`cartesianFrame({origin:[screenX,screenY],scale})` maps physical coordinates to SVG
pixels with `point([x,y])` and `vector([vx,vy])`. Positive physical y points up.
Drawing helper coordinates are screen pixels, with positive y down. Keep one
physical time for all views; narration time may pause or replay it explicitly.

## Drawing helpers

- `body({center,size,angle,shape,fill,stroke})` draws a block or disk and returns
  `{svg,anchors,bounds}`. `angle` is clockwise in screen-space radians. Anchors
  `center,left,right,top,bottom` follow rotation; bounds enclose the rotated body.
- `spring({from,to,coils,amplitude,stroke})` connects exact screen-space endpoints.
  It returns `svg` and `anchors.from/to`. Its appearance does not calculate force.
- `pulley({center,radius})` returns circle artwork and cardinal anchors. It does
  not model rope contact, rotation, tension or a pulley system.
- `ramp({from,to,depth})` returns a wedge and endpoint anchors. `rope({points})`
  draws an authored polyline. These helpers do not solve geometry constraints.
- `vectorArrow({from,vector,scale,color})` returns `svg,from,to`; zero vectors
  produce no arrow. Draw a physically scaled vector or label schematic scaling.
- `angleMarker({center,radius,start,end})` draws a screen-space angular arc.

## Graphs and labels

`sampleState(model,{start,end,samples})` samples the same `model.at(t)` used by the
diagram. `linkedGraph({states,x,y,box,xDomain,yDomain,cursor,xLabel,yLabel,color})`
returns `svg`, a coordinate-mapping `point([x,y])`, and the cursor screen position.
`x/y` are state property names or functions. Domains are explicit and must contain
all samples and the cursor. Labels should name quantities and units. Supply an
appropriate trace segment when showing the entire future curve would reveal an
answer early. The author composes multiple graphs and tick labels as needed.

`placeLabels(labels,{bounds,obstacles,gap})` takes stable label IDs, anchors and
**measured** widths/heights (for example from SVG `getBBox()`). It tries nearby
positions in a deterministic order and returns `placements` and `unplaced` IDs.
Optional per-label `offsets` specify preferred top-left displacements from the
anchor. Draw labels using the returned rectangles; handle every unplaced ID by
recomposing or hiding a nonessential annotation. This bounded greedy placement is
not a global layout solver and does not guarantee temporal stability. Preserve
preferred positions through motion where useful, and inspect moving frames.

An agent may combine these tools freely with SVG, Three.js or other helpers. A
spring lesson is one use, not a required template for physics explanations.
