# Chemistry animation

The authored browser capability includes reusable RDKit molecular SVGs, stable
atom anchors, graph-change reporting and electron-arrow geometry. Import them
from `@lesson-library/chemistry` in an authored `scene.js`. The browser bundler
resolves this module from the shared engine. No additional packages are needed.
These helpers are available to the calling agent; the ordinary UI JSON planner
does not yet author chemistry-specific scenes.

```js
import { moleculeDiagram, chemicalChanges, chemicalAnchor, electronArrow }
  from '@lesson-library/chemistry';

const rdkit = await window.initRDKitModule({
  locateFile: name => context.rdkitUrl + name,
});
const diagram = moleculeDiagram(rdkit, {
  structure: 'CC=O', // SMILES or a MOL block with reviewed 2D coordinates
  atomIds: ['methyl', 'carbonyl', 'oxygen'], // input order, never canonical order
  width: 600, height: 400,
  drawOptions: { fixedBondLength: 60 },
});
const flow = electronArrow(diagram, {
  from: { bond: ['carbonyl', 'oxygen'] },
  to: { atom: 'oxygen', offset: [20, 0] },
  bend: -35, progress: 1, electrons: 2,
});
```

`diagram.svg` contains RDKit artwork with a transparent background.
`diagram.anchors[id]` supplies atom centers in that SVG's coordinate system.
Compose overlays inside the same coordinate system, or transform both together.
Stable input IDs must persist across structures; converting to canonical SMILES
and reparsing can reorder atoms. Use reviewed MOL coordinates to preserve
orientation. Do not reflect a stereochemical drawing for convenience.

`chemicalAnchor` accepts `atom`, an existing `bond`, or a `formingBond` between
two distinct unbonded atoms. An optional `[dx,dy]` offset clears a label or locates
a specific lone pair. `electronArrow` draws an electron-pair arrow by default;
`electrons:1` selects a fishhook. Progress is seekable and independent of prior
frames. The author checks electron origins, destinations, arrow routing, and
which changes occur simultaneously.

`chemicalChanges(before, after)` reports added/removed atoms, formed/broken
bonds, bond-order changes and formal-charge changes, and rejects an ID changing
element/isotope. It is an accounting aid, not a reaction predictor or full mass,
charge, valence, stereoselectivity or mechanism certification. Include relevant
reagents/byproducts when checking complete conservation; substrate/product
schemes often omit them. Distinguish proton transfers, resonance contributors,
elementary steps and net transformations. Coordination compounds and unusual
valence require separate, source-grounded review.

## Teaching and validation

1. Match each structure's connectivity, charges and stereochemistry to a cited
   source. Check the actual diagram; PDF text extraction omits crucial bonds.
2. Explain the required bond change, the electron donor/acceptor, and why this
   step prepares the next one. Keep unchanged atoms consistently oriented.
3. Separate source products from explanatory intermediates and omitted species.
   Never infer a stereochemical outcome solely from a named reagent.
4. Use measured narration beats for mechanism stages. Hold diagrams long enough
   to inspect; do not morph through invalid structures.
5. Inspect every chemical state and arrow endpoint, plus the encoded MP4 and
   caption/beat timing. Invalid RDKit input is an actionable error, not a reason
   to fall back to an invented molecular picture.

`npm run check` exercises molecular stereochemistry, anchors, graph changes and
arrow geometry. `LEARNVID_BROWSER_TEST=1 npm run check` additionally exercises
the chemistry import and measured narration beats through real browser capture,
FFprobe validation, MP4 encoding and caption publication. Provider sign-in is
not needed. Private lesson source, source diagrams, reports and generated videos
stay outside this repository.

References: [RDKit.js](https://rdkit.github.io/rdkit-js/),
[RDKit drawing options](https://www.rdkit.org/docs/source/rdkit.Chem.Draw.rdMolDraw2D.html).
