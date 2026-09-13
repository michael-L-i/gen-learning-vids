# Blender rendering

The optional Blender route runs freely authored 3D scenes through the same
narration, encoding, transcript, caption and catalog pipeline as Matplotlib.
It contains no subject-specific models or lesson templates.

Blender is an external dependency. Blender 4.5.3 LTS on macOS is tested; the 4.5
series is supported upstream through July 2027. The app does not install or update
Blender, change its saved preferences, or install extensions automatically. An
isolated background process starts with factory settings. MolecularNodes, PyVista
and other optional data tools are not required or bundled.

```sh
learnvid capability enable blender  # explicit opt-in; disabled by default
learnvid render-blender /absolute/path/to/authored-lesson
learnvid render-blender /absolute/path/to/authored-lesson --blender /path/to/blender
```

Resolution order: explicit `--blender`, `LEARNVID_BLENDER`, the standard macOS app
path if present, then `blender` on PATH. This is trusted local Python execution,
like the scientific route, and is not exposed as executable code in the HTTP API.
The normal UI planner does not automatically author Blender scenes yet. The
completed video appears in the same app library and supports normal Q&A.

## Scene contract

Use `lesson.json` with the shared `authoredManifest` in
`server/authored/render.js`. `scientificManifest` remains an alias for existing
callers. The manifest includes chapter narration and minimum durations. The host
synthesizes narration first, and supplies the actual chapter duration to
`scene.py`:

```python
def build_scene(index, context):
    # Create geometry, materials, lights and an active camera using bpy.
    # context: duration, width=1280, height=720, fps=30, source_dir,
    # title/narration and estimated caption cues.
    def update(seconds):
        # Set all time-dependent state from seconds, not prior calls.
        pass
    return update
```

The author chooses the render engine, materials, cameras and composition. The
host fixes dimensions, frame rate and PNG output, produces previews and a render
report, encodes frames, and validates the resulting MP4. Blender errors return a
failed lesson, not a ready result. Render logs and exact source files remain in
the private lesson's `blender` folder. Python/JSON files in the source directory
are copied automatically; list other relative file paths in manifest `files`
for fonts, GLTF/GLB models, textures or data. Those files must resolve inside the
source folder. Record their provenance and license in source metadata. Inputs
are hashed before execution. Native project assets are not fetched automatically.

## Reusing identical frames

For still holds or exactly periodic motion, an author may opt in to reuse:

```python
def build_scene(index, context):
    def key(seconds):
        return round(seconds * context['fps']) % 120  # four-second loop
    def update(seconds):
        phase = key(seconds) / context['fps']
        # Every visual property, including labels and camera, uses this phase.
    return {'update': update, 'frame_key': key}
```

A repeated key MUST mean an identical complete visual state. The host does not
infer this, and it cannot prove the author's cache key is correct. Stateful
simulations should be baked or use the default uncached route. Keys are scoped to
one chapter and one invocation; nothing is reused across changed source or
narration. The encoder still emits every frame at 30 fps; reuse does not change
chapter length, narration or captions. Reports count rendered and reused frames.

Reusing a shot does not automatically make it instructionally appropriate.
Hold completed diagrams when viewers need time to understand them. Use repeatable
motion only for genuinely repeating illustrative processes. Do not loop an event
that should happen once or substitute an animation loop for physical dynamics.

## Validation and limits

```sh
LEARNVID_BLENDER=/path/to/blender npm run check
```

The integration test renders a real two-chapter 3D MP4, verifies exact frame
counts and durations, checks cached motion, retains an explicitly supplied model
file, and checks shared audio/transcript publication. Existing scientific-route
tests continue to use `LEARNVID_SCIENTIFIC_PYTHON`.

3D label layout and scientific correctness still need visual review. Font
coverage, camera clipping, occlusion, material readability and the accuracy of
imported structures are author responsibilities. Physics simulation is separate
from attractive rendering. Captions retain estimated timing inside narration
intervals; this route does not provide forced word alignment.

References: [Blender LTS](https://www.blender.org/releases/4-5/),
[rendering](https://www.blender.org/features/rendering/),
[MolecularNodes](https://extensions.blender.org/add-ons/molecularnodes/).
