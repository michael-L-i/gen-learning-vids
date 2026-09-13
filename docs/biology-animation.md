# Biology animation

Choose a visual scale per explanation. Microscopy and sourced molecular structures
provide evidence of real objects; compartment diagrams explain transport and
reaction pathways explain transformations. Do not imply that a schematic protein
shape is an experimentally determined structure.

`server/biology/diagrams.js` supplies two optional authoring helpers. Both return
`{nodes, anchors}`. Nodes use the normal animation contract, so existing group,
opacity, position and scale tracks apply without another renderer.

```js
const { nodes, anchors } = membraneNodes({
  id: "membrane", x: 80, y: 330, width: 1120, height: 80,
  columns: 28, fill: "#CCE2BC", stroke: "#367D59"
});
const chloroplast = chloroplastNodes({
  id: "chloroplast", x: 200, y: 210, width: 800, height: 360
});
```

The membrane has outward-facing head groups and inward tails. Chloroplasts show
a double envelope, schematic thylakoid stacks and connecting membranes. Helpers
add no labels, proteins, narration or biological simulation. Anchors are absolute
coordinates before any subsequent group transform; attached labels should use
local coordinates. IDs must be unique between helpers. Full scene validation
still applies to generated geometry and total node/track counts.

The normal UI planner and clip planner receive the same biology guidance. A
JSON-only planner composes the existing node types; a file-capable agent can use
the helpers directly. No runtime biology Python dependency is required.

For photosynthesis, preserve compartment orientation, distinguish electron and
proton motion, show carbon conservation, and separate net product from recycled
intermediates. Detailed protein structures can later use verified PDB data and a
molecular viewer, rather than enlarging these illustrative shapes. Biotite is
useful for structural data analysis; it is not a complete photosynthesis animation
system. Current output is a narrated schematic, not a quantitative biochemical
simulation.

References: [OpenStax photosynthesis](https://openstax.org/books/biology-2e/pages/8-1-overview-of-photosynthesis),
[Biotite](https://www.biotite-python.org/),
[RCSB Photosystem II](https://pdb101.rcsb.org/motm/59).
