# Source image and text inspection

Import `createImageInspector`, `createTextAnnotations`, `regionRect`,
`interpolateRegion`, and `textSpan` from `@lesson-library/inspection`. Choose
image zoom, text highlighting or both from the explanation. These do not impose
a lesson layout, chapter order or numbered footer. Keep source context visible
and distinguish visible evidence from claims in a related catalogue/transcript.
Supplied text must be reviewed; these tools perform no OCR or source verification.

## Prepare local images and preserve provenance

The browser adapter uses actual OpenSeadragon and its internal image pyramid.
Capture cannot fetch remote IIIF tiles. Acquire an authorized source image before
rendering, then prepare it locally. Preserve the original, source item URL,
credit/attribution, rights statement, and any IIIF region/size request. Prefer the
institution's published download link. For IIIF, inspect its `info.json` and API
version/available sizes, preserve attribution/rights from the presentation manifest,
and download an allowed full image or deliberately chosen region/size. Do not
invent a full-resolution URL, strip required attribution, or silently substitute
a thumbnail. A prepared crop is a new pixel coordinate space; record its mapping.

`server/inspection/prepare.js` exports
`prepareInspectionImage(input,outputDirectory,{source})` for Node authoring. It
also runs as a small utility from a checkout with installed dependencies:

```sh
node server/inspection/prepare.js INPUT_IMAGE NEW_OUTPUT_DIRECTORY SOURCE_JSON
```

SOURCE_JSON contains `{id,title,url,attribution,rights}` (nonempty strings; URL
is the public HTTP(S) reference, not the local raster URL). The output contains
`image.png` and `source.json`: dimensions, source reference, original/prepared
SHA256 and preparation description. Existing output directories are rejected.
EXIF orientation is applied; no resizing or OCR occurs. Single images only, at
most 40 million pixels and 16384 pixels on either side. For larger sources,
explicitly obtain an appropriate IIIF region/size or prepare a reviewed derivative;
this adapter does not mirror arbitrary pyramids/manifests.

List the resulting nested `image.png` and `source.json` in the lesson manifest's
`files`. Include source attribution/rights in the lesson's sources/credits too.
Do not put acquired source images or generated lessons in the public repository.

## Deterministic OpenSeadragon camera

```js
const inspector = await createImageInspector(imageContainer, {
  url: context.sourceUrl + 'prepared/image.png',
  source: prepared.source,
});
await inspector.focus({x:100,y:200,width:800,height:500});
inspector.setRegions([{id:'detail',x:200,y:250,width:120,height:80}]);
const anchor = inspector.anchor({x:200,y:250,width:120,height:80});
```

The container needs a visible fixed nonzero size. URLs must be same-origin HTTP(S)
assets prepared under the local capture host. Regions use top-left image pixel
coordinates with positive y downward; they must lie inside the prepared image.
`focus()` fits the full image; `focus(rect)` fits a region while preserving aspect
ratio (it may include context outside that region). `interpolateRegion(a,b,u)`
blends authored rectangles for u in [0,1]. Await each focus call; concurrent seeks
are rejected. Animation/blending/navigation are disabled. Public viewport/world
APIs set the camera immediately and draw after all required local tiles are ready.
OpenSeadragon's internal loading/render scheduling never determines camera time.
A timeout is only a load-failure deadline, not a screenshot delay.

`width,height,source` describe the loaded image. `anchor(rect)` returns
`{source,region,screen,center}` relative to the inspector container. Regions and
anchors follow the actual camera, including aspect-ratio padding. `setRegions`
replaces all outlines (default amber, optional CSS `color`), keeping stable IDs.
Call focus again after resizing the container. No rotation, arbitrary tiling URL,
remote image fallback or interactive camera is exposed. Call `dispose()` when
removing the view; the host otherwise closes the chapter page.

## Text tied to exact source offsets

`createTextAnnotations(container,{text,source})` inserts literal supplied text and
an SVG overlay. It returns `setRanges`, `anchor`, `refresh`, `element`, `source`
and `dispose`. Apply font/line-height/container-width styles first and await font
loading before final layout/capture. HTML in the supplied string remains text.

`setRanges([{id,start,end,quote?,color?},...])` replaces all highlights. Offsets
are UTF-16 character offsets, as in DOM Range; ranges cannot split a surrogate
pair. `quote` optionally requires an exact string match, avoiding accidental
selection of a repeated phrase. `textSpan(text,range)` performs the same validation
without a browser. IDs must be unique. Empty `setRanges([])` clears highlights.

`anchor(range)` returns `{start,end,text,source,rects}`. The rectangle array comes
from actual `Range.getClientRects()`, so wrapped text has multiple rectangles.
Coordinates are relative to the tool wrapper's bounding client rectangle. The SVG
uses that coordinate space, including axis-aligned scale from ancestors. Rotation
or skew of the text/ancestor layout is outside scope. `refresh()` recomputes both
highlights and returned anchors after resize, wrapping or font changes. It does
not guess font widths, use OCR, scroll automatically or infer text-image alignment.
The source string is immutable; create a new view to replace its contents.

Drive camera and annotation state from measured narration beats. Inspect the
selected words/regions at exact beat boundaries and during motion. The browser
integration test verifies A→B→A image pixel/anchor equality after readiness, plus
long-to-short highlight replacement and changed wrapping after resize.

Primary references: [OpenSeadragon image sources](https://openseadragon.github.io/examples/tilesource-image/),
[World update/draw](https://openseadragon.github.io/docs/OpenSeadragon.World.html),
[DOM Range](https://developer.mozilla.org/en-US/docs/Web/API/Range/getClientRects).
