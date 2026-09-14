import { sourceReference, regionRect, textSpan } from "./contracts.js";
export {
  sourceReference,
  regionRect,
  textSpan,
  interpolateRegion,
} from "./contracts.js";
const NS = "http://www.w3.org/2000/svg";
const svg = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, String(value));
  return node;
};
const element = (container) => {
  if (!container || container.nodeType !== 1)
    throw new Error("A DOM container is required");
};
const color = (value) => {
  if (typeof value !== "string" || !CSS.supports("color", value))
    throw new Error("A CSS color is required");
  return value;
};
const ids = (items) => {
  const seen = new Set();
  for (const i of items) {
    if (typeof i.id !== "string" || !i.id || seen.has(i.id))
      throw new Error("Annotation IDs must be unique nonempty strings");
    seen.add(i.id);
  }
};

/** Actual OpenSeadragon viewer; camera is set immediately, then visible tiles are awaited.
 * All regions use prepared image pixels. No remote tile/image URLs during capture.
 */
export async function createImageInspector(
  container,
  { url, source, timeoutMs = 15000 } = {},
) {
  element(container);
  const reference = sourceReference(source),
    asset = new URL(url, document.baseURI);
  if (
    !["http:", "https:"].includes(asset.protocol) ||
    asset.origin !== location.origin
  )
    throw new Error("Image must use a prepared same-origin local URL");
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 60000)
    throw new Error("timeoutMs must be between 100 and 60000");
  const imported = await import("openseadragon"),
    OSD = imported.default ?? imported;
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
  });
  container.append(wrapper);
  if (wrapper.clientWidth <= 0 || wrapper.clientHeight <= 0) {
    wrapper.remove();
    throw new Error("Image container needs a visible nonzero size");
  }
  const image = document.createElement("div");
  Object.assign(image.style, { width: "100%", height: "100%" });
  wrapper.append(image);
  const overlay = svg("svg");
  Object.assign(overlay.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  });
  wrapper.append(overlay);
  const viewer = OSD({
    element: image,
    drawer: "canvas",
    showNavigationControl: false,
    showNavigator: false,
    mouseNavEnabled: false,
    keyboardNavEnabled: false,
    animationTime: 0,
    blendTime: 0,
    immediateRender: true,
    autoResize: false,
    visibilityRatio: 0,
    minZoomImageRatio: 0.001,
    maxZoomPixelRatio: 100,
  });
  let item,
    disposed = false,
    busy = false,
    cancel = null,
    regions = [];
  const checkAlive = () => {
    if (disposed) throw new Error("Image inspector is disposed");
  };
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => finish(new Error("Local image did not open before timeout")),
        timeoutMs,
      );
      const opened = () => finish(),
        failed = () => finish(new Error("Unable to open prepared local image"));
      function finish(error) {
        clearTimeout(timer);
        viewer.removeHandler("open", opened);
        viewer.removeHandler("open-failed", failed);
        error ? reject(error) : resolve();
      }
      viewer.addHandler("open", opened);
      viewer.addHandler("open-failed", failed);
      viewer.open({ type: "image", url: asset.href, buildPyramid: true });
    });
    item = viewer.world.getItemAt(0);
    const dimensions = item.getContentSize();
    if (
      dimensions.x > 16384 ||
      dimensions.y > 16384 ||
      dimensions.x * dimensions.y > 40000000
    )
      throw new Error(
        "Prepared image exceeds 16384 per dimension or 40 million pixels",
      );
    const width = dimensions.x,
      height = dimensions.y;
    const anchor = (region) => {
      checkAlive();
      const r = regionRect(region, width, height),
        a = viewer.viewport.pixelFromPoint(
          item.imageToViewportCoordinates(r.x, r.y),
          true,
        ),
        b = viewer.viewport.pixelFromPoint(
          item.imageToViewportCoordinates(r.x + r.width, r.y + r.height),
          true,
        );
      return {
        source: reference,
        region: r,
        screen: { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y },
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    };
    function drawRegions() {
      overlay.setAttribute(
        "viewBox",
        `0 0 ${wrapper.clientWidth} ${wrapper.clientHeight}`,
      );
      overlay.replaceChildren();
      for (const region of regions) {
        const r = anchor(region).screen;
        overlay.append(
          svg("rect", {
            ...r,
            fill: "none",
            stroke: region.color,
            "stroke-width": 3,
            "data-region": region.id,
          }),
        );
      }
    }
    function rendered() {
      // The timer is only an actionable load deadline, never a camera/motion clock.
      return new Promise((resolve, reject) => {
        let done = false;
        const timer = setTimeout(
          () =>
            finish(new Error("Prepared image tiles did not finish loading")),
          timeoutMs,
        );
        const failed = () =>
          finish(new Error("A prepared local image tile failed to load"));
        const changed = () => queueMicrotask(check);
        function finish(error) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          item.removeHandler("fully-loaded-change", changed);
          viewer.removeHandler("tile-loaded", changed);
          viewer.removeHandler("tile-load-failed", failed);
          cancel = null;
          error ? reject(error) : resolve();
        }
        function check() {
          if (done) return;
          try {
            checkAlive();
            viewer.world.update(true);
            if (item.getFullyLoaded()) {
              viewer.world.draw();
              drawRegions();
              finish();
            }
          } catch (error) {
            finish(error);
          }
        }
        item.addHandler("fully-loaded-change", changed);
        viewer.addHandler("tile-loaded", changed);
        viewer.addHandler("tile-load-failed", failed);
        cancel = () =>
          finish(new Error("Image inspector disposed while loading"));
        check();
      });
    }
    async function focus(region = { x: 0, y: 0, width, height }) {
      checkAlive();
      if (busy)
        throw new Error("Await the previous focus call before seeking again");
      const r = regionRect(region, width, height);
      if (wrapper.clientWidth <= 0 || wrapper.clientHeight <= 0)
        throw new Error("Image container needs a visible nonzero size");
      busy = true;
      try {
        viewer.viewport.resize(
          new OSD.Point(wrapper.clientWidth, wrapper.clientHeight),
          true,
        );
        viewer.viewport.fitBounds(
          item.imageToViewportRectangle(r.x, r.y, r.width, r.height),
          true,
        );
        viewer.viewport.update();
        await rendered();
        return anchor(r);
      } finally {
        busy = false;
      }
    }
    await focus();
    return {
      width,
      height,
      source: reference,
      focus,
      anchor,
      setRegions(items = []) {
        checkAlive();
        if (!Array.isArray(items)) throw new Error("Regions must be an array");
        ids(items);
        regions = items.map((r) => ({
          ...regionRect(r, width, height),
          id: r.id,
          color: color(r.color ?? "#bf6826"),
        }));
        drawRegions();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        cancel?.();
        viewer.destroy();
        wrapper.remove();
      },
    };
  } catch (error) {
    viewer.destroy();
    wrapper.remove();
    throw error;
  }
}

/** Supplied text, real DOM Range line rectangles and SVG highlights; no OCR or HTML injection.
 * Call refresh after font/layout changes. Source offsets never change with wrapping.
 */
export function createTextAnnotations(container, { text, source } = {}) {
  element(container);
  if (typeof text !== "string" || !text.length)
    throw new Error("Nonempty supplied text required");
  const reference = sourceReference(source);
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  const paragraph = document.createElement("div");
  paragraph.style.whiteSpace = "pre-wrap";
  paragraph.textContent = text;
  wrapper.append(paragraph);
  const overlay = svg("svg");
  Object.assign(overlay.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  });
  wrapper.append(overlay);
  container.append(wrapper);
  const textNode = paragraph.firstChild;
  let selections = [],
    disposed = false;
  const checkAlive = () => {
    if (disposed) throw new Error("Text annotations are disposed");
    if (paragraph.textContent !== text || paragraph.firstChild !== textNode)
      throw new Error("Source text changed; create a new annotation view");
  };
  function anchor(selection) {
    checkAlive();
    const span = textSpan(text, selection),
      range = document.createRange();
    range.setStart(textNode, span.start);
    range.setEnd(textNode, span.end);
    const root = wrapper.getBoundingClientRect();
    const rects = [...range.getClientRects()]
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({
        x: r.left - root.left,
        y: r.top - root.top,
        width: r.width,
        height: r.height,
      }));
    return { ...span, source: reference, rects };
  }
  function refresh() {
    checkAlive();
    const bounds = wrapper.getBoundingClientRect();
    overlay.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    overlay.replaceChildren();
    for (const selection of selections)
      for (const r of anchor(selection).rects)
        overlay.append(
          svg("rect", {
            ...r,
            fill: selection.color,
            "fill-opacity": 0.24,
            "data-range": selection.id,
          }),
        );
    return selections.map((s) => ({ id: s.id, ...anchor(s) }));
  }
  return {
    source: reference,
    element: paragraph,
    anchor,
    refresh,
    setRanges(items = []) {
      checkAlive();
      if (!Array.isArray(items))
        throw new Error("Text ranges must be an array");
      ids(items);
      selections = items.map((s) => ({
        ...textSpan(text, s),
        id: s.id,
        color: color(s.color ?? "#e8af38"),
      }));
      return refresh();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      wrapper.remove();
    },
  };
}
