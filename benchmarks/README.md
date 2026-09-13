# Animation benchmarks

Eight public prompts cover physics, mathematics, biology, chemistry, computer science, engineering, history, and argument analysis. Each targets one teaching moment in approximately 12 seconds. These are probes, not comprehensive coverage of those fields.

Open **Benchmarks** in the app to generate clips, select two runs, inspect the prompt and artifacts, and save a timestamped review. Run labels, per-case status, scores, decisions, and comparisons persist locally. The default voice and local Codex/Claude provider come from Settings.

```sh
npm run benchmark -- cases
npm run benchmark -- run --mode reference --label "Reference baseline" --wait
npm run benchmark -- run --mode agent --case physics-kinematics --label "Physics prompt 01" --wait
npm run benchmark -- run --mode replay --from RUN_ID --label "Renderer revision" --wait
npm run benchmark -- list
```

Without `--wait`, generation continues in a detached worker. Both the CLI and UI use `server/benchmarks.js` and the same `renderLesson` renderer used for normal lessons. Benchmarks use explicit synthetic learner context, never the user's notes or profile.

## Three run types

- **Prompt generation:** the configured local agent creates a new animation storyboard from each saved prompt. The exact prompt and raw response are retained. This tests planning and rendering together.
- **Reference storyboard:** authored fixtures in `references/` are rendered directly. This isolates renderer behavior; these are not agent-generated results or quality targets.
- **Storyboard replay:** a prior run's saved storyboards and case definitions are rendered with the current engine and current speech settings. A case must have a saved valid storyboard to replay. For planning failures, start another prompt run.

`build-references.js` is the editable source of the authored fixtures. Run `node benchmarks/build-references.js` after editing it. Each case in `cases/` has a stable ID, version, prompt, learner context, style brief, variation key, duration target, and human review criteria. The variation key is included in the prompt; Codex/Claude CLI generation is **not guaranteed deterministic**. Bump a case version when its instructional task changes. Do not add private learner examples here.

## Saved artifacts

Outputs are stored outside Git in `~/Lesson Library/benchmarks/runs/<run-id>/` (or the selected library):

```text
run.json                   mode, engine hash, Git revision, settings, case snapshots, results
feedback.json              reviewer scores, notes, timestamp, decision and comparison
engine-source/             server sources and dependency manifests at worker start
cases/<case-id>/
  prompt.txt
  agent-response.txt       prompt mode only
  storyboard.json
  video.mp4
  thumbnail.png
  captions.vtt
  transcript.md
  timeline-0.json
  checks-0.json
  media.json
```

Runs do not overwrite earlier videos. A stopped worker is reported as interrupted. Individual case failures are recorded while remaining cases continue. The worker snapshots the installed engine at startup and retains the queued engine metadata separately. Source snapshots are provenance, not an executable sandbox; avoid editing the installation while a worker starts. Model defaults, platform fonts, speech runtime, and generation nondeterminism can also affect output. Pin an explicit model in Settings for stronger comparisons. Speech settings are recorded; replay currently regenerates narration, rather than reusing old audio.

## Animation contract

The first engine uses declarative SVG geometry rendered at 1280×720, 30 fps through Sharp and FFmpeg. It supports grouped rectangles, ellipses, paths and wrapped text; translation, rotation, scaling, opacity and path drawing; and linear, smooth, accelerating or decelerating interpolation. Parent groups keep related objects attached. Mathematical motion can be expressed directly (for example, quadratic position and linear velocity).

Narration is synthesized separately for each beat. A beat lasts at least its requested duration and extends to fit its speech, rounded up to a video frame. It is never cut short to hit a benchmark target. Captions use these actual boundaries. This is beat synchronization, not word-level forced alignment. Rendered clips may therefore exceed 12 seconds.

`server/animation/schema.js` owns the validated contract and provider guidance. `server/animation/render.js` prepares measured text and path geometry, evaluates frames, builds narration timing, and renders media. The normal lesson schema accepts `visual: "animation"` with the same content contract. Existing lesson formats remain supported. No generated JavaScript or arbitrary SVG markup is executed.

The path renderer uses [svg-path-properties](https://github.com/rveciana/svg-path-properties) to calculate actual geometry lengths because the SVG rasterizer does not honor normalized `pathLength` for stroke reveals.

## Reviewing and iterating

Review correctness, clarity, layout, motion/timing, and style separately (1 poor, 5 strong). Use **Keep** or **Revise**, timestamped notes, and a preferred clip when comparing runs. These scores are human assessments, not automated quality scores.

Automated checks validate references, hierarchy, track ranges and conflicts, measure text overflow, sample transformed text clipping, and verify actual audio/video streams and duration with FFprobe. They do not establish factual correctness, object collision avoidance, anatomical accuracy, or instructional usefulness. The viewer keeps these limits visible.

Improve a reusable capability, rerun affected cases, then run the full set. Keep some new prompts outside the suite to check generalization. Planned capabilities include imported illustrations, richer scientific plots, solver-backed state, stronger layout checks, and scene-level revision from feedback. None is implied by a passing baseline today.

## History fixture sources

The chronology uses the [Mainz Gutenberg timeline](https://www.mainz.de/en/microsite/gutenberg/zeit/zeitleiste_gutenberg), the [Library of Congress Gutenberg Bible collection](https://www.loc.gov/exhibits/bibles/the-gutenberg-bible.html), and the [Bibliothèque nationale de France account of printing's arrival in Paris](https://gallica.bnf.fr/selections/fr/html/livres/naissance-de-limprimerie-caracteres-mobiles). It is explicitly scoped to European movable-type printing. Other examples are elementary mathematical constructions or explicitly simplified/hypothetical models.
