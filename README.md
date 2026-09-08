# Lesson Library

A local app for lessons made around what you know. Browse your videos, follow their transcripts, and ask questions. Create a lesson in the app or from Codex / Claude in a terminal; both use the same private library.

First implementation in progress. Runtime data belongs outside this public repository.

## Development

Requires Node.js 22+, FFmpeg, and a signed-in Codex or Claude CLI. macOS system speech is the default narrator; Piper will be configurable for local speech on other systems.

```sh
npm install
npm run dev
```

## Design

- React interface and local Node service; optional Electron desktop shell.
- One file-based library shared by the app and `learnvid` CLI.
- Local agent subprocesses write structured lessons and answer transcript-grounded questions.
- Markdown / text / chat exports and selected Obsidian notes provide explicit learning context.
- Source code is public. Profiles, sources, transcripts, conversations, and videos are private local data.

Local orchestration does not mean offline inference: Codex and Claude send prompts and selected source excerpts to their configured model providers.
