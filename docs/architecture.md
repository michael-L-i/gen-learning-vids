# Architecture

The app is the product; the plugin is an entry point. React, the CLI, and the Electron shell call the same Node engine and operate on the same library directory.

```text
Browser UI ─── local HTTP API ─┐
Electron ───── local HTTP API ─┼── engine ── library folder
Codex / Claude skill ── CLI ───┘      │
                                    ├── agent CLI → structured lesson / tutor response
                                    └── speech + SVG cards + FFmpeg → MP4 + transcript
```

## A lesson's lifecycle

1. Validate the request and snapshot the learner profile, conversation brief, selected source excerpts, and provider/speech settings.
2. Start a detached worker. The worker acquires the lesson's lock and writes progress after each stage.
3. Use a supplied lesson plan, or ask the configured agent for JSON matching the lesson schema. Validate the result before rendering.
4. Save the storyboard. Synthesize each scene, measure narration duration, draw its visual, and render a video segment. Concatenate the segments.
5. Save the MP4, transcript, captions, thumbnail, and timed chapters. Remove intermediate media.
6. Tutor questions use the saved transcript, original context, current playback time, and recent discussion. Q&A uses the currently selected agent; its history stays with the video.

Existing plans survive rendering failure. Retry captures current speech/provider settings and reuses the plan. A dead worker is shown as interrupted; stale locks expire after 30 seconds. Reads do not rewrite job metadata, avoiding races with a live worker. Each lesson has its own lock; independent lessons can run concurrently.

## Boundaries

- `server/store.js`: directory layout, atomic files, locks, configuration.
- `server/imports.js`: selective Markdown imports and chat-export normalization.
- `server/providers.js`: headless Codex/Claude adapters and instructional prompts.
- `server/render.js`: timed visual sequences, media encoding, transcripts and citations.
- `server/animation`: validated scene graph, narration-relative tracks and measured text layout.
- `server/biology`: optional diagram authoring helpers compiled to standard animation nodes, and biology planner guidance.
- `server/geography`: reusable D3 globe projection, country geometry, highlighting and camera support.
- `server/assets.js`: bounded image retrieval, local raster normalization and attribution.
- `server/scientific`: optional trusted-local mathematical scenes and shared publication workflow.
- `server/visuals.js`: equations, code, diagrams, and plots from validated content.
- `server/speech.js`: local neural/system/Piper narration, bounded text chunks, and model caching.
- `server/engine.js`: creation, jobs, retries, and saved Q&A.
- `server/app.js`: loopback HTTP interface used by both UI shells.
- `bin/learnvid.js`: structured terminal interface for people and agents.
- `plugins/lesson-library`: instructions for carrying the calling conversation into a lesson.

The provider interface accepts the full supplied lesson context, but the app caps profile and source excerpts to keep requests bounded. Sources are selected explicitly; similarity search is not part of this version. Imported text is marked as untrusted reference data in prompts. The app launches processes with argument arrays, not shell interpolation. Claude tools are disabled; Codex runs with a read-only sandbox and instructions not to use tools. These are practical local app boundaries, not a claim of complete isolation from every user-configured agent extension.

## Deliberate next steps

1. A short diagnostic conversation before generation, with user-confirmed updates to the learner profile.
2. Comprehension responses and explicit feedback as evidence for future lessons. Watching alone must never imply mastery.
3. Source search and opt-in note refresh with clear provenance and change previews.
4. A storyboard review/editor before rendering and richer topic-specific visual components.
5. Optional forced-alignment captions and narration-aware visual reveal timing.
6. Notarized desktop releases, tested Linux support, and installation without a source checkout.

Avoid making direct ChatGPT memory access a prerequisite: it is neither implemented nor needed for the shared-folder design. Conversation briefs and user-selected notes make useful personalization possible now.

## Neural narration

Kokoro loads lazily, so starting the UI does not download models or allocate an inference session. Its quantized ONNX model is cached inside the library. The six bundled voice presets are selected independently of legacy system voice names. Requests reuse a loaded model within a process and serialize inference against that session. Long narration is split before phonemization to avoid silent input truncation.

Voice previews are generated from unsaved settings, cached by configuration, and atomically published as WAV files. They share the same speech engine as video jobs. Tests inject a small audio fixture so CI verifies preview behavior without contacting a model service or downloading weights. A separate real local run verified cached generation with network requests disabled.
