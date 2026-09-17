import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Captions,
  CaptionsOff,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { time } from "../format.js";

const SKIP = 5;
const SPEEDS = [1, 1.25, 1.5, 2, 0.75];

// A compact custom player: click or space to play, arrows or buttons to skip
// five seconds, chapter ticks on the progress bar, captions, speed, fullscreen.
export const VideoPlayer = forwardRef(function VideoPlayer(
  { src, poster, captions, chapters = [], onTimeUpdate },
  ref,
) {
  const video = useRef(null),
    shell = useRef(null),
    hideTimer = useRef(null);
  const [playing, setPlaying] = useState(false),
    [current, setCurrent] = useState(0),
    [duration, setDuration] = useState(0),
    [buffered, setBuffered] = useState(0),
    [muted, setMuted] = useState(false),
    [volume, setVolume] = useState(1),
    [speed, setSpeed] = useState(1),
    [showCaptions, setShowCaptions] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [idle, setIdle] = useState(false),
    [flash, setFlash] = useState(null);

  useImperativeHandle(ref, () => ({
    seek(t) {
      const v = video.current;
      if (!v) return;
      v.currentTime = t;
      v.play().catch(() => {});
    },
  }));

  const wake = () => {
    setIdle(false);
    clearTimeout(hideTimer.current);
    if (video.current && !video.current.paused)
      hideTimer.current = setTimeout(() => setIdle(true), 2500);
  };
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  useEffect(() => {
    const onChange = () =>
      setFullscreen(document.fullscreenElement === shell.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => {
    const track = video.current?.textTracks?.[0];
    if (track) track.mode = showCaptions ? "showing" : "hidden";
  }, [showCaptions, src]);

  const showFlash = (kind) => {
    setFlash({ kind, key: Date.now() });
  };
  const togglePlay = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };
  const skip = (delta) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.max(
      0,
      Math.min(v.duration || 0, v.currentTime + delta),
    );
    showFlash(delta < 0 ? "back" : "forward");
    wake();
  };
  const toggleMute = () => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };
  const changeVolume = (value) => {
    const v = video.current;
    if (!v) return;
    v.volume = value;
    v.muted = value === 0;
    setVolume(value);
    setMuted(v.muted);
  };
  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    if (video.current) video.current.playbackRate = next;
    setSpeed(next);
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else shell.current?.requestFullscreen?.().catch(() => {});
  };
  const onKey = (e) => {
    if (e.target.tagName === "INPUT" && e.key !== " ") return;
    const actions = {
      " ": togglePlay,
      k: togglePlay,
      ArrowLeft: () => skip(-SKIP),
      ArrowRight: () => skip(SKIP),
      j: () => skip(-SKIP * 2),
      l: () => skip(SKIP * 2),
      m: toggleMute,
      c: () => setShowCaptions((s) => !s),
      f: toggleFullscreen,
    };
    const action = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (!action) return;
    e.preventDefault();
    action();
    wake();
  };
  const onProgress = (e) => {
    const v = e.target;
    if (!v.duration) return;
    let end = 0;
    for (let i = 0; i < v.buffered.length; i++)
      if (v.buffered.start(i) <= v.currentTime)
        end = Math.max(end, v.buffered.end(i));
    setBuffered(end / v.duration);
  };
  const played = duration ? (current / duration) * 100 : 0;
  return (
    <div
      ref={shell}
      className={`player ${idle && playing ? "idle" : ""} ${fullscreen ? "fullscreen" : ""}`}
      tabIndex={0}
      aria-label="Video player"
      onKeyDown={onKey}
      onMouseMove={wake}
      onMouseLeave={() => playing && setIdle(true)}
    >
      <video
        ref={video}
        className="video-player"
        playsInline
        preload="metadata"
        poster={poster}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onPlay={() => {
          setPlaying(true);
          wake();
        }}
        onPause={() => {
          setPlaying(false);
          setIdle(false);
        }}
        onTimeUpdate={(e) => {
          setCurrent(e.target.currentTime);
          onTimeUpdate?.(e.target.currentTime);
        }}
        onDurationChange={(e) => setDuration(e.target.duration || 0)}
        onProgress={onProgress}
        onVolumeChange={(e) => {
          setMuted(e.target.muted);
          setVolume(e.target.volume);
        }}
      >
        <source src={src} type="video/mp4" />
        {captions && (
          <track
            kind="captions"
            src={captions}
            srcLang="en"
            label="English (approximate timing)"
          />
        )}
      </video>
      {flash && (
        <div
          key={flash.key}
          className={`player-flash ${flash.kind}`}
          aria-hidden="true"
        >
          {flash.kind === "back" ? (
            <RotateCcw size={22} />
          ) : (
            <RotateCw size={22} />
          )}
          <span>{SKIP} s</span>
        </div>
      )}
      {!playing && (
        <div className="player-big-play" aria-hidden="true">
          <Play size={30} fill="currentColor" />
        </div>
      )}
      <div className="player-controls">
        <div className="player-seek">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            aria-label="Seek"
            aria-valuetext={`${time(current)} of ${time(duration)}`}
            style={{
              "--played": `${played}%`,
              "--buffered": `${buffered * 100}%`,
            }}
            onChange={(e) => {
              const t = Number(e.target.value);
              if (video.current) video.current.currentTime = t;
              setCurrent(t);
            }}
          />
          {duration > 0 &&
            chapters.map((c, i) =>
              i > 0 && c.start ? (
                <span
                  key={i}
                  className="player-chapter"
                  style={{ left: `${(c.start / duration) * 100}%` }}
                  title={c.title}
                />
              ) : null,
            )}
        </div>
        <div className="player-row">
          <button onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
            {playing ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" />
            )}
          </button>
          <button
            onClick={() => skip(-SKIP)}
            aria-label={`Back ${SKIP} seconds`}
          >
            <RotateCcw size={18} />
            <small>{SKIP}</small>
          </button>
          <button
            onClick={() => skip(SKIP)}
            aria-label={`Forward ${SKIP} seconds`}
          >
            <RotateCw size={18} />
            <small>{SKIP}</small>
          </button>
          <span className="player-time">
            {time(current)} <em>/</em> {time(duration)}
          </span>
          <span className="player-spacer" />
          {captions && (
            <button
              onClick={() => setShowCaptions((s) => !s)}
              aria-label={showCaptions ? "Hide captions" : "Show captions"}
              aria-pressed={showCaptions}
            >
              {showCaptions ? (
                <Captions size={19} />
              ) : (
                <CaptionsOff size={19} />
              )}
            </button>
          )}
          <button
            className="player-speed"
            onClick={cycleSpeed}
            aria-label={`Playback speed ${speed}x`}
          >
            {speed}×
          </button>
          <div className="player-volume">
            <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
              {muted || volume === 0 ? (
                <VolumeX size={19} />
              ) : (
                <Volume2 size={19} />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              aria-label="Volume"
              onChange={(e) => changeVolume(Number(e.target.value))}
            />
          </div>
          <button
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
          >
            {fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
          </button>
        </div>
      </div>
    </div>
  );
});
