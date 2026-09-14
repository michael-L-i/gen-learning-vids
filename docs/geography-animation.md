# Geography animation module

Use `globe` nodes inside the existing animation scene contract. The reusable module handles spherical geometry; the author controls the composition, narration, statistics and pacing. It is available to normal lesson plans from either agent/CLI authoring or the UI planner, without an additional Python environment.

`server/geography/globe.js` uses D3's orthographic projection, adaptive path sampling, horizon clipping and antimeridian handling. The bundled Natural Earth 1:110m atlas covers 177 country/territory features and works offline. Its source, checksum, public-domain terms and winding-order transformation are recorded in `data/provenance.json`. These are generalized de facto boundaries, unsuitable for local detail or historical boundary claims. No reserve values or lesson-specific country choices live in this module.

Example node:

```json
{
  "id": "earth", "type": "globe", "x": 40, "y": 130,
  "width": 560, "height": 560, "longitude": 45, "latitude": 25, "zoom": 1,
  "geography": {
    "highlights": [{"country": "SAU", "color": "#E9B86B"}],
    "ocean": "#142B3D", "land": "#455B68", "border": "#8DABB5",
    "grid": "#5B7988", "markers": true
  }
}
```

A globe has a rectangular local viewport. Camera longitude and latitude identify the point facing the viewer; `zoom` changes projection scale within that viewport. Existing group transforms and opacity work normally. Add narration-relative tracks for `longitude`, `latitude`, `zoom`, `highlightOpacity`, or `highlight:SAU` to fade a single configured country. Longitude can exceed ±180°: use 170→190 for a short dateline crossing. Latitude is limited to ±90°, zoom to 0.5–4, and highlight opacity to 0–1. Unknown country IDs, missing highlight targets and invalid camera tracks fail validation. `countryCatalog` exports all supported ADM0_A3 codes (usually ISO alpha-3).

The standalone `globeSvg`, `globeProjection`, `globePoint` and `countryPoint` helpers can be composed with other rendering code. Points on the far hemisphere or outside the viewport return null. Styling is configurable, including an unfilled layer via `none`; labels and statistics remain ordinary layout nodes. Lighting is illustrative shading, not a solar-position simulation. This is a vector globe, not a satellite terrain renderer, and it does not yet provide historic boundaries or animated trade routes.

## Authoring guidance

- Choose the teaching question and a consistent statistical source, reporting year, definition and unit before mapping values.
- Use country highlights to locate places. Use calibrated bars or explicit numbers to compare quantities: country area is not a reserve or population measure.
- Rotate toward the subject, reveal its highlight, then hold the view while explaining it. Prefer smooth camera transitions to constant spinning behind narration.
- Pair small countries with markers and clear adjacent labels. Avoid stacking multiple labels at a dense geographic centroid.
- Treat blank/unselected countries as unselected, not as zero. Mark any source or scope change visibly; never silently merge incompatible series.
- Keep source/year text readable and preserve references in the lesson's context/transcript.
- Inspect several points during every camera move, especially the horizon and dateline. Review data accuracy separately from layout checks.

Validation includes hemisphere occlusion, dateline continuity, visible highlight pixels, narration-relative camera timing, invalid inputs, and an encoded/decoded narrated MP4. The reusable capability guidance is included in both the normal lesson planner and standalone clip planner prompts.
