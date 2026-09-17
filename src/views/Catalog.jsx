import { useState } from "react";
import {
  ArrowRight,
  Clock3,
  FileText,
  LoaderCircle,
  Plus,
  Search,
  Video,
} from "lucide-react";
import { date, fileUrl, isWorking, time } from "../format.js";

export function Catalog({ lessons, open, create }) {
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
