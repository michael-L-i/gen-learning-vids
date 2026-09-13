# Scientific animation route

Use the SVG timeline for simple explanatory shapes. Use the optional Matplotlib route for numerical trajectories, multiple coordinate systems, linked plots, or equations whose layout needs mathematical typesetting. This is an explicit agent/CLI route today; the normal UI planner still produces the existing structured scenes. Automatic tool routing and Python authoring in the UI are not implemented.

An agent authors `lesson.json` and `scene.py` in a private working folder. The scene module can use Matplotlib, NumPy and SymPy freely. It is not restricted to predefined diagrams or subject templates. `build_scene(index, context)` returns a Matplotlib figure and a deterministic `update(seconds)` callback. Context includes the chapter's actual speech-adjusted `duration`, width 1280, height 720 and fps 30. Repeated or out-of-order calls to update must produce the same frame.

The host owns narration timing, frame encoding, preview images, sampled text bounds checks, transcripts, captions and publication to the normal Lesson Library catalog. Authored source, the manifest, source hash, timeline and validation reports are retained beside the lesson outside Git. Caption intervals use actual speech lengths; the final pause is not captioned. Render errors produce an error record rather than a ready video.

## Setup and invocation

```sh
uv venv --python 3.12 .local/scientific-venv
uv pip install --python .local/scientific-venv/bin/python -r server/scientific/requirements.txt
node bin/learnvid.js render-scientific /path/to/authored-lesson --python .local/scientific-venv/bin/python
```

The explicit command executes trusted local Python code with your normal local process permissions. This is not exposed as an executable-code field on the web API. The environment is optional and is not bundled into the desktop app. No global Python packages or account configuration are modified.

The manifest contract is `scientificManifest` in `server/scientific/render.js`: title, summary, learningObjective, assumedKnowledge, tags, sources (`title`, `url`), check (`question`, `answer`), and scenes (`title`, `narration`, minimum `seconds`). Put helpers in `.py` files alongside `scene.py`; those files are copied into the private lesson. Other asset formats are not supported by the source-copy step yet.

## Guidance for physics scenes

- Solve and verify the model before drawing. State assumptions, axes, units and initial conditions. Distinguish an exam's original question from added examples.
- Derive position, velocity, graph points and vector arrows from the same state function. Do not use aesthetic easing as a substitute for physical time. Clearly label slowed playback and any illustrative values.
- Prefer analytic motion where available. Use numerical integration only where needed, with a stated timestep and an error/conservation check.
- Use `kinematics.py` for constant-acceleration trajectories and ideal elastic bounces on a stationary smooth incline. The latter preserves the tangent component and reverses the normal component at impact; it is not a rolling, frictional or deformable-body simulation.
- Keep the diagram visible while introducing one equation at a time. Use Matplotlib data coordinates for physical geometry, and figure coordinates for narration-related labels. Use Mathtext for fractions, subscripts and derivations.
- Reserve title, plot labels and equation areas. Inspect previews plus the moving clip. Sampled text checks do not prove collision-free layout or scientific correctness.
- Let diagram composition and typography follow the lesson. Keep the quiet graph style when it communicates clearly; do not add panels solely to fill space.

## Verification

```sh
LEARNVID_SCIENTIFIC_PYTHON="$PWD/.local/scientific-venv/bin/python" npm run check
```

The integration test renders and decodes a real two-chapter MP4 and checks audio, timing, captions, catalog registration and source retention. Analytic tests check collision energy, periods, increasing spacings and scaling with release height. Benchmark cases and generated lesson-specific code stay in the local personal lab, not this engine branch.

References: [Matplotlib animation writers](https://matplotlib.org/stable/api/animation_api.html), [Mathtext](https://matplotlib.org/3.10.7/users/explain/text/mathtext.html).
