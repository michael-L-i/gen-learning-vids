# Engine architecture

[README](../README.md) · [Contributing](../CONTRIBUTING.md) · [Runnable example](../examples/first-scene/README.md)

The browser UI, Electron shell, and CLI share a local library and Node engine. The companion skill gives a calling coding agent the instructions to author a lesson using its conversation context.

## Two authoring paths, shared output

```text
Browser / Electron → local HTTP API → engine worker
                                         │
                               provider draft + revision
                                         │
                               validated lesson JSON
                                         │
                               structured/SVG renderer ─────┐
                                                           │
Coding agent → capability catalog + module guides           │
      │                                                    │
      └→ lesson.json + scene.js → authored browser renderer ─┤
                                                           │
Optional trusted scene.py → Blender/scientific adapters ────┤
                                                           ↓
                                  narration, media encoding, local library
                                                           ↓
                                          player, transcript, chapters, Q&A
```

The coding agent selects tools and writes executable scene code. The ordinary app planner produces structured JSON; it does not currently generate browser JavaScript. A CLI caller can also supply a structured plan directly and skip provider planning. The routes share storage and timing conventions; they do not all use the same job entry point.

## Structured lesson lifecycle

1. `createLesson` validates the request and snapshots the learner profile, conversation brief, selected source excerpts, and settings. Sources are selected explicitly and bounded in length; this is not background retrieval from an entire vault.
2. The CLI/API starts a detached worker. `runJob` locks that lesson and records progress. It uses a supplied plan or calls the configured provider.
3. `generatePlan` makes one draft call and one targeted revision call using the shared teaching guidance. Edits apply to a clone; the complete revised plan must pass the schema and narration/visual checks. A failed review does not silently publish the draft.
4. The renderer synthesizes narration and renders structured visuals or scene-graph animation. Scenes with beats use measured speech intervals and processing holds. Legacy plans remain supported with approximate evenly spaced reveals.
5. FFmpeg encodes and joins the media. The engine saves the MP4, thumbnail, timed chapters, transcript, captions, citations, and ready/error status.

Plans survive a rendering failure. Retry uses the saved plan and current settings. Lesson locks prevent competing writers; independent lessons can run concurrently. Reads report interrupted workers without rewriting their metadata. Authored source-code lessons should be regenerated from their saved source using the matching render command; do not assume the generic UI retry reproduces every authored route.

## Authored browser lifecycle

The explicit `render-browser` CLI command accepts a trusted local folder containing `lesson.json` and `scene.js`. It calls `renderBrowser` → `renderAuthored` with a browser adapter.

1. Validate the manifest, copy declared source files, hash the inputs, prepare image assets, and record renderer/dependency versions. Files are copied into the private lesson directory before execution.
2. Synthesize each narration beat independently and measure it with FFprobe. Assemble a timeline containing speech durations and processing holds.
3. Bundle `scene.js` and selected module imports. Start a local asset server and a fresh Chromium page for each chapter.
4. Await `buildScene(root, context)`, including fonts, models, or layouts. Call its returned `update(seconds)` at explicit frame times, at 30 fps. State should depend on requested time rather than elapsed wall-clock time; this permits repeatable seeking and capture.
5. If supplied, call `exportAudio()` once and validate its PCM output for mixing with narration. Live browser sound is not captured automatically. Optional exact frame keys can reuse identical screenshots within a chapter.
6. Save chapter samples and previews at narration-beat/hold boundaries. Encode frames, validate chapter dimensions and timing, mix audio, join chapters, and publish through the shared authored pipeline.

The resulting MP4 is a recording. Tools such as JSXGraph, OpenSeadragon, and Mol* provide scene operations; their interactive controls are not automatically embedded in the final player.

The browser serves only local snapshot/runtime assets during capture and denies external requests. This is still a trusted-code authoring route, not a sandbox for arbitrary uploaded JavaScript. No HTTP endpoint accepts executable scene code. Optional Blender and scientific Python scenes likewise require explicit local invocation; Blender additionally requires per-library enablement.

## Where tools fit

`learnvid capabilities` reports available renderers and module guidance. Each helper has a focused implementation and a reference explaining its operations, assumptions, and limitations. The author reads relevant guides and composes tools; there is no fixed subject-to-renderer assignment.

For example, a mechanism lesson can combine Rapier simulation samples, Three.js cutaways, force arrows, and graphs driven by the same timeline. A protein lesson can combine a local structure, named selections, a camera transition, and measured atom labels.

Today, browser aliases, capability metadata, and dependency-version reporting are registered in separate files. When extending an existing helper, inspect its tests and reference. A new module also needs the appropriate registrations in `server/browser/host.js`, `server/capabilities.js`, and `server/browser/render.js`, plus its reference link. A single generated registry is a possible future improvement, not implemented behavior.

## Code boundaries

| Responsibility | Files |
|---|---|
| Local HTTP interface / CLI | `server/app.js`, `bin/learnvid.js` |
| Lesson creation, jobs, retries, saved Q&A | `server/engine.js` |
| Atomic storage, locks, settings, profile | `server/store.js` |
| Imports and context normalization | `server/imports.js` |
| Provider adapters, planner and tutor prompts | `server/providers.js` |
| Teaching metadata, revision validation, shared guidance | `server/teaching.js`, `plugins/lesson-library/skills/lesson-library/references/teaching.md` |
| Structured visual rendering and captions | `server/render.js`, `server/visuals.js` |
| Validated SVG scene graph and timed tracks | `server/animation/` |
| Shared authored manifests, source snapshots, narration, encoding, publication | `server/authored/` |
| Browser bundling, capture, optional PCM export | `server/browser/` |
| Capability discovery | `server/capabilities.js` |
| Subject tools | `server/chemistry/`, `server/physics/`, `server/molecular/`, and other module folders listed in the [README](../README.md#visual-tools) |
| Image retrieval, normalization, attribution | `server/assets.js`, `server/asset-schema.js` |
| Optional external renderers | `server/blender/`, `server/scientific/` |
| Speech synthesis and caching | `server/speech.js` |

## Teaching, timing, and review

The provider and companion skill share the same [teaching guidance](../plugins/lesson-library/skills/lesson-library/references/teaching.md). A lesson can retain a compact teaching plan: learner evidence, provisional prerequisites, uncertainties, focus, omissions, pacing, and symbol meanings. These fields are authoring metadata; they do not update the profile or draw labels automatically.

Knowledge level and pace are separate. An advanced question may justify using familiar vocabulary while explaining the difficult inference slowly. The guidance calls for a clear problem, consistent labels, and visual continuity; it does not prescribe a chapter count, numbered footer, or mandatory agenda.

`pauseAfter` adds processing time after speech. Captions stay within speech intervals, leaving holds empty. Word positions are estimated within each beat rather than force-aligned. For a precise reveal, author a beat boundary instead of guessing an individual word timestamp.

Provider planning has one built-in revision pass. For authored scenes, the calling author reviews the script and rendered evidence, then repairs concrete issues. The engine's schema/media checks and stored review notes are not proof of subject accuracy or learner understanding. Numeric models, source claims, labels, and encoded output need appropriate verification.

## Storage and provider boundaries

Everything uses `~/Lesson Library`, or the explicitly selected library root. Source snapshots, generated media, model caches, and learner data stay outside the repository. See [the library folder layout](using-the-library.md#your-library-folder).

The server binds to loopback and browser writes require same-origin requests with a per-instance token. It is a single-user local app. Selected context and questions go to the configured Codex/Claude provider; orchestration being local does not make model inference offline. Automatic account-memory access and background vault indexing are not implemented.

New libraries default to Kokoro speech. Its model loads lazily and is cached locally. Speech previews use the same speech engine. Tests inject audio fixtures so normal checks do not require model downloads or provider credentials. Existing libraries retain their saved speech settings.

Tutor answers use the saved lesson transcript, original context, playback time, and recent discussion. The currently selected provider answers; the conversation is saved with the lesson. Watching alone does not change the learner's mastery.

## Current extension priorities

The richer browser tools work through the coding-agent authoring route. Connecting that process to ordinary app creation is a separate future change. Other possible work includes a single module registry, a reviewable storyboard, forced-alignment captions, and broader desktop/platform validation. Contributor setup and verification commands are in [CONTRIBUTING.md](../CONTRIBUTING.md); these items are directions, not existing capabilities or release commitments.
