# Working on Lesson Library

These conventions apply to human and agent-assisted contributions. Setup, checks, and PR expectations are in [CONTRIBUTING.md](CONTRIBUTING.md); the engine design is in [docs/architecture.md](docs/architecture.md).

## What this is

A local, single-user app that turns a topic plus selected notes into a narrated video lesson. A browser UI, an Electron shell, and the `learnvid` CLI share one Node engine and one library folder. Lesson planning calls a signed-in Codex or Claude CLI; narration, rendering, and encoding run locally. There is no hosted service and no account.

Non-negotiable boundaries:

- The UI and CLI use the same engine and storage contracts. Do not add a code path that only one client can reach.
- Runtime learner data lives in the library folder, never in this repository. Do not commit real notes, agent credentials, transcripts, generated videos, or model caches.
- The HTTP server binds to loopback, checks host and origin, and requires a per-instance token for writes. No HTTP endpoint accepts executable scene code. Executable `scene.js` and `scene.py` run only through explicit trusted-local CLI routes.
- Never infer mastery from a note existing or a video being watched.

## Branches and commits

- `main` is the only long-lived branch and the integration target for every PR.
- Branch from `main` for each change and use a short prefix that says what kind of change it is: `feat/`, `fix/`, `refactor/`, `docs/`, `ci/`. Keep branches short-lived and rebase or merge `main` back before opening the PR.
- The Check workflow runs for pull requests into `main` and pushes to `main`. Pushing to any other branch does not trigger it; start it manually from Actions if you need a run before a PR.
- Make incremental commits. Each commit does one thing and leaves the tree passing `npm run check`. Do not mix a refactor with a behavior change or a formatting sweep with a fix.
- Commit subjects are imperative and under 72 characters, like the existing history. Use the body to explain why, and what was verified.

## Keep the docs in step

Update documentation in the same PR as the change it describes. Stale docs are treated as bugs.

| When you change | Also update |
|---|---|
| A server module, route, registration point, or storage layout | `docs/architecture.md` (code boundaries and module tables) |
| Setup steps, checks, or the PR process | `CONTRIBUTING.md` and the README contributing section |
| A subject helper's API, assumptions, or limits | Its reference under `plugins/lesson-library/skills/lesson-library/references/` and `server/capabilities.js` |
| The lesson JSON contract or teaching guidance | `references/lesson-format.md`, `references/teaching.md`, and the prompts in `server/providers.js` |
| CI triggers or required tools | `.github/workflows/ci.yml`, the README, and `CONTRIBUTING.md` |

## Verification

- `npm run check` after any functional change. It runs the unit tests and the production build without a provider login or a model download.
- `LEARNVID_BROWSER_TEST=1 npm run check` when touching a browser module or capture; `npm run test:ui` when touching the UI. Both need `npx playwright install chromium`.
- For generation, speech timing, or encoding changes, render a real MP4 and check it with FFprobe, including transcript and caption timing. A passing test is not proof the video is right.
- Provider-dependent and external-renderer checks are opt-in and never required in CI.

## Configuration and tools

- Runtime configuration is the library's `settings.json`, validated by `settingsSchema` in `server/schema.js`. Add new user-facing options there, not as literals.
- The only runtime environment variables are `LEARNVID_HOME` (library folder) and `LEARNVID_BLENDER` (Blender binary). `LEARNVID_BROWSER_TEST` and `LEARNVID_SCIENTIFIC_PYTHON` gate optional tests.
- External commands (`ffmpeg`, `ffprobe`, `say`, `espeak`, `piper`, `codex`, `claude`, `python3`) are bare names resolved from `PATH`. The Electron shell prepends common install locations. Known gap: there is no per-tool path override and the Kokoro cache path is repeated in several files; if you add configuration, put it in one place rather than adding another literal.
- Speech goes through `speak()` in `server/speech.js`, which dispatches on the `tts` setting to Kokoro (in-process, default), the system voice, or Piper. A new backend is a new branch in that function plus the schema enum, the Settings view, and the README speech section.
- Use `npm ci`. When changing dependencies, update `package.json` and `package-lock.json` together and run `npm audit`; accepted findings are recorded in `CONTRIBUTING.md`.

## Product and UI copy

User-facing copy explains learning tasks, progress, and actionable errors. Keep technical setup details in Settings, not in the library and player screens. Use compact, functional copy: direct labels, system sans-serif typography, neutral surfaces, and space devoted to content and controls. Avoid slogans, motivational taglines, decorative introductions, and marketing-style empty states.
