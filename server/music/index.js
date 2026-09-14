const finite = (x, name) => {
  if (!Number.isFinite(x)) throw new Error(`${name} must be finite`);
  return x;
};
const durations = new Map([
  [0.25, "16"],
  [0.5, "8"],
  [1, "q"],
  [2, "h"],
  [4, "w"],
]);
const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function pitchInfo(pitch) {
  if (pitch === null) return null;
  if (typeof pitch !== "string" || !/^[A-G](?:#|b)?[0-8]$/.test(pitch))
    throw new Error(
      "Pitch must be C4-style (one optional # or b), octave 0–8, or null for a rest",
    );
  const [, letter, accidental, octave] = pitch.match(/^([A-G])([#b]?)([0-8])$/);
  const midi =
    (Number(octave) + 1) * 12 +
    semitones[letter] +
    (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
  return {
    pitch,
    midi,
    frequency: 440 * 2 ** ((midi - 69) / 12),
    key: `${letter.toLowerCase()}${accidental}/${octave}`,
    staffKey: `${letter.toLowerCase()}/${octave}`,
    accidental,
  };
}

// Durations are quarter-note beats. One phrase is a complete bar, without ties.
export function musicPhrase({ notes, tempo = 90, beatsPerBar = 4 }) {
  finite(tempo, "tempo");
  if (tempo < 30 || tempo > 240)
    throw new Error("tempo must be 30–240 quarter notes per minute");
  if (!Number.isInteger(beatsPerBar) || beatsPerBar < 1 || beatsPerBar > 12)
    throw new Error("beatsPerBar must be an integer 1–12");
  if (!Array.isArray(notes) || !notes.length || notes.length > 48)
    throw new Error("Supply 1–48 notes/rests");
  const ids = new Set();
  let beat = 0;
  const events = notes.map((note) => {
    if (typeof note.id !== "string" || !note.id || ids.has(note.id))
      throw new Error("Notes need nonempty unique IDs");
    ids.add(note.id);
    if (!durations.has(note.beats))
      throw new Error("Supported note beats: 0.25, 0.5, 1, 2, 4");
    const pitch = pitchInfo(note.pitch),
      velocity = note.velocity ?? 0.8;
    finite(velocity, "velocity");
    if (velocity <= 0 || velocity > 1)
      throw new Error("velocity must be greater than 0 and at most 1");
    const event = Object.freeze({
      id: note.id,
      pitch: note.pitch,
      beats: note.beats,
      beat,
      onset: (beat * 60) / tempo,
      duration: (note.beats * 60) / tempo,
      velocity,
      ...(pitch || {}),
    });
    beat += note.beats;
    return event;
  });
  if (beat !== beatsPerBar)
    throw new Error(
      `Phrase must fill one ${beatsPerBar}/4 bar; received ${beat} beats`,
    );
  return Object.freeze({
    tempo,
    beatsPerBar,
    duration: (beat * 60) / tempo,
    events: Object.freeze(events),
  });
}

export function placePhrase(phrase, start) {
  finite(start, "start");
  if (start < 0) throw new Error("start must be nonnegative");
  const events = Object.freeze(
    phrase.events.map((e) =>
      Object.freeze({ ...e, onset: finite(start + e.onset, "onset") }),
    ),
  );
  return Object.freeze({
    start,
    end: finite(start + phrase.duration, "end"),
    events,
    activeAt(seconds) {
      finite(seconds, "seconds");
      return events
        .filter((e) => seconds >= e.onset && seconds < e.onset + e.duration)
        .map((e) => e.id);
    },
  });
}

export async function musicNotation(
  container,
  {
    phrase,
    width = 1000,
    height = 230,
    scale = 1.6,
    color = "#233746",
    activeColor = "#007e80",
  },
) {
  if (!container?.isConnected)
    throw new Error("Notation needs a connected container");
  for (const [name, x] of Object.entries({ width, height, scale }))
    if (!Number.isFinite(x) || x <= 0)
      throw new Error(`${name} must be positive and finite`);
  if (width / scale < 240 || height / scale < 120)
    throw new Error(
      "Notation area is too small; allow at least 240×120 logical pixels",
    );
  const V = await import("vexflow/bravura");
  await document.fonts.ready;
  for (const name of ["Bravura", "Academico"])
    if (
      ![...document.fonts].some(
        (f) => f.family === name && f.status === "loaded",
      )
    )
      throw new Error(`Bundled ${name} notation font did not load`);
  const renderer = new V.Renderer(container, V.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();
  context.scale(scale, scale);
  context.setFillStyle(color);
  context.setStrokeStyle(color);
  const stave = new V.Stave(10, 20, width / scale - 20);
  stave
    .addClef("treble")
    .addTimeSignature(`${phrase.beatsPerBar}/4`)
    .setContext(context)
    .draw();
  const notes = phrase.events.map((e) => {
    const n = new V.StaveNote({
      clef: "treble",
      keys: [e.pitch === null ? "b/4" : e.key],
      duration: durations.get(e.beats) + (e.pitch === null ? "r" : ""),
    });
    if (e.accidental) n.addModifier(new V.Accidental(e.accidental), 0);
    // Explicit natural cancellations make every pitch's spelling unambiguous,
    // even after an earlier accidental on this staff position.
    if (
      e.pitch !== null &&
      !e.accidental &&
      phrase.events.some(
        (p) =>
          p.beat < e.beat &&
          p.pitch !== null &&
          p.staffKey === e.staffKey &&
          p.accidental,
      )
    )
      n.addModifier(new V.Accidental("n"), 0);
    return n;
  });
  const voice = new V.Voice({ numBeats: phrase.beatsPerBar, beatValue: 4 });
  voice.addTickables(notes);
  new V.Formatter().joinVoices([voice]).format([voice], width / scale - 125);
  voice.draw(context, stave);
  const groups = new Map(
    notes.map((n, i) => [phrase.events[i].id, n.getSVGElement()]),
  );
  for (const [id, g] of groups) {
    if (!g) throw new Error(`Missing notation group for ${id}`);
    g.dataset.musicNote = id;
  }
  const anchors = Object.fromEntries(
    notes.map((n, i) => [
      phrase.events[i].id,
      { x: n.getAbsoluteX() * scale, y: n.getYs()[0] * scale },
    ]),
  );
  return {
    renderer,
    stave,
    notes,
    anchors,
    highlight(ids = []) {
      const selected = new Set(ids);
      for (const id of selected)
        if (!groups.has(id)) throw new Error(`Unknown note ID: ${id}`);
      for (const [id, g] of groups) {
        const ink = selected.has(id) ? activeColor : color;
        g.setAttribute("fill", ink);
        g.setAttribute("stroke", ink);
        for (const child of g.querySelectorAll("[fill],[stroke]")) {
          if (child.getAttribute("fill") !== "none")
            child.setAttribute("fill", ink);
          if (
            child.hasAttribute("stroke") &&
            child.getAttribute("stroke") !== "none"
          )
            child.setAttribute("stroke", ink);
        }
      }
    },
  };
}

export async function renderMusicAudio({
  events,
  duration,
  sampleRate = 24000,
  volumeDb = -15,
}) {
  finite(duration, "duration");
  finite(volumeDb, "volumeDb");
  if (duration <= 0 || duration > 180)
    throw new Error("Music audio duration must be in (0, 180] seconds");
  if (![24000, 44100, 48000].includes(sampleRate))
    throw new Error("Use sampleRate 24000, 44100, or 48000");
  if (volumeDb < -60 || volumeDb > -6)
    throw new Error("volumeDb must be between -60 and -6");
  if (!Array.isArray(events) || events.length > 256)
    throw new Error("Supply at most 256 timed musical events");
  const checked = events.map((e) => {
    const p = pitchInfo(e.pitch);
    finite(e.onset, "onset");
    finite(e.duration, "event duration");
    finite(e.velocity, "velocity");
    if (
      e.onset < 0 ||
      e.duration <= 0 ||
      e.onset + e.duration > duration + 1e-8 ||
      e.velocity <= 0 ||
      e.velocity > 1
    )
      throw new Error(
        "Musical events must fit the chapter with positive duration and velocity in (0, 1]",
      );
    return { ...e, frequency: p?.frequency };
  });
  const Tone = await import("tone");
  const synths = [];
  try {
    const buffer = await Tone.Offline(
      () => {
        for (const e of checked)
          if (e.pitch !== null) {
            const synth = new Tone.Synth({
              oscillator: { type: "sine" },
              envelope: {
                attack: Math.min(0.01, e.duration * 0.05),
                decay: Math.min(0.08, e.duration * 0.15),
                sustain: 0.7,
                release: Math.min(0.05, e.duration * 0.1),
              },
              volume: volumeDb,
            }).toDestination();
            synths.push(synth);
            synth.triggerAttackRelease(
              e.frequency,
              e.duration * 0.85,
              e.onset,
              e.velocity,
            );
          }
      },
      duration,
      1,
      sampleRate,
    );
    const samples = new Float32Array(buffer.getChannelData(0));
    buffer.dispose();
    return { sampleRate, channels: [samples] };
  } finally {
    for (const synth of synths) synth.dispose();
  }
}
