# Working on Lesson Library

Keep the UI and CLI on the same engine and storage contracts. Keep runtime learner data outside this repository. Do not commit real notes, agent credentials, transcripts, or generated user videos.

Use incremental commits. Run `npm run check` after functional changes. For changes to the generation pipeline, verify an actual rendered MP4 with FFprobe and verify transcript timing. Provider integration tests requiring a signed-in CLI are opt-in, not CI requirements.

User-facing copy should explain learning tasks, progress, and actionable errors. Avoid technical setup details in the ordinary library and player screens; put them in Settings. Never infer mastery just from a note existing or a video being watched.

Use compact, functional UI copy. Avoid slogans, motivational taglines, decorative introductory sections, and marketing-style empty states. Prefer direct labels, system sans-serif typography, neutral surfaces, and space devoted to content and controls.
