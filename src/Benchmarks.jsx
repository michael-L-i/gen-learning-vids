import React, { useEffect, useState } from "react";
import { Play, RefreshCw, Download, Check } from "lucide-react";
import "./benchmarks.css";
const url = (run, key, name) =>
  `/api/benchmarks/runs/${run}/cases/${key}/files/${name}`;
const labels = {
  agent: "Prompt generation",
  reference: "Reference storyboard",
  replay: "Storyboard replay",
};
const dimensions = ["correctness", "clarity", "layout", "motion", "style"];
const emptyReview = () => ({
  notes: "",
  seconds: null,
  verdict: "unreviewed",
  scores: Object.fromEntries(dimensions.map((d) => [d, null])),
  comparedWith: null,
  preference: "none",
});
export default function Benchmarks({ api, post }) {
  const [cases, setCases] = useState([]),
    [runs, setRuns] = useState([]),
    [runId, setRunId] = useState(""),
    [compareId, setCompareId] = useState(""),
    [key, setKey] = useState(""),
    [selected, setSelected] = useState([]),
    [mode, setMode] = useState("agent"),
    [label, setLabel] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = async () => {
    const data = await api("/benchmarks/runs");
    setRuns(data);
    setRunId((id) => id || data[0]?.id || "");
  };
  useEffect(() => {
    let active = true;
    api("/benchmarks/cases")
      .then((data) => {
        if (active) {
          setCases(data);
          setKey(data[0]?.id || "");
          setSelected(data.map((c) => c.id));
        }
      })
      .catch((e) => setError(e.message));
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(
      () => refresh().catch((e) => setError(e.message)),
      3000,
    );
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const current = runs.find((r) => r.id === runId),
    comparison = runs.find((r) => r.id === compareId);
  const currentCase = current?.cases.find((c) => c.id === key),
    comparisonCase = comparison?.cases.find((c) => c.id === key);
  const definition = currentCase?.definition || cases.find((c) => c.id === key);
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await post("/benchmarks/runs", {
        mode,
        label,
        caseIds: selected,
        ...(mode === "replay" ? { fromRun: runId } : {}),
      });
      await refresh();
      setRunId(r.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page benchmark-page">
      <div className="page-heading">
        <h1>Benchmarks</h1>
        <button
          className="secondary"
          onClick={() => refresh().catch((e) => setError(e.message))}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <details className="bench-launch" open={!runs.length}>
        <summary>New run</summary>
        <div className="bench-controls">
          <label className="field">
            Run type
            <select
              aria-label="Run type"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              {Object.entries(labels).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Run label
            <input
              placeholder="e.g. Motion baseline 01"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={
              busy || !selected.length || (mode === "replay" && !current)
            }
            onClick={start}
          >
            <Play size={16} />
            {busy ? "Starting…" : "Generate clips"}
          </button>
        </div>
        <p className="bench-muted">
          {mode === "agent"
            ? "Generates a new storyboard from each prompt using your configured local agent and voice."
            : mode === "reference"
              ? "Renders the authored fixtures. Tests the renderer; does not test prompt generation."
              : "Renders saved storyboards from the selected run with the current engine and voice settings."}
        </p>
        <div className="bench-case-checks">
          {cases.map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={(e) =>
                  setSelected((old) =>
                    e.target.checked
                      ? [...old, c.id]
                      : old.filter((id) => id !== c.id),
                  )
                }
              />
              {c.subject}
            </label>
          ))}
        </div>
      </details>
      <div className="bench-controls bench-run-selects">
        <label className="field">
          Run
          <select
            aria-label="Run"
            value={runId}
            onChange={(e) => {
              setRunId(e.target.value);
              setCompareId((id) => (id === e.target.value ? "" : id));
            }}
          >
            <option value="">Select a run</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label} · {r.status}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Compare with
          <select
            aria-label="Compare with"
            value={compareId}
            onChange={(e) => setCompareId(e.target.value)}
          >
            <option value="">No comparison</option>
            {runs
              .filter((r) => r.id !== runId)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} · {labels[r.mode]}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="bench-workspace">
        <aside className="bench-case-list" aria-label="Benchmark cases">
          {cases.map((c) => {
            const result = current?.cases.find((i) => i.id === c.id);
            return (
              <button
                className={key === c.id ? "active" : ""}
                key={c.id}
                onClick={() => setKey(c.id)}
              >
                <strong>{c.subject}</strong>
                <span>{c.title}</span>
                <small>
                  {result?.status || "Not in run"}
                  {current?.feedback?.[c.id]?.verdict &&
                  current.feedback[c.id].verdict !== "unreviewed"
                    ? ` · ${current.feedback[c.id].verdict}`
                    : ""}
                </small>
              </button>
            );
          })}
        </aside>
        <section className="bench-detail">
          {definition && (
            <>
              <h2>{definition.title}</h2>
              {current && (
                <p className="bench-muted">
                  {labels[current.mode]} · {current.engine.version} ·{" "}
                  {current.engine.hash.slice(0, 8)} · {current.stage}
                </p>
              )}
              <div
                className={
                  comparison ? "bench-players compare" : "bench-players"
                }
              >
                <Clip
                  key={`${runId}:${key}`}
                  run={current}
                  item={currentCase}
                  title="Current run"
                />
                {comparison && (
                  <Clip
                    key={`${compareId}:${key}`}
                    run={comparison}
                    item={comparisonCase}
                    title="Comparison"
                  />
                )}
              </div>
              {comparisonCase &&
                currentCase &&
                comparisonCase.inputHash !== currentCase.inputHash && (
                  <p className="bench-notice">
                    These runs used different benchmark inputs.
                  </p>
                )}
              {comparison && current && comparison.mode !== current.mode && (
                <p className="bench-notice">
                  These runs use different generation modes:{" "}
                  {labels[current.mode]} and {labels[comparison.mode]}.
                </p>
              )}
              <details className="bench-spec">
                <summary>Prompt, style & criteria</summary>
                <p>{definition.prompt}</p>
                <dl>
                  <dt>Learner</dt>
                  <dd>{definition.learner}</dd>
                  <dt>Style brief</dt>
                  <dd>{definition.styleBrief}</dd>
                  <dt>Variation key</dt>
                  <dd>
                    {definition.variationKey} · target{" "}
                    {definition.targetSeconds}s
                  </dd>
                </dl>
                <ul>
                  {definition.criteria.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </details>
              {currentCase?.status === "ready" && (
                <Review
                  key={`${runId}:${key}`}
                  run={current}
                  item={currentCase}
                  comparison={comparisonCase ? comparison : null}
                  post={post}
                  refresh={refresh}
                />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
function Clip({ run, item, title }) {
  const [seconds, setSeconds] = useState(0),
    [failed, setFailed] = useState(false);
  if (!run || !item)
    return (
      <div className="bench-empty">
        {run
          ? "This case is not in this run."
          : "Create or select a run to view clips."}
      </div>
    );
  return (
    <div className="bench-clip">
      <h3>
        {title} <span>{run.label}</span>
      </h3>
      {item.status === "ready" ? (
        <>
          <video
            controls
            preload="metadata"
            poster={url(run.id, item.id, "thumbnail.png")}
            onTimeUpdate={(e) => setSeconds(e.currentTarget.currentTime)}
            onError={() => setFailed(true)}
            src={url(run.id, item.id, "video.mp4")}
          >
            <track
              kind="captions"
              srcLang="en"
              label="English"
              src={url(run.id, item.id, "captions.vtt")}
            />
          </video>
          {failed && (
            <p role="alert">Video could not load. Check the saved run files.</p>
          )}
          <div className="bench-clip-meta">
            <span>
              {seconds.toFixed(1)} / {item.duration.toFixed(1)}s · 720p · 30 fps
            </span>
            <a href={url(run.id, item.id, "video.mp4")} download>
              <Download size={14} /> MP4
            </a>
          </div>
          <div className="bench-file-links">
            {[
              ["transcript.md", "Transcript"],
              ["storyboard.json", "Storyboard"],
              ["timeline-0.json", "Timing"],
              ["checks-0.json", "Checks"],
            ].map(([file, label]) => (
              <a
                key={file}
                href={url(run.id, item.id, file)}
                target="_blank"
                rel="noreferrer"
              >
                {label}
              </a>
            ))}
          </div>
          <details>
            <summary>
              {item.checks?.warnings.length || 0} layout warnings
            </summary>
            <p className="bench-muted">
              Automated checks cover text bounds and timeline structure. Factual
              accuracy and visual quality need review.
            </p>
            {item.checks?.warnings.map((w, i) => (
              <p key={i}>
                {w.node}: {w.issue}
                {w.seconds !== undefined ? ` at ${w.seconds}s` : ""}
              </p>
            ))}
          </details>
        </>
      ) : (
        <div className="bench-empty">
          <strong>{item.status}</strong>
          <p>{item.error || run.stage}</p>
        </div>
      )}
    </div>
  );
}
function Review({ run, item, comparison, post, refresh }) {
  const [value, setValue] = useState(run.feedback?.[item.id] || emptyReview()),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await post(
        `/benchmarks/runs/${run.id}/cases/${item.id}/feedback`,
        {
          ...value,
          comparedWith: comparison?.id || null,
          preference: comparison ? value.preference : "none",
        },
        "PUT",
      );
      await refresh();
      setMessage("Feedback saved");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="bench-review" onSubmit={save}>
      <h3>Review</h3>
      <div className="bench-scores">
        {dimensions.map((d) => (
          <label className="field" key={d}>
            {d[0].toUpperCase() + d.slice(1)}
            <select
              aria-label={`${d} score`}
              value={value.scores[d] ?? ""}
              onChange={(e) =>
                setValue({
                  ...value,
                  scores: {
                    ...value.scores,
                    [d]: e.target.value ? Number(e.target.value) : null,
                  },
                })
              }
            >
              <option value="">Unrated</option>
              {[1, 2, 3, 4, 5].map((v) => (
                <option key={v} value={v}>
                  {v}
                  {v === 1 ? " · Poor" : v === 5 ? " · Strong" : ""}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="bench-controls">
        <label className="field">
          Decision
          <select
            aria-label="Decision"
            value={value.verdict}
            onChange={(e) => setValue({ ...value, verdict: e.target.value })}
          >
            <option value="unreviewed">Unreviewed</option>
            <option value="keep">Keep</option>
            <option value="revise">Revise</option>
          </select>
        </label>
        <label className="field">
          Timestamp (seconds)
          <input
            type="number"
            min="0"
            max={item.duration}
            step="0.1"
            value={value.seconds ?? ""}
            onChange={(e) =>
              setValue({
                ...value,
                seconds: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </label>
        {comparison && (
          <label className="field">
            Preferred clip
            <select
              aria-label="Preferred clip"
              value={value.preference}
              onChange={(e) =>
                setValue({ ...value, preference: e.target.value })
              }
            >
              <option value="none">Not compared</option>
              <option value="current">Current run</option>
              <option value="comparison">Comparison run</option>
              <option value="tie">Tie</option>
            </select>
          </label>
        )}
      </div>
      <label className="field">
        Notes
        <textarea
          aria-label="Notes"
          rows={3}
          value={value.notes}
          placeholder="What should change? Refer to a timestamp if useful."
          onChange={(e) => setValue({ ...value, notes: e.target.value })}
        />
      </label>
      <div className="bench-save">
        <button className="secondary" disabled={busy}>
          <Check size={16} />
          {busy ? "Saving…" : "Save feedback"}
        </button>
        <span role="status">{message}</span>
      </div>
    </form>
  );
}
