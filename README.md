# Lesson Library

A personal video learning app, shaped around what you know and where you get stuck. Create a lesson in the app or from a Codex / Claude conversation, then find it in the same local library.

![Lesson Library catalog](docs/catalog.png)

## What works

- A desktop or browser app with a searchable video catalog, thumbnails, progress, and three visual styles.
- Narrated MP4 lessons, timestamped transcripts, captions, chapter navigation, and a comprehension question.
- A tutor beside each video, with saved conversations and clickable timestamp references.
- A Markdown learner profile, selected Obsidian notes, pasted discussions, and ChatGPT / Claude JSON export imports.
- Codex and Claude Code providers using your installed, signed-in CLIs. No separate model API key required by the app.
- Configurable system speech (default) or Piper. Rendering and speech run locally.
- A shared CLI and companion skills so an agent can add lessons using the context of your current conversation.

This first version makes short narrated slide videos with concept, sequence, and comparison layouts. It does not generate cinematic footage, upload to YouTube, or silently synchronize account memory.

## Run from GitHub

macOS is the tested platform. Install **Node.js 22.16 or newer**, **FFmpeg** (including FFprobe), and either [Codex](https://github.com/openai/codex) or [Claude Code](https://code.claude.com/docs/en/overview). Sign into your chosen agent once using its normal CLI.

```sh
git clone https://github.com/michael-L-i/gen-learning-vids.git
cd gen-learning-vids
nvm install                    # if you use nvm; reads .nvmrc
npm ci
npm run build
npm link                       # makes learnvid available in your terminal
learnvid doctor
npm start                      # opens the local browser app
```

On a Mac with Homebrew, `brew install ffmpeg` installs the media tools. macOS includes the default speech engine. Open **Settings & connections** to choose Codex or Claude, check installed tools, or change narration.

To open a desktop window instead:

```sh
npm run desktop
```

The desktop window and terminal use the same library. Keep the checkout in place after linking the CLI or skills. No personal library files need to live in the repository.

## Make your first lesson

1. In **Learning profile**, describe your background, goals, uncertainties, and useful explanation preferences.
2. In **Sources & notes**, paste a discussion, import a text/JSON file, or preview an Obsidian folder and select notes.
3. Select **Create a lesson**, give it a question, describe where you are stuck, and select relevant sources.
4. Open the finished video to watch, jump through its transcript, reveal the comprehension check, or ask questions.

The profile is included automatically. Notes are included only when selected for that lesson. A note's presence is not treated as proof of understanding. Each lesson retains its original context snapshot even if you later edit your profile or remove a source.

You can test speech and rendering without contacting a model provider:

```sh
learnvid create "Recursion, one return at a time" --plan examples/recursion.json --wait
```

## Use from Codex or Claude

Install the companion skill for either or both agents:

```sh
npm run skill:codex
npm run skill:claude
```

These commands link the repo's skill into `~/.agents/skills/lesson-library` or `~/.claude/skills/lesson-library`. Existing skills are never overwritten. Start a new agent session after installation. To uninstall, remove the corresponding symlink; your videos remain intact.

Ask the agent: **“Make a Lesson Library video about what we just discussed, focusing on the part I was confused about.”** The skill can write the lesson plan itself and pass a concise learner-context brief to the renderer. This carries the current conversation into the app without starting another planning conversation.

The [plugin directory](plugins/lesson-library) also includes Codex and Claude manifests. Claude Code can load it directly with `claude --plugin-dir ./plugins/lesson-library`. The skill installation above is the simplest local Codex setup; no marketplace is required.

You can also use the CLI directly:

```sh
learnvid create "Why binary search works" --goal "I understand loops, but not why halving is safe"
learnvid create "Recursion" --source ~/Notes/recursion.md --brief /tmp/learning-context.md
learnvid list
learnvid show LESSON_ID
learnvid ask LESSON_ID "Can you trace one smaller example?"
learnvid retry LESSON_ID
learnvid open
```

Creation runs in the background. Add `--wait` to wait for the final result. `--source` accepts a file and can be repeated. An agent-authored JSON plan can be supplied with `--plan`; see the [lesson format](plugins/lesson-library/skills/lesson-library/references/lesson-format.md).

## Memory and Obsidian

This app does **not** have automatic access to ChatGPT saved memory, all your chats, or Claude account history. There are three explicit ways to bring context in:

- **Current conversation:** the companion skill uses the context available to the calling agent, then saves a brief with the lesson.
- **Exports or pasted text:** import a relevant ChatGPT or Claude conversation export, Markdown, plain text, or a summary of your saved memory. ChatGPT JSON imports follow the selected conversation branch and omit system messages. Large archives must be reduced to relevant conversations first.
- **Obsidian:** preview a local vault, select Markdown/text notes, and import copies. Hidden folders and symlinks are skipped. Originals are not edited, and subsequent note changes are not automatically synced.

Imports are reference material. They do not automatically rewrite the learner profile or establish mastery. The app currently uses explicit selection and bounded excerpts, rather than a vector database or background vault indexing. The lesson's **Sources & context** tab shows exactly which excerpts were used, including truncation.

## Your library folder

By default everything is under `~/Lesson Library`:

```text
Lesson Library/
  profile/learner.md
  settings.json
  sources/<id>.json
  videos/<lesson-id>.mp4
  lessons/<lesson-id>/
    lesson.json
    storyboard.json
    context.json
    thumbnail.png
    transcript.md
    captions.vtt
    chat.json
  .jobs/                       temporary agent workspaces
```

Use `LEARNVID_HOME=/absolute/path` or `--library /absolute/path` to choose a different folder. All clients must point at that same location. Back it up as an ordinary folder. Individual files are written atomically and lesson locks prevent competing writers. Failed or interrupted jobs can reuse their saved plan on retry.

The server listens on loopback only. Browser writes require a per-instance token and same-origin requests. This is a single-user app; it is not designed for exposing a server to the internet. Locally stored notes are private from the public repository, but **selected excerpts, learner context, and questions are sent to the configured Codex/Claude model provider**. Local orchestration is not offline inference.

## Speech and output

- **Default:** macOS `say`, with a voice name and speaking pace in Settings. List voices using `say -v '?'`. On Linux the system adapter expects `espeak`.
- **Piper:** install the `piper` executable and a compatible `.onnx` voice model plus its configuration, then select its absolute model path in Settings. This adapter is implemented but has not yet been tested on a machine with Piper installed.
- **Output:** 1280×720 H.264 / AAC MP4, approximately timed WebVTT captions, and a Markdown transcript. Chapter boundaries use measured speech durations; captions divide words across those durations, so they are not word-aligned transcription.

The first version is oriented to English lessons. Linux system speech and Windows desktop packaging are not yet validated.

## Development and packaging

```sh
npm run dev                    # local API + Vite
npm run check                  # storage/API tests + production build
npx playwright install chromium
npm run test:ui                # browser flows, no model credentials required
npm run desktop:package        # local .app in release/ on macOS
npm run dist:mac               # build a DMG
```

Use a supported Node version for Electron packaging. The artwork source is `build/icon.svg`; `npm run build:icon` regenerates PNG/ICNS assets on macOS. Developer builds are not notarized automatically. Signing and notarization for wider distribution require the distributor's Apple configuration.

Real Codex lesson generation, Claude lesson generation, Claude transcript Q&A, macOS speech, MP4 playback, seeking, and narrow-screen layouts were exercised during implementation. CI covers storage, imports, context snapshots, retries, writer locking, local API access controls, and browser flows without contacting a model provider.

See [architecture and next steps](docs/architecture.md) for extension points. MIT licensed.
