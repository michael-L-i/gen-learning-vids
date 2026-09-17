import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  FolderOpen,
  MessageCircle,
  Search,
  Upload,
} from "lucide-react";
import { api, post } from "../api.js";
import { ErrorMessage, Modal } from "../components/ui.jsx";

const conversationServices = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    help: "https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data",
    instructions:
      "In ChatGPT, open Settings → Data controls → Export data. Download and unzip the export, then choose conversations.json.",
  },
  {
    id: "claude",
    name: "Claude",
    help: "https://support.claude.com/en/articles/9450526-export-your-claude-data",
    instructions:
      "In Claude, open Settings → Privacy → Export data. Download and unzip the export, then choose conversations.json.",
  },
  {
    id: "gemini",
    name: "Gemini",
    help: "https://support.google.com/gemini/answer/16920332?hl=en",
    instructions:
      "In Google Takeout, select My Activity → Gemini Apps. Download and unzip the export, then choose its JSON or HTML activity file. The Gemini product export alone contains Gems, not your chats.",
  },
];
export function BrandLogo({ name }) {
  return (
    <img
      className="brand-logo"
      src={`/brands/${name}.svg`}
      alt=""
      aria-hidden="true"
    />
  );
}
export function ImportModal({ close, done }) {
  const fileInput = useRef(null),
    folderInput = useRef(null),
    exportInput = useRef(null);
  const [mode, setMode] = useState("choose"),
    [provider, setProvider] = useState(null),
    [kind, setKind] = useState("conversation"),
    [title, setTitle] = useState(""),
    [content, setContent] = useState(""),
    [filename, setFilename] = useState(""),
    [folder, setFolder] = useState(""),
    [scan, setScan] = useState(null),
    [vaults, setVaults] = useState([]),
    [vaultMessage, setVaultMessage] = useState(""),
    [chosen, setChosen] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const service = conversationServices.find((entry) => entry.id === provider);
  const work = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const scanVault = async (root) => {
    setFolder(root);
    setScan(null);
    setChosen([]);
    setScan(await post("/sources/scan", { path: root }));
  };
  const detectVaults = () =>
    work(async () => {
      setScan(null);
      setChosen([]);
      const result = await api("/sources/obsidian/vaults");
      setVaults(result.vaults);
      setVaultMessage(result.message);
      if (result.vaults.length === 1) await scanVault(result.vaults[0].path);
    });
  const choose = (next) => {
    setMode(next);
    setError("");
    setTitle("");
    setContent("");
    setFilename("");
    setProvider(null);
    setKind("conversation");
    if (next === "obsidian") detectVaults();
  };
  const upload = (event, uploadKind) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selected.length) return;
    work(async () => {
      const supported = selected.filter((file) => {
        const name = file.webkitRelativePath || file.name;
        return (
          /\.(md|txt|json)$/i.test(name) &&
          !name
            .split("/")
            .some((part) => part.startsWith(".") || part === "node_modules")
        );
      });
      if (!supported.length)
        throw new Error("No Markdown, text, or JSON files found.");
      if (
        supported.length > 100 ||
        supported.reduce((sum, file) => sum + file.size, 0) > 3000000
      )
        throw new Error(
          "Choose up to 100 supported files, totaling no more than 3 MB.",
        );
      const files = await Promise.all(
        supported.map(async (file) => ({
          path: uploadKind === "folder" ? file.webkitRelativePath : file.name,
          content: await file.text(),
        })),
      );
      await post("/sources/upload", { kind: uploadKind, files });
      await done(1);
    });
  };
  const readExport = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    work(async () => {
      if (file.size > 3000000)
        throw new Error(
          "Choose a smaller export (up to 3 MB), or paste relevant text.",
        );
      const result = await post("/sources/preview", {
        provider,
        filename: file.name,
        content: await file.text(),
      });
      setContent(result.content);
      setFilename(file.name);
      setTitle(file.name.replace(/\.[^.]+$/, ""));
    });
  };
  return (
    <Modal
      title={
        mode === "choose"
          ? "Add a source"
          : mode === "obsidian"
            ? "Obsidian"
            : mode === "chats"
              ? "Conversations & memory"
              : mode === "provider"
                ? service.name
                : "Paste text"
      }
      close={close}
      wide
    >
      {mode !== "choose" && (
        <button
          className="text-button source-back"
          disabled={busy}
          onClick={() => choose(mode === "provider" ? "chats" : "choose")}
        >
          <ArrowLeft size={15} />{" "}
          {mode === "provider" ? "Chat services" : "Source types"}
        </button>
      )}
      {mode === "choose" ? (
        <div className="source-types">
          <input
            hidden
            ref={fileInput}
            aria-label="Upload file"
            type="file"
            accept=".md,.txt,.json"
            onChange={(e) => upload(e, "file")}
          />
          <input
            hidden
            ref={folderInput}
            aria-label="Upload folder"
            type="file"
            webkitdirectory=""
            multiple
            onChange={(e) => upload(e, "folder")}
          />
          <div className="source-upload-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => fileInput.current.click()}
            >
              <Upload size={17} /> Upload file
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => folderInput.current.click()}
            >
              <FolderOpen size={17} /> Upload folder
            </button>
          </div>
          <p className="fine-print source-upload-help">
            Markdown, text, or JSON. Uses the file or folder name as the title.
          </p>
          <div className="source-type-grid">
            <button
              className="source-type"
              disabled={busy}
              onClick={() => choose("obsidian")}
            >
              <BrandLogo name="obsidian" />
              <span>
                <strong>Obsidian</strong>
                <small>Choose from your local vaults</small>
              </span>
              <ArrowRight size={15} />
            </button>
            <button
              className="source-type"
              disabled={busy}
              onClick={() => choose("text")}
            >
              <FileText size={20} />
              <span>
                <strong>Paste text</strong>
                <small>Notes, questions, or a learning brief</small>
              </span>
              <ArrowRight size={15} />
            </button>
            <button
              className="source-type source-type-wide"
              disabled={busy}
              onClick={() => choose("chats")}
            >
              <MessageCircle size={20} />
              <span>
                <strong>Conversations & memory</strong>
                <small>ChatGPT, Claude, Gemini</small>
              </span>
              <div className="brand-stack" aria-hidden="true">
                {conversationServices.map((entry) => (
                  <BrandLogo key={entry.id} name={entry.id} />
                ))}
              </div>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      ) : mode === "chats" ? (
        <div className="chat-service-grid">
          {conversationServices.map((entry) => (
            <button
              className="source-type chat-service"
              key={entry.id}
              onClick={() => {
                setProvider(entry.id);
                setMode("provider");
              }}
            >
              <BrandLogo name={entry.id} />
              <strong>{entry.name}</strong>
              <ArrowRight size={15} />
            </button>
          ))}
          <p className="fine-print">
            Import an exported conversation or paste a memory summary. Imports
            are local copies, without account sync.
          </p>
        </div>
      ) : mode === "obsidian" ? (
        <>
          <div className="section-heading">
            <span>Local vaults</span>
            <button
              className="text-button"
              disabled={busy}
              onClick={detectVaults}
            >
              Refresh vaults
            </button>
          </div>
          {vaultMessage && <p className="fine-print">{vaultMessage}</p>}
          <div className="vault-list">
            {vaults.map((vault) => (
              <button
                key={vault.path}
                className={`source-type ${scan?.root === vault.path ? "selected-vault" : ""}`}
                disabled={busy}
                onClick={() => work(() => scanVault(vault.path))}
              >
                <BrandLogo name="obsidian" />
                <span>
                  <strong>{vault.name}</strong>
                  <small>{vault.path}</small>
                </span>
                {scan?.root === vault.path ? (
                  <Check size={17} />
                ) : (
                  <ArrowRight size={15} />
                )}
              </button>
            ))}
          </div>
          <details className="brief-details">
            <summary>Use another vault</summary>
            <form
              className="manual-vault"
              onSubmit={(event) => {
                event.preventDefault();
                work(() => scanVault(folder));
              }}
            >
              <label className="field">
                Vault path
                <input
                  required
                  disabled={busy}
                  placeholder="~/Documents/My Vault"
                  value={folder}
                  onChange={(event) => {
                    setFolder(event.target.value);
                    setScan(null);
                    setChosen([]);
                  }}
                />
              </label>
              <button className="secondary" disabled={busy}>
                Preview notes <Search size={16} />
              </button>
            </form>
          </details>
          {scan && (
            <div className="notes-preview">
              <div className="section-heading">
                <span>
                  {scan.notes.length} notes found
                  {scan.capped ? " (first 500)" : ""}
                </span>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    setChosen(
                      chosen.length
                        ? []
                        : scan.notes.slice(0, 100).map((note) => note.path),
                    )
                  }
                >
                  {chosen.length ? "Clear selection" : "Select up to 100"}
                </button>
              </div>
              <div className="source-picker tall">
                {scan.notes.map((note) => (
                  <label key={note.path}>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={chosen.includes(note.path)}
                      onChange={() =>
                        setChosen(
                          chosen.includes(note.path)
                            ? chosen.filter((name) => name !== note.path)
                            : [...chosen, note.path],
                        )
                      }
                    />
                    <FileText size={16} />
                    <span>{note.path}</span>
                  </label>
                ))}
                {!scan.notes.length && <p>No Markdown or text notes found.</p>}
              </div>
              <button
                className="primary"
                disabled={busy || !chosen.length || chosen.length > 100}
                onClick={() =>
                  work(async () => {
                    const result = await post("/sources/import", {
                      root: scan.root,
                      paths: chosen,
                      kind: "obsidian",
                    });
                    await done(result.length);
                  })
                }
              >
                Import {chosen.length} selected notes <ArrowRight size={16} />
              </button>
            </div>
          )}
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            work(async () => {
              await post("/sources", {
                title,
                content,
                filename,
                format: "text",
                kind: service ? kind : "note",
                ...(service ? { provider } : {}),
              });
              await done(1);
            });
          }}
        >
          {service && (
            <>
              <div className="service-heading">
                <BrandLogo name={provider} />
                <span>{service.name}</span>
              </div>
              <fieldset className="import-content-kind">
                <legend>Import</legend>
                {[
                  ["conversation", "Conversation"],
                  ["memory", "Memory / summary"],
                ].map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="content-kind"
                      value={value}
                      checked={kind === value}
                      disabled={busy}
                      onChange={() => {
                        setKind(value);
                        setFilename("");
                      }}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              {kind === "conversation" ? (
                <>
                  <input
                    hidden
                    ref={exportInput}
                    aria-label="Chat export file"
                    type="file"
                    accept={
                      provider === "gemini"
                        ? ".json,.html,.htm,.md,.txt"
                        : ".json,.md,.txt"
                    }
                    onChange={readExport}
                  />
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => exportInput.current.click()}
                  >
                    <Upload size={17} /> Upload export
                  </button>
                  <details className="export-help">
                    <summary>How to export from {service.name}</summary>
                    <p>{service.instructions}</p>
                    <a href={service.help} target="_blank" rel="noreferrer">
                      Official export instructions <ArrowRight size={12} />
                    </a>
                    <p>
                      Choose an extracted file up to 3 MB. Review the text below
                      before importing; keep the selection under 150,000
                      characters.
                    </p>
                    {provider === "gemini" && (
                      <p>
                        Activity exports may contain individual exchanges rather
                        than complete conversation threads. Only the text
                        included in the export is imported.
                      </p>
                    )}
                  </details>
                </>
              ) : (
                <p className="fine-print source-help">
                  Paste saved memories, preferences, or a learning summary from{" "}
                  {service.name}. This saves a copy; it does not connect to your
                  account.
                </p>
              )}
            </>
          )}
          <label className="field">
            Title
            <input
              required
              maxLength={200}
              value={title}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={
                service
                  ? `${service.name} ${kind === "memory" ? "memory" : "conversation"}`
                  : "Source title"
              }
            />
          </label>
          <label className="field">
            {service
              ? kind === "memory"
                ? "Memory or summary"
                : "Conversation text"
              : "Text"}
            <textarea
              required
              rows={8}
              value={content}
              disabled={busy}
              onChange={(event) => setContent(event.target.value)}
              placeholder={
                service
                  ? "Paste text here, or upload an export above…"
                  : "Add source text…"
              }
            />
          </label>
          {filename && (
            <p className="fine-print">
              From {filename} · {content.length.toLocaleString()} characters
            </p>
          )}
          <div className="modal-footer">
            <span />
            <button
              className="primary"
              disabled={busy || content.length > 150000}
            >
              {busy ? "Adding…" : "Add to sources"}
              <ArrowRight size={16} />
            </button>
          </div>
          {content.length > 150000 && (
            <p className="fine-print">
              Keep only the relevant text (150,000 characters maximum).
            </p>
          )}
        </form>
      )}
      {busy && (
        <p className="fine-print" role="status">
          {mode === "obsidian" ? "Reading local vaults…" : "Importing…"}
        </p>
      )}
      <ErrorMessage message={error} />
    </Modal>
  );
}
