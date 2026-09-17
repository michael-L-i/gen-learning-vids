import { useState } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { date } from "../format.js";
import { ErrorMessage, IconButton, Modal } from "../components/ui.jsx";
import { BrandLogo, ImportModal } from "./ImportModal.jsx";

const sourceKindLabels = {
  note: "Pasted text",
  file: "File",
  folder: "Folder",
  obsidian: "Obsidian note",
  memory: "Memory",
  conversation: "Conversation",
};
export function Sources({ sources, reload, notify }) {
  const [adding, setAdding] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(null);
  const remove = async (source) => {
    if (
      !window.confirm(
        `Remove “${source.title}” from your sources? Existing lessons keep their context snapshot.`,
      )
    )
      return;
    try {
      await api(`/sources/${source.id}`, { method: "DELETE" });
      await reload();
      notify("Source removed");
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <div className="page sources-page">
      <div className="page-heading">
        <div>
          <h1>Sources & notes</h1>
        </div>
        <button className="primary" onClick={() => setAdding(true)}>
          <Plus size={18} /> Add a source
        </button>
      </div>
      <ErrorMessage message={error} />
      {!sources.length ? (
        <div className="empty-shelf">
          <FileText size={28} />
          <p>No sources imported.</p>
        </div>
      ) : (
        <div className="source-list">
          {sources.map((s) => (
            <div className="source-row" key={s.id}>
              <div className="source-icon">
                {s.kind === "obsidian" || s.provider ? (
                  <BrandLogo name={s.provider || "obsidian"} />
                ) : (
                  <FileText size={21} />
                )}
              </div>
              <button
                className="source-title"
                onClick={async () => {
                  try {
                    setPreview(await api(`/sources/${s.id}`));
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                <strong>{s.title}</strong>
                <span>
                  {sourceKindLabels[s.kind] || "Note"} ·{" "}
                  {s.characters.toLocaleString()} characters · Added{" "}
                  {date(s.importedAt)}
                </span>
              </button>
              <IconButton label={`Remove ${s.title}`} onClick={() => remove(s)}>
                <Trash2 size={17} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      {adding && (
        <ImportModal
          close={() => setAdding(false)}
          done={async (count) => {
            setAdding(false);
            await reload();
            notify(
              `${count} ${count === 1 ? "source added" : "sources added"}`,
            );
          }}
        />
      )}{" "}
      {preview && (
        <Modal
          title={preview.title}
          eyebrow="SOURCE PREVIEW"
          close={() => setPreview(null)}
          wide
        >
          <pre className="source-content">{preview.content}</pre>
          <p className="fine-print">{preview.origin}</p>
        </Modal>
      )}
    </div>
  );
}
