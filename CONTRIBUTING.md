# Contributing to Lesson Library

Start with a small, focused change: improve a guide, repair a labeled visual, fix a reproducible bug, or extend an existing helper. For a new dependency, renderer, or larger design change, open an issue first with the learning task it would support and a concrete example.

Create contribution branches from **`main`** and open PRs against `main`. Read [AGENTS.md](AGENTS.md) for repository conventions; they apply to human and agent-assisted contributions.

## Set up a checkout

You need Git, Node.js **22.16+**, npm, and **FFmpeg/FFprobe**. macOS is the tested platform. On macOS, `brew install ffmpeg` installs both media commands; Linux contributors also need their distribution's media packages and, for browser tests, Chromium system dependencies. A provider account is not required for the example, unit tests, or browser tests.

Fork the repository on GitHub, then use your fork's URL below:

```sh
git clone https://github.com/YOUR-USERNAME/gen-learning-vids.git
cd gen-learning-vids
git remote add upstream https://github.com/michael-L-i/gen-learning-vids.git
git fetch upstream
git switch -c my-change upstream/main
nvm install                    # optional, if you use nvm
npm ci
npm run check
```

Use `npm ci` for an existing lockfile. When intentionally changing dependencies, update both `package.json` and `package-lock.json` with npm. Do not share `node_modules` between worktrees with different dependency sets.

### Dependencies and audit

Run `npm audit` after changing dependencies. The `overrides` block in `package.json` pins transitive packages whose parents have not picked up a fix yet; keep an override only until the parent range includes the fixed version, then remove it:

- `sharp` is held at 0.35.4 or newer for the copy under `@huggingface/transformers` (libvips and libheif advisories). Kokoro speech was verified against it.
- `@xmldom/xmldom` is held at 0.9.12 or newer under `mathjax-full`. Equation rendering uses MathJax's lite adaptor, not xmldom, so this only affects the unused speech-rule-engine path.

Accepted findings, not fixed: `electron` and its `extract-zip` dependency report advisories that require moving from Electron 38 to 41. Both are development-only packaging dependencies; the fix is a separate change that must re-verify the DMG build.

Render the [first-scene example](examples/first-scene/README.md) to exercise narration, browser capture, encoding, and saved lesson output without a model-provider login. It uses public, original source files and a separate library directory.

## Run the app with disposable data

Keep development data outside the checkout and separate from your personal library:

```sh
export LEARNVID_HOME="$(mktemp -d "${TMPDIR:-/tmp}/lesson-library-dev.XXXXXX")"
npm run dev
```

Keep this terminal open so subsequent CLI commands use the same folder. To inspect it, run `node bin/learnvid.js list`. After testing, stop the server and remove only the temporary folder you created if you no longer need it. `unset LEARNVID_HOME` restores the default location for subsequent commands.

For actual planning and tutor Q&A, sign into your preferred supported CLI and select it in **Settings & connections**. Tests do not need your account or credentials. Do not paste provider credentials, private context, or personal logs into issues or PRs.

## Find the right part of the code

| Area | Start here |
|---|---|
| Library UI and player | `src/` |
| Local API and CLI | `server/app.js`, `bin/learnvid.js` |
| Creation, background jobs, retries, Q&A | `server/engine.js` |
| Storage, settings, snapshots, locks | `server/store.js` |
| Planner prompts and shared teaching guidance | `server/providers.js`, `server/teaching.js`, `plugins/lesson-library/skills/lesson-library/references/teaching.md` |
| Structured visuals and SVG animation | `server/render.js`, `server/visuals.js`, `server/animation/` |
| Shared authored narration and media publication | `server/authored/` |
| Browser scene capture and encoding input | `server/browser/` |
| Tool discovery and subject helpers | `server/capabilities.js`, subject folders such as `server/molecular/` |
| Optional external renderers | `server/blender/`, `server/scientific/` |
| Companion skill and module guides | `plugins/lesson-library/skills/lesson-library/` |
| Unit/integration tests and UI tests | `tests/*.test.js`, `tests/ui.spec.js` |

Read [architecture](docs/architecture.md) before changing cross-cutting behavior. The app and CLI must keep using the same engine and storage contracts. Executable scenes belong to explicit trusted-local authoring routes; the HTTP planner accepts validated structured data.

## Choose the relevant checks

Run commands from the repository root. Tests use temporary libraries and fixtures; default checks do not call a signed-in provider or synthesize real Kokoro speech.

| Change | Verification |
|---|---|
| Code or functional example | `npm run check` (tests and production build) |
| Browser helper or capture behavior | `npx playwright install chromium`, then `LEARNVID_BROWSER_TEST=1 npm run check` |
| A focused module iteration | For example, `LEARNVID_BROWSER_TEST=1 node --test tests/molecular.test.js tests/molecular-browser.test.js` |
| Library UI or player interaction | `npm run test:ui` after installing Chromium |
| Generation, speech timing, or encoding | Render an actual narrated MP4; inspect frames, decode it, check it with FFprobe, and verify transcript/caption timing. The [example verifier](examples/first-scene/README.md#verify-the-result) demonstrates this workflow. |
| Documentation only | Check relative links and commands, inspect Markdown rendering and any media, and state that no runtime behavior changed. |

Optional external-renderer checks use `LEARNVID_BLENDER=/path/to/blender` or `LEARNVID_SCIENTIFIC_PYTHON=/path/to/python`; see their [Blender](docs/blender-rendering.md) and [scientific](docs/scientific-animation.md) guides. Missing optional dependencies are reported as skips. Never require a provider login in default CI.

GitHub Actions runs the Check workflow for pull requests into `main` and for pushes to `main`, including the browser module tests. Pushes to other branches do not trigger it; maintainers can start a run from Actions when needed. Include local results in the PR for any optional checks.

## Review a visual change

Check the encoded output, not only the source or a successful exit code. Verify the underlying calculation or source data separately from whether the picture looks plausible. Useful checks include:

- The viewer can identify the question, givens, symbols, and units.
- Labels remain attached to the intended objects and readable through motion.
- Animation follows the measured narration beats and leaves time for the difficult inference.
- Seeking to the same time produces the same state, including after a backward seek.
- The video, transcript, captions, and chapter boundaries agree; word times inside beats remain approximate.

Use the shared [teaching guidance](plugins/lesson-library/skills/lesson-library/references/teaching.md). It does not require a fixed frame count, agenda, or subject-specific lesson sequence. Do not infer learner mastery from saved notes or watch history.

## Prepare a PR

Keep changes focused and use incremental commits. Format touched JavaScript consistently with nearby code; avoid running the whole-repository formatter for an unrelated change.

```sh
git diff --check
git status --short
git push -u origin my-change
```

Open a PR with base `michael-L-i/gen-learning-vids:main`. Include:

- The problem and the resulting behavior, with a concrete example where useful.
- Checks run, their results, and any optional checks skipped.
- For a visual change, a non-sensitive screenshot or short review attachment, plus reproducible source and render instructions.
- Any new dependency, source provenance, supported scope, or limitation reviewers need to assess.

Write public examples from scratch or use clearly licensed public inputs. Keep runtime libraries, real notes, transcripts, full generated lesson videos, model caches, and credentials outside Git. A local absolute file link will not work for other contributors. Review attachments must be suitable for public sharing; repository media should be small, explicitly approved documentation assets with attribution, like the README GIF. Retain upstream package and asset notices.

Before opening an issue, search for an existing one. A useful bug report gives the branch/commit, OS and Node version, exact command or UI steps, expected and actual behavior, and a minimal non-sensitive reproduction. If the worktree is temporary, remove it after its clean commits are pushed and its necessary outputs are saved elsewhere.
