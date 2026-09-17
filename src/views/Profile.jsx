import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { api, post } from "../api.js";
import { ErrorMessage } from "../components/ui.jsx";

export function Profile({ notify }) {
  const [content, setContent] = useState(""),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api("/profile")
      .then((p) => {
        setContent(p.content);
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="page narrow-page">
      <div className="page-heading">
        <div>
          <h1>Learning profile</h1>
          <p>
            Background, goals, and explanation preferences included in new
            lessons.
          </p>
        </div>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await post("/profile", { content }, "PUT");
            notify("Learning profile saved");
            setError("");
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          About my learning <span className="optional">Markdown supported</span>
          <textarea
            className="profile-editor"
            aria-label="Learning profile"
            disabled={!loaded}
            maxLength={50000}
            rows={19}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </label>
        <ErrorMessage message={error} />
        <div className="profile-footer">
          <p>
            Included in new lessons. Existing lessons keep their original
            context.
            <br />
            Watching a video doesn’t automatically mark a concept as mastered.
          </p>
          <button className="primary" disabled={!loaded || busy}>
            {busy ? "Saving…" : "Save profile"}
            <Check size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
