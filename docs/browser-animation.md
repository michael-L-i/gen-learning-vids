# Browser animation capabilities

The default authored browser route bundles Three.js, Anime.js and RDKit.js with
the app's npm dependencies. It supports 2D/3D composition without Blender or a
Python environment. A managed Chromium runtime downloads on first render; the
shared encoder still requires FFmpeg/FFprobe. This is a GitHub checkout workflow;
new browser dependencies have not yet been verified in distributed Electron DMGs.

```sh
learnvid capabilities
learnvid setup-browser  # optional pre-download
learnvid render-browser /path/to/authored-lesson
learnvid capability enable blender  # optional, requires separate Blender install
```

[Authoring contract and selection guidance](../plugins/lesson-library/skills/lesson-library/references/browser-animation.md)
are shared with the installed agent skill. Capability selection is performed by
the coding agent; the ordinary UI JSON planner remains unchanged. Capability
metadata is discoverable through the CLI, not a third-party plugin marketplace.
Blender enablement is stored per library and enforced by its renderer; installing
Blender alone does not opt in. Browser capabilities can be combined freely in a
chapter; no biology, physics or other topic template is built into the host.

The browser adapter uses the shared authored manifest, source snapshot, narration,
caption, encoding and publication pipeline. JavaScript is bundled from the copied
source and dependency versions are recorded in rendererInfo. Nested asset paths
must be declared in manifest files. The headless browser only serves the local
snapshot/runtime and denies external network requests. Source remains trusted
executable code; this is not a security sandbox for arbitrary uploads. No HTTP
endpoint accepts executable scene code.

Each chapter uses a fresh browser page and explicit update(seconds) calls at 30
fps. Optional exact frame keys reuse PNGs within that chapter. Reports and five
preview frames per chapter stay in the private lesson directory. Final MP4
validation and ready/error publication use the same rules as Blender/Matplotlib.

Validation: `LEARNVID_BROWSER_TEST=1 npm run check` exercises real SVG animation,
Anime.js seeking, RDKit WASM initialization and molecular SVG, Three.js rendering,
frame reuse, actual encoding, chapter timing and transcript publication. Install
the managed browser first on CI. Linux may also need Chromium system libraries.

Sources: [Three.js](https://threejs.org/manual/en/installation.html),
[Anime.js seek](https://animejs.com/documentation/timeline/timeline-methods/seek/),
[RDKit.js](https://rdkit.github.io/rdkit-js/).
