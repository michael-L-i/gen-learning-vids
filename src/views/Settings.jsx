import { useEffect, useRef, useState } from "react";
import {
  Check,
  FolderOpen,
  LoaderCircle,
  SlidersHorizontal,
  Terminal,
  Video,
} from "lucide-react";
import { kokoroVoices } from "../../server/speech-options.js";
import { api, post } from "../api.js";
import { ErrorMessage, PresentationSelect } from "../components/ui.jsx";

export function Settings({ bootstrap, update, notify }) {
  const [settings, setSettings] = useState(bootstrap.settings),
    [tools, setTools] = useState(null),
    [preview, setPreview] = useState(""),
    [previewBusy, setPreviewBusy] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refreshTools = () =>
    api("/doctor")
      .then(setTools)
      .catch((e) => setError(e.message));
  useEffect(() => {
    refreshTools();
  }, []);
  const previewVersion = useRef(0);
  const change = (key, value) => {
    setSettings({ ...settings, [key]: value });
    setPreview("");
    previewVersion.current++;
  };
  const previewVoice = async () => {
    const version = ++previewVersion.current;
    setPreviewBusy(true);
    setError("");
    setPreview("");
    try {
      const result = await post("/speech/preview", { settings });
      if (version === previewVersion.current) setPreview(result.url);
    } catch (e) {
      if (version === previewVersion.current) setError(e.message);
    } finally {
      setPreviewBusy(false);
    }
  };
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
              <p>Select a voice and preview it before creating a video.</p>
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
                <option value="kokoro">Kokoro — local neural speech</option>
                <option value="system">System speech (macOS / eSpeak)</option>
                <option value="piper">Piper (local model)</option>
              </select>
            </label>
            {settings.tts === "kokoro" ? (
              <label className="field">
                Voice
                <select
                  aria-label="Narration voice"
                  value={settings.kokoroVoice}
                  onChange={(e) => change("kokoroVoice", e.target.value)}
                >
                  {kokoroVoices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : settings.tts === "system" ? (
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
          {settings.tts === "kokoro" && (
            <>
              <p className="fine-print">
                The first use downloads a speech model (about 100 MB). After
                that, narration runs offline on your computer. No API key is
                needed.
              </p>
              <label className="field range-field">
                Speed <span>{settings.speechSpeed.toFixed(2)}×</span>
                <input
                  aria-label="Narration speed"
                  type="range"
                  min="0.75"
                  max="1.5"
                  step="0.05"
                  value={settings.speechSpeed}
                  onChange={(e) =>
                    change("speechSpeed", Number(e.target.value))
                  }
                />
              </label>
            </>
          )}
          <div className="speech-preview">
            <button
              type="button"
              className="secondary"
              disabled={previewBusy}
              onClick={previewVoice}
            >
              {previewBusy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Video size={16} />
              )}{" "}
              {previewBusy ? "Preparing preview…" : "Preview voice"}
            </button>
            {preview && (
              <audio
                aria-label="Voice preview"
                key={preview}
                src={preview}
                controls
                autoPlay
              />
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
          <PresentationSelect
            label="Default presentation"
            value={settings.presentation}
            onChange={(value) => change("presentation", value)}
          />
          <label className="field">
            Default color palette
            <select
              aria-label="Default color palette"
              value={settings.style}
              onChange={(e) => change("style", e.target.value)}
            >
              <option value="auto">Auto</option>
              <option value="paper">Paper</option>
              <option value="midnight">Midnight</option>
              <option value="sage">Field notes</option>
            </select>
          </label>
        </section>
        <ErrorMessage message={error} />
        <section className="settings-section">
          <h2>Animation tools</h2>
          <p>
            2D animation, Three.js scenes, and chemical diagrams are available
            through the local agent. The browser runtime downloads on first use.
          </p>
          <label className="field">
            Blender
            <select
              value={settings.blenderEnabled ? "enabled" : "disabled"}
              onChange={(e) =>
                change("blenderEnabled", e.target.value === "enabled")
              }
            >
              <option value="disabled">Disabled</option>
              <option value="enabled">
                Enabled — requires Blender installed
              </option>
            </select>
          </label>
        </section>
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
