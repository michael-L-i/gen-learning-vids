import { useEffect, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  FolderOpen,
  Grid2X2,
  Plus,
  Settings2,
  UserRound,
} from "lucide-react";
import { api, setToken } from "./api.js";
import { ErrorMessage } from "./components/ui.jsx";
import { Catalog } from "./views/Catalog.jsx";
import { CreateLesson } from "./views/CreateLesson.jsx";
import { LessonDetail } from "./views/LessonDetail.jsx";
import { Sources } from "./views/Sources.jsx";
import { Profile } from "./views/Profile.jsx";
import { Settings } from "./views/Settings.jsx";

export function App() {
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
        setToken(data.token);
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
          defaultPresentation={bootstrap.settings.presentation}
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
