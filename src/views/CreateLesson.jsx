import { useState } from "react";
import { ArrowRight, FileText, FolderOpen, LoaderCircle } from "lucide-react";
import { post } from "../api.js";
import { ErrorMessage, Modal, PresentationSelect } from "../components/ui.jsx";

export function CreateLesson({
  sources,
  defaultStyle,
  defaultPresentation,
  close,
  created,
}) {
  const [topic, setTopic] = useState(""),
    [goal, setGoal] = useState(""),
    [style, setStyle] = useState(defaultStyle),
    [presentation, setPresentation] = useState(defaultPresentation || "auto"),
    [visualBrief, setVisualBrief] = useState(""),
    [chosen, setChosen] = useState([]),
    [brief, setBrief] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      created(
        await post("/lessons", {
          topic,
          goal,
          style,
          presentation,
          visualBrief,
          sourceIds: chosen,
          brief,
        }),
      );
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Create lesson" close={close} wide>
      <form onSubmit={submit}>
        <label className="field">
          What would you like to understand?
          <input
            autoFocus
            required
            minLength={3}
            maxLength={500}
            placeholder="Why does attention work in a transformer?"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </label>
        <label className="field">
          Where are you getting stuck?{" "}
          <span className="optional">Optional</span>
          <textarea
            rows={2}
            maxLength={3000}
            placeholder="I know basic neural networks, but query, key, and value still feel abstract."
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </label>
        <div className="field">
          Sources <span className="optional">Optional</span>
          {sources.length ? (
            <div className="source-picker">
              {sources.map((s) => (
                <label key={s.id}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(s.id)}
                    onChange={() =>
                      setChosen(
                        chosen.includes(s.id)
                          ? chosen.filter((id) => id !== s.id)
                          : [...chosen, s.id],
                      )
                    }
                  />
                  <FileText size={16} />
                  <span>{s.title}</span>
                </label>
              ))}
            </div>
          ) : (
            <div className="subtle-box">
              <FolderOpen size={18} />
              <span>
                No sources added. Your learning profile is included
                automatically.
              </span>
            </div>
          )}
        </div>
        <details className="brief-details">
          <summary>Add context from a conversation</summary>
          <textarea
            aria-label="Conversation context"
            rows={3}
            maxLength={20000}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Paste relevant context from ChatGPT, Claude, or another discussion…"
          />
        </details>
        <PresentationSelect value={presentation} onChange={setPresentation} />
        <label className="field">
          Visual directions <span className="optional">Optional</span>
          <textarea
            aria-label="Visual directions"
            rows={2}
            maxLength={2000}
            value={visualBrief}
            onChange={(e) => setVisualBrief(e.target.value)}
            placeholder="For example: start with a force diagram, then derive the equation. Use plots to show how the result changes."
          />
        </label>
        <details className="brief-details">
          <summary>Color palette</summary>
          <select
            aria-label="Color palette"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
          >
            <option value="auto">Auto</option>
            <option value="paper">Paper</option>
            <option value="midnight">Midnight</option>
            <option value="sage">Field notes</option>
          </select>
        </details>
        <ErrorMessage message={error} />
        <div className="modal-footer">
          <p>Generates a video, transcript, and captions.</p>
          <button className="primary" disabled={busy || chosen.length > 30}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <ArrowRight size={18} />
            )}{" "}
            {busy ? "Starting…" : "Create lesson"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
