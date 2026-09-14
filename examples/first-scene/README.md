# Render your first scene

This example teaches **why doubling a rectangle's width at fixed height doubles its area**. It exercises the real browser renderer, narration, measured beats, processing holds, and saved library output. It does not call a planning model or use private files, remote images, or the README's source video.

The two authored inputs are:

- [`lesson.json`](lesson.json): the objective, narration, beats, pauses, and comprehension check.
- [`scene.js`](scene.js): one SVG scene, with visual state derived from `update(seconds)`.

[`verify.mjs`](verify.mjs) checks the resulting media and timing; it is a contributor utility, not part of the lesson.

## Render

From the repository root, install Node.js 22.16+, FFmpeg/FFprobe, and the npm dependencies as described in [CONTRIBUTING.md](../../CONTRIBUTING.md). No Codex/Claude login, API key, Python, or Blender is needed.

```sh
npm ci
npx playwright install chromium
export LEARNVID_EXAMPLE_LIBRARY="$(mktemp -d "${TMPDIR:-/tmp}/lesson-library-example.XXXXXX")"
node bin/learnvid.js render-browser examples/first-scene \
  --library "$LEARNVID_EXAMPLE_LIBRARY" \
  > "$LEARNVID_EXAMPLE_LIBRARY/render.json"
```

Keep these commands in the same terminal. The temporary library is separate from your personal library. The render command waits for completion; progress goes to the terminal, while the result JSON is saved to the chosen folder.

The fresh library uses Kokoro narration. Its first use downloads a model and voice assets, so allow internet access and extra time; no speech service key is required. Subsequent runs in the same folder reuse that cache. Linux browser capture may additionally require `npx playwright install --with-deps chromium`. macOS is the tested development platform.

## Verify the result

```sh
node examples/first-scene/verify.mjs "$LEARNVID_EXAMPLE_LIBRARY"
```

The verifier reads `render.json`, finds the saved lesson, and checks:

- Ready status and the expected example narration.
- A decodable H.264/AAC MP4 at 1280×720 and 30 fps.
- Duration matching the lesson timeline, contiguous measured beats, and processing holds.
- Exact transcript/caption text, with caption cues confined to spoken intervals.
- The saved authored scene source.

It prints the MP4 path and preview directory. Duration depends on the installed voice and settings; expect a short lesson of roughly half a minute, not a byte-identical video across machines. A timing check cannot prove visual clarity or intelligible speech. Watch and listen to the result as well.

To open this isolated library in the app:

```sh
node bin/learnvid.js serve --open --port 4324 --library "$LEARNVID_EXAMPLE_LIBRARY"
```

Use another free port if 4324 is occupied. Stop the server with Ctrl+C when finished. The generated MP4, speech, transcript, source snapshot, previews, and model cache stay in the temporary library, outside Git. Keep that folder if you want the output; deleting it removes the sample and its cache.

## What you should see

The first view labels a **3 cm × 2 cm** rectangle with area **6 cm²**. During the next beat, its width grows to **6 cm** while height stays **2 cm**. The original dark strip remains visible; the lighter added strip is the same size. The ending holds both strips and the total area **12 cm²**.

Watch for labels that stay readable, a fixed height, the added strip appearing as the explanation changes, and a pause after the comparison. The animation is schematic; its on-screen timing is chosen for the explanation, not a physical growth model.

## Make one small change

Try changing a `pauseAfter` value in `lesson.json`, then render again into the same example library and rerun the verifier. Each render creates a new lesson; `render.json` points to the most recent result. Notice how the hold changes without retiming `scene.js` manually.

If you change spoken text, update the scene's `narration` to exactly match the beat narrations joined by spaces. If you change dimensions, update both the script and the visual calculation. Run `npm run check` after functional edits.

Next, read the [browser authoring contract](../../plugins/lesson-library/skills/lesson-library/references/browser-animation.md) and choose a tool from the [module catalog](../../README.md#visual-tools). The agent uses those same references. This example is intentionally small; it is not a required lesson layout or sequence.
