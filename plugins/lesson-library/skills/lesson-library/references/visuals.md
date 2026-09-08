# Subject-specific visuals

Choose the representation from the lesson's instructional purpose. Mix formats across scenes when that makes the explanation clearer. `--presentation auto` leaves that decision to the author. The other preferences (`worked`, `diagram`, `code`, `slides`) guide the lesson's approach; they do not require every scene to use one layout. `--visual-brief "..."` carries the user's visual directions. `--style auto|paper|midnight|sage` controls color separately.

Each scene can include `visualReason` (up to 250 characters) explaining its visual choice. Keep existing `points` as concise lesson notes. Set `content` to one of the objects below, with `visual` matching `content.kind`. For `concept`, `steps`, and `comparison`, use `content: null`.

## Equations

```json
{"kind":"equation","steps":[{"tex":"F_{\\mathrm{net}}=ma","explanation":"Start from the net force."},{"tex":"a=\\frac{F_{\\mathrm{net}}}{m}","explanation":"Divide by mass."}]}
```

Use 1–4 steps. Mathematical TeX only, without delimiters, HTML, links or custom macros. Each expression is at most 180 characters and each explanation at most 100. Keep expressions short enough to read; split dense derivations across scenes.

## Code

```json
{"kind":"code","language":"Python","code":"v = 0\nfor step in range(4):\n    v += 3\n    print(v)","highlightLines":[2,3,4],"output":"3, 6, 9, 12"}
```

Maximum 14 lines, 76 characters per line, 1,400 characters total. `highlightLines` contains up to 8 existing one-based line numbers in teaching order. `output` is at most 180 characters. Code is displayed, never executed; trace it accurately and do not claim execution.

## Diagrams

```json
{"kind":"diagram","nodes":[{"id":"dna","label":"DNA","x":10,"y":50,"shape":"box"},{"id":"rna","label":"RNA","x":50,"y":50,"shape":"box"},{"id":"protein","label":"Protein","x":90,"y":50,"shape":"ellipse"}],"edges":[{"from":"dna","to":"rna","label":"transcription"},{"from":"rna","to":"protein","label":"translation"}]}
```

Use 1–8 nodes and up to 12 edges. Coordinates range from 0–100 inside the diagram area; spread nodes at least 25 horizontally or 30 vertically. Node IDs must be unique and use letters, numbers, underscores or hyphens. Every edge must reference existing nodes. Labels: nodes up to 60 characters, edges up to 40. Nodes appear in array order. Use purposeful spatial arrangements for structures, processes, forces, or relationships; this is a schematic renderer, not a photorealistic anatomy illustrator.

## Plots

```json
{"kind":"plot","xLabel":"Time (s)","yLabel":"Velocity (m/s)","series":[{"name":"v = 3t","points":[{"x":0,"y":0},{"x":1,"y":3},{"x":2,"y":6}]}]}
```

Provide 1–3 series with 2–100 finite coordinate pairs each, in drawing order. Series names are at most 30 characters; axis labels at most 50. Include units. Derive values from the actual model or supplied data; never fabricate empirical measurements. The renderer draws line graphs, not arbitrary chart types.

Equations, diagrams, processes, and code highlights reveal in evenly spaced stages across narration. Timing is approximate; do not promise word-synchronized animation. Concept and comparison layouts remain useful for introductory framing or summaries. Legacy plans without `content` continue to render.
