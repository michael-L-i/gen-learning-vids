# Online image assets

The lesson engine supports verified raster photographs alongside authored animation. This is a shared asset contract, not a subject-specific slideshow template.

An agent can discover reusable candidates with `learnvid image-search "NVIDIA AD102"` and retrieve a specific Commons file with `learnvid image-info "File:…"`. Search results include attribution and license metadata. Inspect the image itself before choosing it: file names are not reliable descriptions. Other public HTTPS raster sources are supported when their source and reuse terms are supplied accurately.

Add an `assets` array to an imported lesson plan or scientific `lesson.json`. Each entry requires `id`, `url`, `sourceUrl`, `title`, `creator`, `license`, `licenseUrl`, and `alt`. Downloads are limited to public HTTPS addresses, checked again after redirects, bounded in size and pixel count, decoded as still raster images and normalized to PNG. SVG, executable content and private network targets are rejected. A SHA-256 manifest records original and normalized content, provenance and image transformations. Identical intact assets can be reused offline from their retained asset directory.

SVG animation nodes reference those IDs: `{ "id": "photo", "type": "image", "asset": "chip", "x": 64, "y": 160, "width": 640, "height": 400, "fit": "contain" }`. The renderer embeds local bytes. Existing grouping, motion, scale and opacity tracks work with images. `contain` preserves the full image; `cover` preserves aspect ratio and crops to the frame. Missing references fail explicitly.

Scientific scenes receive `ctx["assets"][id]` with a local `path` and attribution. `from media import place_image` exposes `place_image(fig, ctx, id, (x, y, width, height), fit="contain")`, using figure fractions from the bottom left. It returns the image axes and artist for authored motion and annotation. Local assets are retained beside the exact Python source.

Both routes append image credits to the transcript, retain structured image metadata, and expose a downloadable credit file under Sources & context. Include readable on-screen credits when the image's terms require them; the engine retains full metadata but does not infer permissions from an arbitrary website or automatically overlay credits.

The agent decides when photos help: physical hardware and specimens often benefit, while hidden mechanisms need diagrams. Verify labels against what is actually visible. Keep schematic circuit models and exact hardware layouts clearly distinguished. No fixed percentage of photographs is imposed.

Current scope: image search is an explicit CLI/agent tool; ordinary UI planning does not autonomously browse the web. Both UI and CLI can render a validated plan containing sourced image assets. Scientific Python execution remains an explicit trusted-local CLI workflow.

Validation: `npm run check`; include the optional scientific integration with `LEARNVID_SCIENTIFIC_PYTHON=/path/to/python npm run check`. Tests cover private address rejection, raster validation, cache integrity, SVG image pixels/aspect ratio, and a real scientific MP4 containing a downloaded fixture image and retained credits.
