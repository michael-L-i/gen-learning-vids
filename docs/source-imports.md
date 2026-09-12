# Source imports

File and Folder remain direct upload buttons. Other imports start from Obsidian, Paste text, or Conversations & memory. Chat services are grouped under one entry with ChatGPT, Claude, and Gemini choices.

| Source | How to import | Supported content |
| --- | --- | --- |
| File / Folder | Click the upload button and choose a file or directory. The selected name becomes the source title. | Markdown, text, JSON. A folder becomes one source with relative filenames as headings. |
| Obsidian | Choose a detected vault, select notes, and import. | Markdown and text notes; copies only. |
| ChatGPT | Request an export in Settings → Data controls, unzip it, and upload `conversations.json`. | Active-branch user/assistant messages, or pasted conversation text. |
| Claude | Request an export in Settings → Privacy, unzip it, and upload `conversations.json`. | Conversation messages, or pasted conversation text. |
| Gemini | In Google Takeout select My Activity → Gemini Apps; unzip the export and choose the JSON or HTML activity file. | Available activity text and responses. Some exports do not retain full conversation threads. |
| Memory / summary | Choose a chat service, select Memory / summary, and paste copied text. | Saved memories, learning preferences, or a summary. |

Provider exports are converted to editable text before saving. HTML is parsed as inert text; scripts and styles are discarded and remote resources are never loaded. No account authentication, history API, continuous sync, or automatic memory retrieval is implemented. Imports do not update the learner profile automatically.

Uploads are limited to 3 MB, with a maximum of 100 supported files in a folder. Each saved source is limited to 150,000 characters; review and reduce large conversation exports in the editor. ZIP extraction and media attachments are not supported. Hidden folders, `node_modules`, and unsupported files are excluded from folder uploads.

Obsidian discovery reads `obsidian.json` in the app's standard settings directory on macOS, Windows, or Linux. It lists accessible registered directories and does not crawl the home folder, read notes until a vault is chosen (automatically when there is one), or change Obsidian settings. The registry format is an implementation detail, so discovery may fail after an Obsidian update; Refresh vaults and Use another vault provide recovery. Discovery covers local vaults, not remote-only Sync vaults.

## References

Checked September 8, 2026:

- [ChatGPT data export](https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data)
- [Claude data export](https://support.claude.com/en/articles/9450526-export-your-claude-data)
- [Gemini Apps data export](https://support.google.com/gemini/answer/16920332?hl=en)
- [Obsidian data storage and settings locations](https://obsidian.md/help/data-storage)
- [Obsidian CLI](https://obsidian.md/help/cli) also exposes vault discovery, but requires CLI setup; the app uses the local registry for discovery without that dependency.

Provider export schemas are not stable public API contracts. Parser fixtures cover the supported shapes; unknown JSON schemas show an actionable error and can be imported as pasted text instead.
