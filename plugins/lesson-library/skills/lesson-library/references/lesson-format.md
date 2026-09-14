# Lesson plan format

Write a JSON object with these fields. The fields shown below are required. Optional authoring and timing fields follow. The CLI validates the document before rendering; an invalid document produces an actionable error.

```json
{
  "title": "A clear title, at most 100 characters",
  "summary": "An honest description of what the lesson teaches, at most 400 characters.",
  "learningObjective": "What the learner should be able to explain or do afterward; at most 300 characters.",
  "assumedKnowledge": ["Explicit prerequisites; up to 6 strings, each at most 200 characters"],
  "tags": ["1–4 tags, each at most 30 characters"],
  "scenes": [
    {
      "title": "Short chapter heading, at most 75 characters",
      "narration": "Natural spoken prose. Between 10 and 1600 characters per scene.",
      "visual": "steps",
      "points": ["1–4 concise on-screen points; each at most 140 characters"],
      "takeaway": "The idea to remember, at most 180 characters."
    }
  ],
  "check": {
    "question": "A question that checks application to a new example, at most 500 characters.",
    "answer": "A model explanation, at most 1200 characters."
  }
}
```

Include **1–20 scenes**. Choose scope and reasoning steps before duration; there is no fixed word budget or target scene count. Read [teaching guidance](teaching.md) before drafting.

Basic visuals:
- `concept`: key ideas on separate panels.
- `steps`: numbered steps in a sequence.
- `comparison`: two panels when there are two points; more points use stacked panels.

For equations, code, diagrams, and plots, use the structured content formats in [subject-specific visuals](visuals.md). Choose representations scene by scene rather than repeating a single template. Structured animation supports measured beats and tracks; freely authored motion uses [browser animation](browser-animation.md). Do not describe movement, code execution, or diagrams that the renderer cannot display. On-screen points should be concise; put the richer explanation in narration. Narration becomes both the audio and transcript. Captions follow measured beats when supplied; word positions within a beat remain approximate.

Use concrete examples and resolve the learner's actual confusion. Avoid placing large equations, Markdown, tables, or code blocks in on-screen strings. Use optional `sources: [{title,url}]` for verified references. Do not invent citations.

## Teaching and revision metadata

Both structured and authored manifests accept optional `teaching` and `review`
(null or omitted for older plans). Populate these for newly authored lessons:

- `teaching.learner`: `{established, assumed, uncertain}`, arrays of concise strings.
- `teaching.focus`: the specific gap this lesson addresses.
- `teaching.skip`: an array of prerequisites that do not need a refresher.
- `teaching.approach`: why this sequence bridges the gap.
- `teaching.pacing`: where to spend processing time and what can be brisk.
- `teaching.symbols`: `[{symbol,meaning,unit}]`; empty when irrelevant, empty unit
  for dimensionless quantities. This authoring ledger does not draw labels:
  explicitly put needed meanings and units in the visual and narration.
- `review`: `{changes: string[], limitations: string[]}` recording the focused
  revision and unresolved assumptions, not a claim of automatic certification.

## Measured reveals for static layouts

New non-animation scenes should include `beats`, each
`{id,narration,pauseAfter,visualStep}`. IDs start with a letter and are unique per
scene. Chapter narration must exactly equal beat narrations joined with spaces.
Use 1–16 beats; `pauseAfter` is 0–10 seconds, default 0.4.

`visualStep` is zero-based: an equation step, diagram node, code highlight, or
numbered point in a steps layout. Concept, comparison and plot layouts have only
step 0. Begin at 0, visit every step in order, and end at the last step. Repeating
a step holds that state for further explanation. The renderer speaks each beat,
measures its duration, then reveals the next state at the next beat boundary.
Earlier equation steps and diagram nodes remain visible. Code steps change the
highlight; the code stays visible. Use a new beat when a reveal must coincide
with narration; do not estimate word timestamps.

For `visual="animation"`, set scene `beats` to null and use `content.beats` with
tracks instead. Those beats accept `pauseAfter` as well as minimum `seconds`.
Older static plans with omitted/null beats retain approximate even reveals.
