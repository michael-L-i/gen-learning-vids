# Local molecular structures with Mol* and MolViewSpec

Use `@lesson-library/molecular` for local experimental or computed molecular
coordinate files. This is a real Mol* canvas, loaded through MolViewSpec, with
explicit atom selections, representations, distances and manual camera control.
It neither simulates chemistry nor predicts folding, interactions or bond changes.
Choose it when the explanation depends on actual spatial structure; use the
separate RDKit helper for 2D structural formulas and reaction annotations.

```js
import {createMolecularViewer, molecularCameraBetween} from '@lesson-library/molecular';
const viewer = await createMolecularViewer(container, {
  url: new URL('assets/model.cif', context.sourceUrl).href,
  components: [
    {id:'protein', selector:'polymer', representation:'cartoon', color:'#90a4ae'},
    {id:'site', selector:{auth_asym_id:'A', auth_seq_id:25},
      representation:'ball_and_stick', color:'#d59a30'},
  ],
});
const wide = viewer.cameraFor('all');
const close = viewer.cameraFor({auth_asym_id:'A',auth_seq_id:25}, {radius:8});
return {update(seconds) {
  const p = /* derive a clamped [0,1] fraction from measured context.beats */ 0;
  viewer.render({camera:molecularCameraBetween(wide,close,p),
    visible:['protein','site'], highlight:null});
}};
```

Create a mounted container with explicit positive CSS dimensions and positioning.
Await viewer creation before returning `update`; the helper stops Mol*'s automatic
animation loop and draws synchronously on each `render` call. Capture needs no
remote runtime assets or stylesheet. Declare nested structure files in manifest
`files`. `createMolecularViewer` accepts only same-origin HTTP(S) URLs; acquire and
cite the structure before capture. `molecularSpec(options)` separately returns a
portable, validated-by-construction MolViewSpec tree (with a constant metadata
timestamp for reproducibility). The viewer owns one model: `format` is `mmcif`
(default), `bcif` or `pdb`; `modelIndex` is zero-based, default 0. It does not build
biological assemblies or crystal mates. Do not silently equate an asymmetric unit
with a biological assembly.

`components` has 1–40 unique named entries. Each has a `selector`, representation
(`cartoon`, `ball_and_stick`, `spacefill`, or `surface`), #RRGGBB `color`, `opacity`
in [0,1], and optional `sizeFactor` in (0,5]. Optional `colorLayers` applies up to
40 `{selector,color}` overrides in order, using actual MVS coloring selections.
A requested empty component fails; surface and spacefill geometry is a visual
representation, not a proof of binding or energetic favorability.

`molecularSelection` validates and copies a selector. Static selectors are `all`,
`polymer`, `protein`, `nucleic`, `water`, `ligand`, `ion`. Object fields combine
with AND; arrays of 1–100 selector objects combine with OR. Supported fields:
`label_asym_id`, `auth_asym_id`, `label_atom_id`, `auth_atom_id`, `label_comp_id`,
`auth_comp_id`, `type_symbol`, `pdbx_PDB_ins_code`; integer fields `label_seq_id`,
`auth_seq_id`, `beg_label_seq_id`, `end_label_seq_id`, `beg_auth_seq_id`,
`end_auth_seq_id`, `atom_id`. Ranges are inclusive. Author numbering (`auth_*`)
can differ from normalized `label_*` numbering. Unknown keys and empty selectors
fail rather than matching everything. Selectors are cached (200 distinct queries
per viewer); build reusable selections rather than inventing one per frame.

- `count(selector)` returns selected atom count; empty selections fail.
- `atom(selector)` requires exactly one atom and returns its Cartesian `position`
  in angstroms, `atomId`, model element index and unit ID. For alternate conformers,
  use the file's unique `atom_id`; ambiguous residue/atom selections fail.
- `distance(a,b)` requires two exact atom selections and returns `{angstroms,a,b}`,
  with endpoints derived from the loaded coordinates. This is Euclidean distance,
  not bond identification, an uncertainty estimate, or an interaction classifier.
- `cameraFor(selector,{direction,up,radius})` returns an independent orthographic
  camera snapshot around the selection's bounding sphere. Radius is in angstroms;
  default is a padded selection radius. Defaults look down −Z with +Y up.
- `molecularCameraBetween(a,b,p)` interpolates position, target, up and radii for
  p in [0,1]. Use snapshots from the same viewer/projection. Degenerate directions
  or parallel up vectors fail; choose an intermediate camera for a 180° turn.
- `render({camera,visible,highlight})` takes a complete camera, the full list of
  visible component IDs (default: all), and a selector to highlight or null
  (default). Every call resets visibility and highlighting, allowing arbitrary
  time seeks. Atom coordinates do not move. Do not run separate Mol* animations.
- `getCamera()` copies current camera state. `project([x,y,z])` returns `{x,y,depth}`
  in CSS pixels relative to the canvas's top-left, accounting for device pixel
  ratio. It does not resolve label collisions or test occlusion; inspect labels
  when using it for DOM/SVG measurement leaders. Depth uses Mol*'s projected value.
- `dispose()` releases viewer resources for independent interactive use; the
  lesson host closes each chapter's page, and does not call a scene cleanup hook.

For a lesson, state the molecule, structure ID, source and model type. Distinguish
sequence numbering from spatial separation. Label chosen atoms/residues and
measurement units, keep enough surrounding structure to orient the viewer, and
reveal a close-up when the narration calls for it. Use measured beat boundaries
and inspect camera motion, occlusion, source atom identity and projected pointers.
Keep downloaded structures, provenance and authored lessons outside the repository.

Primary API references: [MolViewSpec integration](https://molstar.org/mol-view-spec-docs/mvs-molstar-extension/integration/),
[selectors](https://molstar.org/mol-view-spec-docs/selectors/),
and [Mol* Canvas3D](https://github.com/molstar/molstar/blob/master/src/mol-canvas3d/canvas3d.ts).
