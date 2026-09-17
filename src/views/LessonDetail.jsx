import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
} from "lucide-react";
import { api, post } from "../api.js";
import { fileUrl, time } from "../format.js";
import { ErrorMessage } from "../components/ui.jsx";
import { Chat } from "./Chat.jsx";
import { VideoPlayer } from "./VideoPlayer.jsx";

export function LessonDetail({ id, onBack, onCreate }) {
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
  const seek = (t) => player.current?.seek(t);
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
            <VideoPlayer
              key={id}
              ref={player}
              src={fileUrl(id, "video.mp4")}
              poster={fileUrl(id, "thumbnail.png")}
              captions={fileUrl(id, "captions.vtt")}
              chapters={lesson.scenes}
              onTimeUpdate={setSeconds}
            />
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
              {lesson.imageAssets?.length > 0 && (
                <p>
                  <a href={fileUrl(id, "image-credits.md")} download>
                    Download image credits
                  </a>
                </p>
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
