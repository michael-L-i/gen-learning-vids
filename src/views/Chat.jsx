import { useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, MessageCircle, Send } from "lucide-react";
import { api, post } from "../api.js";
import { time } from "../format.js";
import { ErrorMessage, IconButton } from "../components/ui.jsx";

function AnswerText({ text, seek }) {
  return (
    <div className="answer-text">
      {text
        .split(/(\[\d{1,3}:\d{2}\]|`[^`\n]+`|\*\*[^*\n]+\*\*)/g)
        .map((part, i) =>
          /^\[\d+:\d{2}\]$/.test(part) ? (
            <button
              key={i}
              className="timestamp-link"
              onClick={() => {
                const [m, s] = part.slice(1, -1).split(":").map(Number);
                seek(m * 60 + s);
              }}
            >
              {part}
            </button>
          ) : part.startsWith("`") && part.endsWith("`") ? (
            <code key={i}>{part.slice(1, -1)}</code>
          ) : part.startsWith("**") && part.endsWith("**") ? (
            <strong key={i}>{part.slice(2, -2)}</strong>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
    </div>
  );
}
export function Chat({ id, seconds, ready, seek }) {
  const [messages, setMessages] = useState([]),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const bottom = useRef(null);
  useEffect(() => {
    api(`/lessons/${id}/chat`)
      .then(setMessages)
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  const send = async (e) => {
    e.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await post(`/lessons/${id}/chat`, { question, seconds });
      setMessages(data);
      setQuestion("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="chat-panel">
      <div className="chat-heading">
        <span className="chat-icon">
          <MessageCircle size={21} />
        </span>
        <div>
          <h3>Video Q&A</h3>
        </div>
      </div>
      <div className="chat-messages">
        {!messages.length && (
          <div className="chat-welcome">
            {[
              "Explain with an example",
              "Summarize this lesson",
              "Test my understanding",
            ].map((q) => (
              <button key={q} disabled={!ready} onClick={() => setQuestion(q)}>
                {q}
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-message ${m.role}`}>
            <span className="message-label">
              {m.role === "user" ? "You" : "Assistant"}
              {m.role === "user" && m.seconds > 0 && ` · ${time(m.seconds)}`}
            </span>
            <AnswerText text={m.content} seek={seek} />
          </div>
        ))}
        {busy && (
          <div className="thinking">
            <LoaderCircle size={16} className="spin" /> Answering…
          </div>
        )}
        <div ref={bottom} />
      </div>
      <ErrorMessage message={error} />
      <form onSubmit={send} className="chat-form">
        <textarea
          aria-label="Question about this video"
          placeholder={
            ready
              ? "Ask about this video…"
              : "Available when your lesson is ready"
          }
          disabled={!ready || busy}
          maxLength={3000}
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(e);
            }
          }}
        />
        <div>
          <span>
            {ready
              ? `Watching at ${time(seconds)}`
              : "Video is still generating"}
          </span>
          <IconButton
            label="Send question"
            type="submit"
            disabled={!ready || !question.trim() || busy}
          >
            <Send size={17} />
          </IconButton>
        </div>
      </form>
    </aside>
  );
}
