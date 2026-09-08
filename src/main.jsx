import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileText,
  FolderOpen,
  Grid2X2,
  LoaderCircle,
  MessageCircle,
  Plus,
  Search,
  Send,
  Settings2,
  SlidersHorizontal,
  Terminal,
  Trash2,
  Upload,
  UserRound,
  Video,
  X,
} from "lucide-react";
import "./styles.css";

let csrf = "";
async function api(url, options = {}) {
  const response = await fetch("/api" + url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Lesson-Token": csrf,
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
const post = (url, data, method = "POST") =>
  api(url, { method, body: JSON.stringify(data) });
const time = (n) =>
  `${Math.floor((n || 0) / 60)}:${String(Math.floor((n || 0) % 60)).padStart(2, "0")}`;
const date = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
const fileUrl = (id, name) => `/api/lessons/${id}/files/${name}`;
const isWorking = (status) =>
  ["queued", "generating", "rendering"].includes(status);
function IconButton({ label, children, ...props }) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}
function ErrorMessage({ message }) {
  return message ? (
    <div className="error-message" role="alert">
      <CircleHelp size={17} />
      <span>{message}</span>
    </div>
  ) : null;
}
function Modal({ title, eyebrow, close, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const nodes = ref.current.querySelectorAll(
          'button, input, select, textarea, a[href], [tabindex="0"]',
        );
        const focusable = [...nodes].filter((n) => !n.disabled);
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", onKey);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={ref}
        tabIndex={-1}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-top">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <IconButton label="Close dialog" onClick={close}>
            <X size={21} />
          </IconButton>
        </div>
        {children}
      </section>
    </div>
  );
}
function App() {
  const [bootstrap, setBootstrap] = useState(null),
    [lessons, setLessons] = useState([]),
    [sources, setSources] = useState([]),
    [page, setPage] = useState("library"),
    [selected, setSelected] = useState(null),
    [creating, setCreating] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const reload = async () => {
    const [l, s] = await Promise.all([api("/lessons"), api("/sources")]);
    setLessons(l);
    setSources(s);
  };
  useEffect(() => {
    let active = true;
    api("/bootstrap")
      .then((data) => {
        if (!active) return;
        csrf = data.token;
        setBootstrap(data);
        return reload();
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!bootstrap) return;
    const timer = setInterval(() => reload().catch(() => {}), 3000);
    return () => clearInterval(timer);
  }, [!!bootstrap]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const navigate = (value) => {
    setSelected(null);
    setPage(value);
  };
  if (!bootstrap)
    return (
      <div className="startup">
        <BookOpen size={32} />
        <h1>Lesson Library</h1>
        {error ? (
          <ErrorMessage message={error} />
        ) : (
          <p>Opening your library…</p>
        )}
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("library")}>
          <span className="brand-mark">
            <BookOpen size={23} />
          </span>
          <span>Lesson Library</span>
        </button>
        <button
          className="primary sidebar-create"
          onClick={() => setCreating(true)}
        >
          <Plus size={18} /> Create a lesson
        </button>
        <nav aria-label="Main navigation">
          {[
            ["library", Grid2X2, "Video library"],
            ["sources", FolderOpen, "Sources & notes"],
            ["profile", UserRound, "Learning profile"],
          ].map(([id, Icon, label]) => (
            <button
              key={id}
              className={page === id ? "nav-item active" : "nav-item"}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "library" && <small>{lessons.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={page === "settings" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={19} /> Settings & connections
          </button>
        </div>
      </aside>
      <main className="main">
        {selected ? (
          <LessonDetail
            id={selected}
            onBack={() => setSelected(null)}
            onCreate={() => setCreating(true)}
          />
        ) : page === "library" ? (
          <Catalog
            lessons={lessons}
            open={setSelected}
            create={() => setCreating(true)}
          />
        ) : page === "sources" ? (
          <Sources sources={sources} reload={reload} notify={setToast} />
        ) : page === "profile" ? (
          <Profile notify={setToast} />
        ) : (
          <Settings
            bootstrap={bootstrap}
            update={setBootstrap}
            notify={setToast}
          />
        )}
      </main>
      {creating && (
        <CreateLesson
          sources={sources}
          defaultStyle={bootstrap.settings.style}
          close={() => setCreating(false)}
          created={async (lesson) => {
            await reload();
            setPage("library");
            setSelected(lesson.id);
            setCreating(false);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
function Catalog({ lessons, open, create }) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const filtered = lessons.filter(
    (l) =>
      (!query ||
        `${l.title} ${l.summary} ${l.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (filter === "all" ||
        (filter === "working" && isWorking(l.status)) ||
        l.status === filter),
  );
  const ready = lessons.filter((l) => l.status === "ready").length;
  return (
    <div className="page catalog-page">
      <div className="page-heading">
        <div>
          <h1>Video library</h1>
        </div>
        <button className="primary" onClick={create}>
          <Plus size={18} /> New lesson
        </button>
      </div>
      {lessons.length > 0 && (
        <div className="library-summary">
          <span>
            <Video size={16} />
            {ready} {ready === 1 ? "lesson" : "lessons"} ready
          </span>
          <span>
            <Clock3 size={16} />
            {Math.round(
              lessons.reduce((sum, l) => sum + (l.duration || 0), 0) / 60,
            )}{" "}
            minutes total
          </span>
        </div>
      )}
      <div className="library-toolbar">
        <div className="filter-tabs" aria-label="Filter lessons">
          {[
            ["all", "All lessons"],
            ["ready", "Ready"],
            ["working", "In progress"],
            ["error", "Failed"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "selected" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={17} />
          <input
            placeholder="Find a lesson…"
            aria-label="Search lessons"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {!lessons.length ? (
        <div className="empty-library">
          <h2>No videos yet</h2>
          <p>Create a lesson to add a video to your library.</p>
          <button className="primary" onClick={create}>
            Create your first lesson <ArrowRight size={18} />
          </button>
        </div>
      ) : !filtered.length ? (
        <div className="empty-small">
          <Search size={28} />
          <h2>No matching lessons</h2>
          <p>Try a different search or filter.</p>
          <button
            className="secondary"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Show all lessons
          </button>
        </div>
      ) : (
        <div className="video-grid">
          {filtered.map((lesson) => (
            <button
              className="video-card"
              key={lesson.id}
              onClick={() => open(lesson.id)}
            >
              <div className={`thumbnail ${lesson.style}`}>
                <img
                  src={fileUrl(lesson.id, "thumbnail.png")}
                  alt=""
                  loading="lazy"
                />
                {lesson.status === "ready" ? (
                  <>
                    <span className="play-circle">▶</span>
                    <span className="duration">{time(lesson.duration)}</span>
                  </>
                ) : (
                  <span
                    className={`status-pill ${lesson.status === "error" ? "failed" : ""}`}
                  >
                    {isWorking(lesson.status) && (
                      <LoaderCircle size={13} className="spin" />
                    )}
                    {lesson.status === "error" ? "Failed" : "Generating"}
                  </span>
                )}
              </div>
              <div className="card-meta">
                <span>{lesson.tags[0] || "Lesson"}</span>
                <span>{date(lesson.createdAt)}</span>
              </div>
              <h3>{lesson.title}</h3>
              <p>{lesson.summary}</p>
              <div className="card-footer">
                {lesson.status === "ready" ? (
                  <>
                    <span>
                      <FileText size={13} /> Transcript
                    </span>
                    <ArrowRight size={16} />
                  </>
                ) : (
                  <>
                    <span>{lesson.stage}</span>
                    <span>{Math.round(lesson.progress)}%</span>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function CreateLesson({ sources, defaultStyle, close, created }) {
  const [topic, setTopic] = useState(""),
    [goal, setGoal] = useState(""),
    [style, setStyle] = useState(defaultStyle),
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
        <div className="field">
          Choose a visual style
          <div className="style-picker">
            {[
              ["paper", "Paper", "Light"],
              ["midnight", "Midnight", "Dark"],
              ["sage", "Field notes", "Green"],
            ].map(([id, title, description]) => (
              <button
                type="button"
                key={id}
                className={`style-option ${id} ${style === id ? "chosen" : ""}`}
                onClick={() => setStyle(id)}
              >
                <div className="style-preview">
                  <span>
                    Lesson
                    <br />
                    preview
                  </span>
                  <i />
                </div>
                <strong>
                  {title}
                  {style === id && <Check size={15} />}
                </strong>
                <small>{description}</small>
              </button>
            ))}
          </div>
        </div>
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
function LessonDetail({ id, onBack, onCreate }) {
  const [lesson, setLesson] = useState(null),
    [tab, setTab] = useState("transcript"),
    [error, setError] = useState(""),
    [seconds, setSeconds] = useState(0),
    [showAnswer, setShowAnswer] = useState(false),
    [retrying, setRetrying] = useState(false);
  const player = useRef(null);
  useEffect(() => {
    let active = true;
    const load = () =>
      api(`/lessons/${id}`)
        .then((l) => {
          if (active) setLesson(l);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    load();
    const t = setInterval(load, 2500);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [id]);
  const seek = (t) => {
    if (player.current) {
      player.current.currentTime = t;
      player.current.play().catch(() => {});
    }
  };
  const retry = async () => {
    setRetrying(true);
    try {
      await post(`/lessons/${id}/retry`, {});
      setError("");
      setLesson(await api(`/lessons/${id}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setRetrying(false);
    }
  };
  if (!lesson)
    return (
      <div className="page">
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={16} /> Back to library
        </button>
        <ErrorMessage message={error} />
        <p>Opening lesson…</p>
      </div>
    );
  return (
    <div className="page lesson-page">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Back to library
      </button>
      <div className="lesson-title">
        <div className="eyebrow">{lesson.tags.join(" / ")}</div>
        <h1>{lesson.title}</h1>
        <p>{lesson.summary}</p>
      </div>
      <ErrorMessage message={error} />
      <div className="lesson-layout">
        <div className="lesson-content">
          {lesson.status === "ready" ? (
            <video
              key={id}
              ref={player}
              className="video-player"
              controls
              playsInline
              preload="metadata"
              poster={fileUrl(id, "thumbnail.png")}
              onTimeUpdate={(e) => setSeconds(e.target.currentTime)}
            >
              <source src={fileUrl(id, "video.mp4")} type="video/mp4" />
              <track
                kind="captions"
                src={fileUrl(id, "captions.vtt")}
                srcLang="en"
                label="English (approximate timing)"
              />
            </video>
          ) : (
            <div className={`generation-player ${lesson.style}`}>
              <h2>{lesson.stage}</h2>
              {lesson.status === "error" ? (
                <>
                  <p className="generation-error">{lesson.error}</p>
                  <button
                    className="primary"
                    onClick={retry}
                    disabled={retrying}
                  >
                    {retrying ? "Retrying…" : "Try again"}
                  </button>
                </>
              ) : (
                <>
                  <div className="progress-track">
                    <span style={{ width: `${lesson.progress}%` }} />
                  </div>
                  <p>You can explore the library while this finishes.</p>
                  <button className="text-button" onClick={onBack}>
                    Back to library <ArrowRight size={15} />
                  </button>
                </>
              )}
            </div>
          )}
          <div className="player-meta">
            <span>
              <Clock3 size={15} />
              {lesson.duration ? time(lesson.duration) : "Generating"}
            </span>
            <span>
              <BookOpen size={15} />
              {lesson.scenes.length || "—"} chapters
            </span>
            {lesson.status === "ready" && (
              <a
                className="text-button"
                href={fileUrl(id, "video.mp4")}
                download={`${lesson.title}.mp4`}
              >
                <ArrowDownToLine size={16} /> Download video
              </a>
            )}
          </div>
          <div className="detail-tabs" role="tablist">
            {[
              ["transcript", "Transcript"],
              ["notes", "Lesson notes"],
              ["context", "Sources & context"],
            ].map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "transcript" ? (
            <div className="transcript">
              {lesson.status === "ready" && (
                <div className="transcript-top">
                  <span>Click a chapter to jump to that moment.</span>
                  <a href={fileUrl(id, "transcript.md")} download>
                    <ArrowDownToLine size={15} /> Save transcript
                  </a>
                </div>
              )}
              {!lesson.scenes.length && (
                <p className="muted">
                  Your transcript will appear as the lesson takes shape.
                </p>
              )}
              {lesson.scenes.map((s, i) => (
                <div
                  key={i}
                  className={`transcript-chapter ${lesson.status === "ready" && seconds >= s.start && seconds < s.start + s.duration ? "current" : ""}`}
                >
                  <button
                    onClick={() => seek(s.start || 0)}
                    disabled={lesson.status !== "ready"}
                    aria-label={`Jump to ${s.title}`}
                  >
                    {s.start === undefined
                      ? String(i + 1).padStart(2, "0")
                      : time(s.start)}
                  </button>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.narration}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : tab === "notes" ? (
            <div className="lesson-notes">
              <span className="eyebrow">Learning objective</span>
              <h3>
                {lesson.learningObjective ||
                  "The lesson is still being planned."}
              </h3>
              {lesson.scenes.map((s, i) => (
                <p key={i} className="takeaway">
                  <CheckCircle2 size={18} />
                  {s.takeaway}
                </p>
              ))}
              {lesson.check && (
                <div className="knowledge-check">
                  <span className="eyebrow">Comprehension check</span>
                  <h3>{lesson.check.question}</h3>
                  <p>Think it through before revealing the explanation.</p>
                  <button
                    className="secondary"
                    onClick={() => setShowAnswer(!showAnswer)}
                  >
                    {showAnswer ? "Hide explanation" : "Reveal explanation"}
                  </button>
                  {showAnswer && (
                    <p className="check-answer">{lesson.check.answer}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="lesson-notes">
              <span className="eyebrow">Lesson context</span>
              <p>
                This snapshot preserves what the tutor used when it created your
                lesson.
              </p>
              {lesson.assumedKnowledge?.length > 0 && (
                <>
                  <h3>Starting assumptions</h3>
                  <ul>
                    {lesson.assumedKnowledge.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </>
              )}
              {lesson.context.sources.map((s) => (
                <details className="context-source" key={s.id}>
                  <summary>
                    <FileText size={16} />
                    {s.title}
                    {s.truncated && <small>Excerpt</small>}
                  </summary>
                  <pre>{s.excerpt}</pre>
                </details>
              ))}
              {lesson.context.brief && (
                <details className="context-source">
                  <summary>Conversation brief</summary>
                  <pre>{lesson.context.brief}</pre>
                </details>
              )}
              <details className="context-source">
                <summary>Learning profile at creation</summary>
                <pre>{lesson.context.profile}</pre>
              </details>
            </div>
          )}
        </div>
        <Chat
          id={id}
          seconds={seconds}
          ready={lesson.status === "ready"}
          seek={seek}
        />
      </div>
    </div>
  );
}
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
function Chat({ id, seconds, ready, seek }) {
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
function Sources({ sources, reload, notify }) {
  const [mode, setMode] = useState(null),
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
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Sources & notes</h1>
          <p>Import notes and select which to include in each lesson.</p>
        </div>
        <button className="primary" onClick={() => setMode("text")}>
          <Plus size={18} /> Add a source
        </button>
      </div>
      <ErrorMessage message={error} />
      <div className="import-cards">
        <button onClick={() => setMode("folder")}>
          <FolderOpen size={26} />
          <h3>Import Obsidian notes</h3>
          <p>Choose a folder, preview its notes, and select what to import.</p>
          <span>
            Browse notes <ArrowRight size={16} />
          </span>
        </button>
        <button onClick={() => setMode("text")}>
          <MessageCircle size={26} />
          <h3>Import text or a conversation</h3>
          <p>
            Paste a learning brief, or import a text file or chat JSON export.
          </p>
          <span>
            Add context <ArrowRight size={16} />
          </span>
        </button>
      </div>
      <div className="section-heading">
        <h2>Imported sources</h2>
        <span>
          {sources.length} {sources.length === 1 ? "source" : "sources"}
        </span>
      </div>
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
                <FileText size={21} />
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
                  {s.kind === "obsidian"
                    ? "Obsidian note"
                    : s.kind === "conversation"
                      ? "Conversation"
                      : "Note"}{" "}
                  · {s.characters.toLocaleString()} characters · Added{" "}
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
      {mode && (
        <ImportModal
          mode={mode}
          close={() => setMode(null)}
          done={async (count) => {
            setMode(null);
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
function ImportModal({ mode, close, done }) {
  const [title, setTitle] = useState(""),
    [content, setContent] = useState(""),
    [filename, setFilename] = useState(""),
    [folder, setFolder] = useState(""),
    [scan, setScan] = useState(null),
    [chosen, setChosen] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
  return (
    <Modal
      title={mode === "folder" ? "Import notes folder" : "Add source"}
      close={close}
      wide
    >
      {mode === "folder" ? (
        <>
          <p className="intro-copy">
            Enter an Obsidian vault or notes folder on this computer. We’ll copy
            only the notes you select. Originals stay where they are.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              work(async () => {
                setScan(await post("/sources/scan", { path: folder }));
                setChosen([]);
              });
            }}
          >
            <label className="field">
              Notes folder
              <input
                required
                placeholder="~/Documents/My Vault"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
              />
            </label>
            <button className="secondary" disabled={busy}>
              {busy ? "Looking…" : "Preview notes"} <Search size={16} />
            </button>
          </form>
          {scan && (
            <div className="notes-preview">
              <div className="section-heading">
                <span>
                  {scan.notes.length} notes found
                  {scan.capped ? " (first 500)" : ""}
                </span>
                <button
                  className="text-button"
                  onClick={() =>
                    setChosen(
                      chosen.length
                        ? []
                        : scan.notes.slice(0, 100).map((n) => n.path),
                    )
                  }
                >
                  {chosen.length ? "Clear selection" : "Select up to 100"}
                </button>
              </div>
              <div className="source-picker tall">
                {scan.notes.map((n) => (
                  <label key={n.path}>
                    <input
                      type="checkbox"
                      checked={chosen.includes(n.path)}
                      onChange={() =>
                        setChosen(
                          chosen.includes(n.path)
                            ? chosen.filter((p) => p !== n.path)
                            : [...chosen, n.path],
                        )
                      }
                    />
                    <FileText size={16} />
                    <span>{n.path}</span>
                  </label>
                ))}
                {!scan.notes.length && (
                  <p>No Markdown or text notes found in this folder.</p>
                )}
              </div>
              <button
                className="primary"
                disabled={busy || !chosen.length || chosen.length > 100}
                onClick={() =>
                  work(async () => {
                    const result = await post("/sources/import", {
                      root: scan.root,
                      paths: chosen,
                    });
                    done(result.length);
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
          onSubmit={(e) => {
            e.preventDefault();
            work(async () => {
              await post("/sources", { title, content, filename });
              done(1);
            });
          }}
        >
          <label className="upload-zone">
            <Upload size={22} />
            <span>Choose a Markdown, text, or JSON export file</span>
            <input
              type="file"
              accept=".md,.txt,.json"
              onChange={async (e) => {
                const f = e.target.files[0];
                if (!f) return;
                if (f.size > 3000000) {
                  setError(
                    "Choose a smaller export (up to 3 MB), or paste a relevant conversation.",
                  );
                  return;
                }
                setTitle(f.name.replace(/\.[^.]+$/, ""));
                setFilename(f.name);
                setContent(await f.text());
              }}
            />
          </label>
          <label className="field">
            Title
            <input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What I know about neural networks"
            />
          </label>
          <label className="field">
            Your notes or conversation
            <textarea
              required
              rows={9}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste a learning summary, an unresolved question, or notes you’d like to learn from…"
            />
          </label>
          <p className="fine-print">
            Chat exports are imported as reference text. This does not connect
            to or continuously sync your ChatGPT or Claude account.
          </p>
          <div className="modal-footer">
            <span />
            <button className="primary" disabled={busy}>
              {busy ? "Adding…" : "Add to sources"} <ArrowRight size={16} />
            </button>
          </div>
        </form>
      )}
      <ErrorMessage message={error} />
    </Modal>
  );
}
function Profile({ notify }) {
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
function Settings({ bootstrap, update, notify }) {
  const [settings, setSettings] = useState(bootstrap.settings),
    [tools, setTools] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refreshTools = () =>
    api("/doctor")
      .then(setTools)
      .catch((e) => setError(e.message));
  useEffect(() => {
    refreshTools();
  }, []);
  const change = (key, value) => setSettings({ ...settings, [key]: value });
  return (
    <div className="page narrow-page">
      <div className="page-heading">
        <div>
          <h1>Settings & connections</h1>
        </div>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const saved = await post("/settings", settings, "PUT");
            update({ ...bootstrap, settings: saved });
            notify("Settings saved");
            setError("");
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <section className="settings-section">
          <div className="settings-section-title">
            <Terminal size={21} />
            <div>
              <h2>Generation provider</h2>
              <p>
                Use the coding agent already installed and signed in on this
                computer.
              </p>
            </div>
          </div>
          <div className="two-fields">
            <label className="field">
              Agent
              <select
                aria-label="Agent"
                value={settings.provider}
                onChange={(e) => change("provider", e.target.value)}
              >
                <option value="codex">Codex</option>
                <option value="claude">Claude Code</option>
              </select>
            </label>
            <label className="field">
              Model <span className="optional">Optional</span>
              <input
                value={settings.model}
                onChange={(e) => change("model", e.target.value)}
                placeholder="Use the agent’s default"
              />
            </label>
          </div>
          <p className="fine-print">
            The app runs locally. Selected notes, your profile, and questions
            are sent through the chosen agent to its model provider. It does not
            automatically read your account’s chat history.
          </p>
        </section>
        <section className="settings-section">
          <div className="settings-section-title">
            <SlidersHorizontal size={21} />
            <div>
              <h2>Narration</h2>
              <p>
                System speech is ready on macOS. Use Piper for another local
                voice.
              </p>
            </div>
          </div>
          <div className="two-fields">
            <label className="field">
              Speech engine
              <select
                aria-label="Speech engine"
                value={settings.tts}
                onChange={(e) => change("tts", e.target.value)}
              >
                <option value="system">System speech (macOS / eSpeak)</option>
                <option value="piper">Piper (local model)</option>
              </select>
            </label>
            {settings.tts === "system" ? (
              <label className="field">
                Voice name <span className="optional">Optional</span>
                <input
                  value={settings.voice}
                  onChange={(e) => change("voice", e.target.value)}
                  placeholder="System default"
                />
              </label>
            ) : (
              <label className="field">
                Piper model path
                <input
                  required
                  value={settings.piperModel}
                  onChange={(e) => change("piperModel", e.target.value)}
                  placeholder="/path/to/voice.onnx"
                />
              </label>
            )}
          </div>
          {settings.tts === "system" && (
            <label className="field range-field">
              Speaking pace <span>{settings.speechRate} words / minute</span>
              <input
                type="range"
                min="100"
                max="260"
                step="5"
                value={settings.speechRate}
                onChange={(e) => change("speechRate", Number(e.target.value))}
              />
              <div>
                <small>Unhurried</small>
                <small>Brisk</small>
              </div>
            </label>
          )}
          <label className="field">
            Default visual style
            <select
              aria-label="Default visual style"
              value={settings.style}
              onChange={(e) => change("style", e.target.value)}
            >
              <option value="paper">Paper</option>
              <option value="midnight">Midnight</option>
              <option value="sage">Field notes</option>
            </select>
          </label>
        </section>
        <ErrorMessage message={error} />
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
          <Check size={16} />
        </button>
      </form>
      <section className="settings-section connection-section">
        <div className="section-heading">
          <h2>Local tools</h2>
          <button className="text-button" onClick={refreshTools}>
            Check again
          </button>
        </div>
        <div className="tools-grid">
          {tools ? (
            Object.entries(tools).map(([name, found]) => (
              <div key={name}>
                <span className={found ? "tool-dot found" : "tool-dot"} />
                <strong>{name}</strong>
                <span>{found ? "Installed" : "Not found"}</span>
              </div>
            ))
          ) : (
            <p>Checking your computer…</p>
          )}
        </div>
        <p className="fine-print">
          FFmpeg and FFprobe are required for videos. Sign in once with{" "}
          <code>codex login</code> or <code>claude</code>. Piper is optional. On
          macOS, list system voices with <code>say -v '?'</code>.
        </p>
      </section>
      <section className="settings-section">
        <div className="settings-section-title">
          <FolderOpen size={21} />
          <div>
            <h2>Library folder</h2>
            <p>
              Videos, transcripts, source snapshots, and discussions live here.
            </p>
          </div>
        </div>
        <code className="path-display">{bootstrap.library}</code>
        <p className="fine-print">
          To use another folder, start the app with <code>LEARNVID_HOME</code>{" "}
          set to that path. The UI and terminal use the same folder.
        </p>
      </section>
      <section className="terminal-example">
        <Terminal size={22} />
        <h2>Terminal commands</h2>
        <pre>
          learnvid create "How does attention work?"
          <br />
          learnvid list
          <br />
          learnvid ask &lt;lesson-id&gt; "Explain chapter two"
        </pre>
        <p className="fine-print">
          Run <code>npm link</code> in the app repository to install the
          command. The repository also includes a companion skill for Codex and
          Claude.
        </p>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
