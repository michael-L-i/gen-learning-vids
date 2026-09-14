# Using Lesson Library

[Setup and overview](../README.md) · [Contributing](../CONTRIBUTING.md)

## Make your first lesson

1. In **Learning profile**, describe your background, goals, uncertainties, and useful explanation preferences.
2. In **Sources & notes → Add a source**, use **Upload file** or **Upload folder**, paste text, choose a detected Obsidian vault, or open **Conversations & memory** and select ChatGPT, Claude, or Gemini. [Import instructions and supported formats](source-imports.md).
3. Select **Create a lesson**, give it a question, describe where you are stuck, and select relevant sources. Leave Presentation on Auto or choose an approach and add visual directions.
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

The [plugin directory](../plugins/lesson-library) also includes Codex and Claude manifests. Claude Code can load it directly with `claude --plugin-dir ./plugins/lesson-library`. The skill installation above is the simplest local Codex setup; no marketplace is required.

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

Creation runs in the background. Add `--wait` to wait for the final result. `--source` accepts a file and can be repeated. An agent-authored JSON plan can be supplied with `--plan`; see the [lesson format](../plugins/lesson-library/skills/lesson-library/references/lesson-format.md).

## Memory and Obsidian

This app does **not** have automatic access to ChatGPT saved memory, all your chats, or Claude account history. There are three explicit ways to bring context in:

- **Current conversation:** the companion skill uses the context available to the calling agent, then saves a brief with the lesson.
- **Conversations & memory:** choose ChatGPT, Claude, or Gemini, then upload an extracted export file or paste a conversation or memory summary. Preview and edit the extracted text before saving. ChatGPT imports follow the active conversation branch and omit system messages. Gemini imports support activity JSON and HTML; they preserve available exchanges without inventing conversation grouping. ZIP archives must be extracted first. These are local copies, not account connections.
- **Obsidian:** select a vault discovered from Obsidian’s local registry, preview its Markdown/text notes, and import selected copies. A single discovered vault is previewed automatically; manual path entry is available if discovery fails. No MCP server is needed for this local import. Hidden folders and symlinks are skipped. Originals are not edited, and subsequent note changes are not automatically synced.

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
  .models/kokoro/               cached neural speech model
  .previews/                    cached voice previews
  .jobs/                       temporary agent workspaces
```

Use `LEARNVID_HOME=/absolute/path` or `--library /absolute/path` to choose a different folder. All clients must point at that same location. Back it up as an ordinary folder. Individual files are written atomically and lesson locks prevent competing writers. Failed or interrupted jobs can reuse their saved plan on retry.

The server listens on loopback only. Browser writes require a per-instance token and same-origin requests. This is a single-user app; it is not designed for exposing a server to the internet. Locally stored notes are private from the public repository, but **selected excerpts, learner context, and questions are sent to the configured Codex/Claude model provider**. Local orchestration is not offline inference.

## Speech and output

- **Default for new libraries: Kokoro.** The app bundles the speech runtime and six US/British English voice choices. First use downloads approximately 100 MB of model files to `~/Lesson Library/.models/kokoro`; subsequent generation works offline. No speech API key or Python environment is needed. Choose a voice and speed in Settings, then select **Preview voice**. Preview uses the current form values without saving them.
- **System speech:** macOS `say`, with a voice name and speaking pace in Settings. List voices using `say -v '?'`. On Linux the system adapter expects `espeak`.
- **Piper:** install the `piper` executable and a compatible `.onnx` voice model plus its configuration, then select its absolute model path in Settings. This adapter is implemented but has not yet been tested on a machine with Piper installed.
- **Output:** 1280×720 H.264 / AAC MP4, approximately timed WebVTT captions, and a Markdown transcript. Chapter boundaries use measured speech durations; captions divide words across those durations, so they are not word-aligned transcription.

Existing libraries retain their explicitly saved speech engine; choose Kokoro and save Settings to switch. Existing videos keep their original audio. New libraries default to Kokoro’s Heart voice at 1× speed.

The first version is oriented to English lessons. Linux system speech and Windows desktop packaging are not yet validated.

## Desktop packaging

From the repository root:

```sh
npm run desktop:package         # local .app for development
npm run dist:mac                # DMG build
```

Use a supported Node version for Electron packaging. Developer builds are not notarized automatically. Signing and notarization require the distributor's Apple configuration. The newer browser dependencies have been exercised in a source checkout, not fully validated in packaged DMGs. Linux system speech and Windows desktop packaging also need validation.

The artwork source is `build/icon.svg`; `npm run build:icon` regenerates its PNG/ICNS assets on macOS. See [contribution setup and checks](../CONTRIBUTING.md) before modifying runtime or packaging code.
