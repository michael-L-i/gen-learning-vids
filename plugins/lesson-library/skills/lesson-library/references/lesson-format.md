# Lesson plan format

Write a JSON object with these fields. All fields are required. The CLI validates the document before rendering; an invalid document produces an actionable error.

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

Include **2–8 scenes** (the shape example above shows one to avoid repetition). Usually use 4–6 scenes and 350–600 spoken words total. Honor the user's requested scope rather than padding a simple explanation.

Basic visuals:
- `concept`: key ideas on separate panels.
- `steps`: numbered steps in a sequence.
- `comparison`: two panels when there are two points; more points use stacked panels.

For equations, code, diagrams, and plots, use the structured content formats in [subject-specific visuals](visuals.md). Choose representations scene by scene rather than repeating a single template. The renderer supports progressive reveals, not arbitrary animations. Do not describe movement, code execution, or diagrams that the renderer cannot display. On-screen points should be concise; put the richer explanation in narration. Narration becomes both the audio and transcript. Captions use approximate timing from speech length.

Use concrete examples and resolve the learner's actual confusion. Avoid placing large equations, Markdown, tables, or code blocks in on-screen strings. Don't use unsupported source citations; name sources in the context brief when supplied.
