# Music notation and recorded sound

Import `@lesson-library/music` for real VexFlow notation and Tone.js synthesis.
Both use the same immutable note events; an authored audio export includes the
sound in the final MP4. Calling live browser playback alone does not record it.

```js
import { musicPhrase, placePhrase, musicNotation, renderMusicAudio }
  from '@lesson-library/music';
export async function buildScene(root, context) {
  const phrase = musicPhrase({ tempo: 90, notes: [
    {id:'quarter', pitch:'C5', beats:1},
    {id:'eighth-a', pitch:'D5', beats:0.5},
    {id:'eighth-b', pitch:'E5', beats:0.5},
    {id:'half', pitch:'G5', beats:2},
  ]});
  const score = await musicNotation(root, {phrase, width:1000, height:230});
  const listen = context.beats.find(b => b.id === 'listen');
  const placed = placePhrase(phrase, listen.start + listen.spoken + 0.2);
  if (placed.end > listen.start + listen.duration)
    throw Error('The listening hold is too short for this phrase');
  return {
    update(t) { score.highlight(placed.activeAt(t)); },
    exportAudio() {
      return renderMusicAudio({events:placed.events, duration:context.duration});
    },
  };
}
```

Give the `listen` beat sufficient `pauseAfter` time for the phrase, a small lead-in
and a processing hold. Beat pauses may be up to 10 seconds. Do not estimate speech
length before audio is measured, or let an example obscure subsequent narration.
The host calls `exportAudio` once per chapter, after `buildScene` and before frame
capture. It checks finite PCM samples and mixes them with speech without changing
transcript timing. Existing narration-only scenes retain their original path.
The optional mixer adds tracks without normalization and limits combined peaks
to 0.95 with latency compensation. It can reduce peaks where tracks overlap; it
does not automatically duck music under speech. Prefer intentional listening
holds and a moderate soundtrack level, then inspect/listen to the encoded MP4.

## Model and rendering contract

`musicPhrase({notes,tempo=90,beatsPerBar=4})` describes **one complete monophonic
bar**, with quarter-note beats. Tempo is 30–240 quarter notes/minute; time signature
is `beatsPerBar/4`, numerator 1–12. Each note needs a unique nonempty `id`, `pitch`
(`C4`, `F#4`, `Bb3`, or null for a rest), and `beats` (0.25, 0.5, 1, 2, or 4).
Optional velocity is in (0,1], default 0.8. Pitches use octaves 0–8 and at most one
sharp/flat. The durations must exactly fill the bar. No ties, dotted notes,
tuplets, key signatures, chords, multi-voice engraving or playback articulation
notation are inferred. Use native VexFlow for a broader notation model, and
supply corresponding reviewed timed audio events explicitly.

The frozen phrase contains `tempo`, `beatsPerBar`, `duration`, and `events`.
Events preserve IDs, pitch spelling and beat values, and add `beat`, `onset`,
`duration` (seconds), MIDI pitch, frequency, and VexFlow key spelling. A rest has
null pitch and no pitch-derived fields. `pitchInfo(pitch)` exposes the conversion;
audio uses 12-tone equal temperament with A4 = 440 Hz.

`placePhrase(phrase,start)` takes a phrase from `musicPhrase` and a nonnegative
chapter-relative start. It returns shifted immutable `events`, `start`, `end`, and
`activeAt(seconds)`, which returns note/rest IDs during half-open intervals
[start,end). It is safe to seek backward. For repeated or slower examples, create
another placement (or another phrase with the same IDs and a different tempo).
Derive every notation highlight from these placements; do not advance a cursor
by counting rendered frames. Rests can be highlighted but remain silent.

`musicNotation(container,{phrase,width=1000,height=230,scale=1.6,color,activeColor})`
awaits bundled local Bravura/Academico fonts and draws real VexFlow SVG. It returns
`highlight(ids)`, native `renderer`, `stave`, `notes`, and pixel `anchors` keyed by
note ID. Anchors locate noteheads; choose caption positions and inspect stems,
ledger lines, accidentals and label collisions. Unknown highlight IDs fail. A
connected container is required. Use CSS positioning around the notation as
needed; this function does not impose an entire lesson layout. Quarter/eighth
notes are shown with their native stems/flags; the helper does not infer beams.
Explicit accidentals and natural cancellations preserve audible pitch spelling.

`renderMusicAudio({events,duration,sampleRate=24000,volumeDb=-15})` uses
`Tone.Offline`, returns `{sampleRate,channels:[Float32Array]}`, and never waits for
real-time playback. Supply placed events with pitch, onset, duration and velocity;
at most 256 events, a chapter of at most 180 seconds, and rates 24000/44100/48000
are supported. All events must fit the chapter. Simple sine instruments use short
attack/release envelopes within each notated duration, producing separated notes;
this is not an acoustic-instrument recording. Nodes are disposed after rendering.
Volume is -60 to -6 dB per note; overlapping notes sum and may exceed output bounds,
which the host rejects. The host accepts one or two equal PCM channels in [-1,1]
but currently encodes the final lesson mono. Avoid live Transport, Tone.start,
requestAnimationFrame, timers and browser audio as a recording strategy.

Tell the learner what to listen for before the example. Keep the notation visible
while it sounds, highlight the sounding note or rest, and leave time to compare.
Do not infer emotional universals or a learner's musical expertise. A bounded
example can teach rhythm, a melodic interval or phrase shape without surveying
notation mechanics or adopting a fixed chapter sequence.

Sources: [VexFlow bundled-font build](https://vexflow.github.io/vexflow-examples/demos/entry/vexflow/),
[Tone.Offline](https://tonejs.github.io/docs/15.0.4/functions/Offline.html), and
[Tone instruments](https://github.com/Tonejs/Tone.js/wiki/Instruments).
VexFlow and Tone.js are MIT licensed. Bundled music fonts retain their upstream
font licenses (including Bravura's SIL Open Font License); preserve notices with
redistributed dependencies. No sampled instruments or external font URLs are used.
