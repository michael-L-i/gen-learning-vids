# Browser animation

Use `learnvid render-browser DIRECTORY` for freely authored SVG/DOM 2D, Three.js
spatial scenes, or combinations. This executes trusted local scene code through
the CLI. It does not turn the web UI's JSON planner into a code execution tool.
The resulting lesson appears in the app with chapters, transcript and Q&A.

Runtime learner data and authored scenes belong outside the public repo. Read
`learnvid profile` and use the conversation's learner evidence. Never infer
mastery from an existing note or video.

## Authoring contract

The directory contains `lesson.json` and `scene.js`. The manifest has title,
summary, learningObjective, assumedKnowledge (array), tags (array), sources
(array of {title,url}), check {question,answer}, and scenes (array of
{title,narration,seconds}). `seconds` is a minimum, not a narration estimate.
Optional `brief` preserves relevant learner context. Optional `files` lists
relative nested assets, modules and fonts. Top-level JS/MJS/JSON/CSS/SVG files
are copied automatically; undeclared nested files will not be available.

```js
import * as THREE from 'three';
import {createTimeline} from 'animejs';
export async function buildScene(root, context) {
  // Build the scene once, return a deterministic time-addressable update.
  // context: index, title, narration, duration, cues, width=1280, height=720,
  // fps=30, sourceUrl (copied assets), rdkitUrl (managed WASM runtime).
  return { update(seconds) { /* render precisely this time */ } };
}
```

The host synthesizes narration first and supplies real durations. Make motion
follow explanatory stages within those durations. Anime.js timelines should use
`autoplay:false` and `timeline.seek(seconds * 1000)`. Three.js scenes should call
`renderer.render(scene,camera)` inside update. Do not use requestAnimationFrame,
wall-clock timers, CSS auto-animation or unseeded random state for recorded motion.
Use a new scene per chapter. Await asset loads inside buildScene; declare fonts
and await their loading before returning. Only local source/runtime requests are
allowed during capture; acquire referenced public assets before rendering.

For precise explanatory stages, scenes may include `beats`, an array of
`{id, narration, pauseAfter}`. IDs are unique within the chapter; `pauseAfter`
defaults to 0.4 seconds (0–10). Chapter narration must equal the beat narrations
joined with spaces. The shared host speaks each beat separately and supplies
measured `{id,start,duration,spoken,narration}` in `context.beats`. Starts are
chapter-relative. Use these boundaries for reveals and intentional holds.
Captions follow measured beats, with word positions still estimated within each
beat. Legacy scenes without beats retain their existing timing behavior.

For chemical diagrams:
```js
const rdkit = await window.initRDKitModule({
  locateFile: name => context.rdkitUrl + name,
});
const mol = rdkit.get_mol('CC(=O)O');
const svg = mol.get_svg();
mol.delete();
```
Use verified structures and correct protonation conventions. RDKit's browser
build is a subset of Python RDKit, not a general reaction simulator.

For chemistry tasks, import `moleculeDiagram`, `chemicalChanges`,
`chemicalAnchor`, and `electronArrow` from `@lesson-library/chemistry`. Supply
reviewed SMILES/MOL structures plus unique atom IDs in input order. Returned
SVGs and atom anchors share coordinates; preserve those IDs across reaction
steps. Arrows may target atoms, existing bonds, or a `formingBond` between
unbonded atoms. Use `electrons:1` only for a single-electron fishhook.
See the repository's `docs/chemistry-animation.md` for the full helper contract.
Check source diagrams and each intermediate; graph validation does not certify
chemical correctness. Use measured beats and review every chemical change.

For additional composable tools, read only the reference relevant to the scene:

- [Spatial cutaways and exploded views](spatial.md).
- [Rapier rigid-body playback](rigid-body.md).
- [Physics helpers](physics.md).
- [Math helpers](math.md).
- [JSXGraph constructions and calculus](constructions.md).
- [Circuits helpers](circuits.md).
- [Waves helpers](waves.md).
- [Statistics helpers](statistics.md).
- [Algorithms helpers](algorithms.md).
- [Molecular structures with Mol* and MolViewSpec](molecular.md).

## Quality and performance

Prefer detailed vector artwork or data-derived structures when morphology
matters. SVG paths, gradients, masks and textures are available; boxes and ovals
are not the visual vocabulary limit. Prepare imported artwork into named layers
when individual parts need animation. Retain asset provenance and individual
licenses in sources/credits. Use a consistent illustration treatment per shot.

Three.js provides actual spatial rendering without Blender, but neither library
establishes physical correctness. Distinguish schematic models, measured models,
and calculated simulation. Keep DOM/SVG labels above the canvas for crisp text.
Check clipping, contrast, label collisions, pointer endpoints, camera angles and
whether motion actually explains the narration.
For a motion problem, drive positions and associated vectors from the same
physical model and time value. Distinguish simulation time from narration time;
make pauses and replays legible. Inspect intermediate moving frames as well as
beat boundaries, including collisions and other conditions that end the motion.

Optional `frameKey(seconds)` may return a JSON-serializable key. Identical keys
MUST mean identical complete pixels, including labels and camera. A cached frame
skips update; make updates independent of previous calls. Use reuse only for
intentional holds and truly repeating illustrative motion. Keys are scoped to a
single chapter/run; uncached motion is the default. The report records reused
and rendered frames separately. Reuse doesn't shorten narration or video.

The managed Chromium runtime downloads automatically on first browser render;
`learnvid setup-browser` can prepare it earlier. No Blender/Python is needed.
FFmpeg/FFprobe are still required by the shared encoder. Downloading Chromium
is not the same as having no binary dependencies. For redistribution, verify the
packaged runtime on each target platform; macOS is currently tested.

Inspect the PNG previews at five points in each chapter, plus the generated
`scene-N-beat-ID-start.png` and `scene-N-beat-ID-hold.png` images. The render
report lists their exact chapter-relative times. These capture the introduction
and processing hold for each beat; coarse chapter samples can miss a premature
answer or a label disappearing at a transition. Play the final MP4.
The shared pipeline validates dimensions, frame rate, audio and decode, but does
not certify scientific content or native browser label layout. Report actual
render time separately from authoring, TTS and first-use downloads.
