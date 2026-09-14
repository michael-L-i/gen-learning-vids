import { MVSData } from "molstar/lib/extensions/mvs/mvs-data.js";

const finite = (v, name) => {
  if (!Number.isFinite(v)) throw new TypeError(`${name} must be finite`);
  return v;
};
const vector = (v, name) => {
  if (!Array.isArray(v) || v.length !== 3)
    throw new TypeError(`${name} must have three coordinates`);
  return v.map((x) => finite(x, name));
};
const text = (v, name) => {
  if (typeof v !== "string" || !v.length)
    throw new TypeError(`${name} must be a nonempty string`);
  return v;
};
const color = (v) => {
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new TypeError("color must be #RRGGBB");
  return v;
};
const strings = new Set([
  "label_asym_id",
  "auth_asym_id",
  "label_atom_id",
  "auth_atom_id",
  "label_comp_id",
  "auth_comp_id",
  "type_symbol",
  "pdbx_PDB_ins_code",
]);
const integers = new Set([
  "label_seq_id",
  "auth_seq_id",
  "beg_label_seq_id",
  "end_label_seq_id",
  "beg_auth_seq_id",
  "end_auth_seq_id",
  "atom_id",
]);
/** Explicit MolViewSpec selectors; unknown keys fail instead of silently selecting all. */
export function molecularSelection(value) {
  if (typeof value === "string") {
    if (
      ![
        "all",
        "polymer",
        "protein",
        "nucleic",
        "water",
        "ligand",
        "ion",
      ].includes(value)
    )
      throw new TypeError("unsupported static molecular selector");
    return value;
  }
  if (Array.isArray(value)) {
    if (!value.length || value.length > 100)
      throw new RangeError("selector union needs 1–100 members");
    return value.map((v) => {
      if (!v || Array.isArray(v) || typeof v !== "object")
        throw new TypeError("selector union members must be objects");
      return molecularSelection(v);
    });
  }
  if (!value || typeof value !== "object" || !Object.keys(value).length)
    throw new TypeError("provide a nonempty molecular selector");
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (strings.has(k)) {
      if (typeof v !== "string" || (!v.length && k !== "pdbx_PDB_ins_code"))
        throw new TypeError(`${k} must be a string`);
      out[k] = v;
    } else if (integers.has(k)) {
      if (!Number.isSafeInteger(v))
        throw new TypeError(`${k} must be an integer`);
      out[k] = v;
    } else throw new TypeError(`unsupported selection field ${k}`);
  }
  for (const kind of ["label", "auth"])
    if (out[`beg_${kind}_seq_id`] > out[`end_${kind}_seq_id`])
      throw new RangeError("residue range must increase");
  return out;
}
/** Portable MolViewSpec tree for a single local model and named representations. */
export function molecularSpec({
  url,
  format = "mmcif",
  modelIndex = 0,
  components,
  background = "#f7f8fa",
}) {
  text(url, "url");
  if (!["mmcif", "bcif", "pdb"].includes(format))
    throw new TypeError("format must be mmcif, bcif or pdb");
  if (!Number.isSafeInteger(modelIndex) || modelIndex < 0)
    throw new RangeError("modelIndex must be a nonnegative integer");
  if (
    !Array.isArray(components) ||
    !components.length ||
    components.length > 40
  )
    throw new RangeError("provide 1–40 components");
  const ids = new Set(),
    builder = MVSData.createBuilder();
  builder.canvas({ background_color: color(background) });
  const structure = builder
    .download({ url })
    .parse({ format })
    .modelStructure({ model_index: modelIndex, ref: "lesson-structure" });
  for (const {
    id,
    selector,
    representation = "ball_and_stick",
    color: shade = "#4e79a7",
    opacity = 1,
    sizeFactor = 1,
    colorLayers = [],
  } of components) {
    text(id, "component id");
    if (ids.has(id)) throw new TypeError("component IDs must be unique");
    ids.add(id);
    if (
      !["cartoon", "ball_and_stick", "spacefill", "surface"].includes(
        representation,
      )
    )
      throw new TypeError("unsupported representation");
    finite(opacity, "opacity");
    if (opacity < 0 || opacity > 1)
      throw new RangeError("opacity must be in [0,1]");
    if (finite(sizeFactor, "sizeFactor") <= 0 || sizeFactor > 5)
      throw new RangeError("sizeFactor must be in (0,5]");
    if (!Array.isArray(colorLayers) || colorLayers.length > 40)
      throw new RangeError("at most 40 color layers");
    const repr = structure
      .component({
        selector: molecularSelection(selector),
        ref: `component:${id}`,
      })
      .representation({
        type: representation,
        size_factor: sizeFactor,
        ref: `representation:${id}`,
      });
    repr.color({ color: color(shade) });
    for (const layer of colorLayers)
      repr.color({
        color: color(layer.color),
        selector: molecularSelection(layer.selector),
      });
    repr.opacity({ opacity });
  }
  const spec = builder.getState(); // Eliminate wall-clock metadata for reproducible authored specs.
  spec.metadata.timestamp = "1970-01-01T00:00:00.000Z";
  return spec;
}
/** Blend complete camera snapshots; this is illustrative camera motion, not dynamics. */
export function molecularCameraBetween(from, to, progress) {
  finite(progress, "progress");
  if (progress < 0 || progress > 1)
    throw new RangeError("progress must be in [0,1]");
  const out = { ...from };
  for (const key of ["position", "target", "up"]) {
    const a = vector(from[key], key),
      b = vector(to[key], key);
    out[key] = a.map((v, i) =>
      finite((1 - progress) * v + progress * b[i], key),
    );
  }
  for (const key of ["radius", "radiusMax"]) {
    finite(from[key], key);
    finite(to[key], key);
    out[key] = finite((1 - progress) * from[key] + progress * to[key], key);
  }
  return cameraCheck(out);
}
function cameraCheck(camera) {
  const position = vector(camera.position, "position"),
    target = vector(camera.target, "target"),
    up = vector(camera.up, "up");
  const d = position.map((v, i) => finite(v - target[i], "camera direction"));
  const cross = [
    d[1] * up[2] - d[2] * up[1],
    d[2] * up[0] - d[0] * up[2],
    d[0] * up[1] - d[1] * up[0],
  ];
  if (!Number.isFinite(Math.hypot(...cross)) || Math.hypot(...cross) < 1e-10)
    throw new RangeError(
      "camera direction and up must be nonzero and nonparallel",
    );
  for (const k of ["radius", "radiusMax"])
    if (finite(camera[k], k) <= 0)
      throw new RangeError(`${k} must be positive`);
  if (
    camera.fov !== undefined &&
    (finite(camera.fov, "fov") <= 0 || camera.fov >= Math.PI)
  )
    throw new RangeError("fov must be in (0,pi)");
  if (
    camera.mode !== undefined &&
    !["orthographic", "perspective"].includes(camera.mode)
  )
    throw new TypeError("unsupported camera mode");
  return { ...camera, position, target, up };
}

/** A real Mol* canvas with MolViewSpec loading and explicit manual rendering. */
export async function createMolecularViewer(root, options) {
  if (!root?.appendChild || root.clientWidth <= 0 || root.clientHeight <= 0)
    throw new TypeError(
      "viewer root must be a mounted element with positive dimensions",
    );
  const url = new URL(options.url, document.baseURI);
  if (
    url.origin !== location.origin ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw new TypeError("structure must be a same-origin local source URL");
  const spec = molecularSpec({ ...options, url: url.href });
  const componentIds = options.components.map((c) => c.id);
  const [
    context,
    specModule,
    mvs,
    loader,
    selectors,
    helpers,
    structureModule,
  ] = await Promise.all([
    import("molstar/lib/mol-plugin/context.js"),
    import("molstar/lib/mol-plugin/spec.js"),
    import("molstar/lib/extensions/mvs/behavior.js"),
    import("molstar/lib/extensions/mvs/load.js"),
    import("molstar/lib/extensions/mvs/components/selector.js"),
    import("molstar/lib/extensions/mvs/load-helpers.js"),
    import("molstar/lib/mol-model/structure.js"),
  ]);
  const defaults = specModule.DefaultPluginSpec();
  const plugin = new context.PluginContext({
    ...defaults,
    behaviors: [
      ...defaults.behaviors,
      specModule.PluginSpec.Behavior(mvs.MolViewSpec),
    ],
    animations: [],
    layout: { initial: { isExpanded: false, showControls: false } },
  });
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "display:block;width:100%;height:100%;pointer-events:none";
  root.appendChild(canvas);
  let disposed = false;
  try {
    await plugin.init();
    if (!(await plugin.initViewerAsync(canvas, root)))
      throw new Error("Mol* WebGL initialization failed");
    plugin.animationLoop.stop();
    await loader.loadMVS(plugin, spec, {
      sourceUrl: url.href,
      sanityChecks: true,
      extensions: [],
    });
    await plugin.managers.animation.stop();
    plugin.animationLoop.stop();
    const c = plugin.canvas3d;
    c.setProps({
      camera: {
        mode: "orthographic",
        manualReset: true,
        helper: { axes: { name: "off", params: {} } },
      },
      cameraClipping: { far: false },
      cameraFog: { name: "off", params: {} },
      multiSample: { mode: "off" },
      postprocessing: {
        occlusion: { name: "off", params: {} },
        shadow: { name: "off", params: {} },
        outline: { name: "off", params: {} },
        antialiasing: {
          name: "fxaa",
          params: {
            edgeThresholdMin: 0.0312,
            edgeThresholdMax: 0.063,
            iterations: 12,
            subpixelQuality: 0.3,
          },
        },
      },
    });
    c.handleResize();
    c.commit(true);
    c.tick(0, { isSynchronous: true, updateControls: false });
    const tagged = (tag) =>
      [...plugin.state.data.cells.values()].find((cell) =>
        cell.transform.tags?.includes(`mvs-ref:${tag}`),
      );
    const structure = tagged("lesson-structure")?.obj?.data;
    if (!structure?.elementCount)
      throw new Error("the requested structure model contains no atoms");
    const representations = new Map(
      componentIds.map((id) => {
        const cell = tagged(`representation:${id}`);
        if (!cell?.obj?.data?.repr)
          throw new Error(`component ${id} is empty or has no representation`);
        return [id, cell.obj.data.repr];
      }),
    );
    const selectionCache = new Map();
    function select(selector) {
      if (disposed) throw new Error("molecular viewer is disposed");
      const clean = molecularSelection(selector),
        key = JSON.stringify(clean);
      if (!selectionCache.has(key)) {
        if (selectionCache.size >= 200)
          throw new RangeError(
            "selection cache limit is 200 distinct selections",
          );
        const selected = selectors.substructureFromSelector(
          structure,
          helpers.componentPropsFromSelector(clean),
        );
        if (!selected.elementCount)
          throw new Error("molecular selection matched no atoms");
        selectionCache.set(key, selected);
      }
      return selectionCache.get(key);
    }
    function atom(selector) {
      const selected = select(selector);
      if (selected.elementCount !== 1)
        throw new Error(
          `atom selection must match exactly one atom; got ${selected.elementCount}. Specify chain, residue and atom_id to resolve alternate locations.`,
        );
      if (!structureModule.Unit.isAtomic(selected.units[0]))
        throw new TypeError(
          "atom measurements require atomic coordinates, not coarse elements",
        );
      const unit = selected.units[0],
        element = unit.elements[0],
        position = [0, 0, 0];
      unit.conformation.position(element, position);
      vector(position, "atom position");
      return {
        position,
        atomId: unit.model.atomicConformation.atomId.value(element),
        element,
        unitId: unit.id,
      };
    }
    const initialCamera = c.camera.getSnapshot();
    return {
      spec,
      getCamera: () => c.camera.getSnapshot(),
      atomCount: structure.elementCount,
      count: (selector) => select(selector).elementCount,
      atom,
      distance(a, b) {
        const aa = atom(a).position,
          bb = atom(b).position;
        return {
          angstroms: finite(
            Math.hypot(...aa.map((v, i) => v - bb[i])),
            "distance",
          ),
          a: aa,
          b: bb,
        };
      },
      cameraFor(
        selector,
        { direction = [0, 0, -1], up = [0, 1, 0], radius } = {},
      ) {
        const selected = select(selector),
          sphere = selected.boundary.sphere;
        direction = vector(direction, "direction");
        up = vector(up, "up");
        const r = radius ?? Math.max(2, sphere.radius * 1.25);
        if (finite(r, "radius") <= 0)
          throw new RangeError("radius must be positive");
        const result = c.camera.getInvariantFocus(
          sphere.center,
          r,
          up,
          direction,
        );
        return cameraCheck({
          ...initialCamera,
          ...result,
          radiusMax: Math.max(initialCamera.radiusMax, r),
          mode: "orthographic",
        });
      },
      render({ camera, visible = componentIds, highlight = null } = {}) {
        if (disposed) throw new Error("molecular viewer is disposed");
        if (
          !Array.isArray(visible) ||
          visible.some((id) => !representations.has(id))
        )
          throw new TypeError("visible must contain declared component IDs");
        camera = cameraCheck(camera);
        const selected = highlight === null ? null : select(highlight);
        for (const [id, repr] of representations)
          repr.setState({ visible: visible.includes(id) });
        plugin.managers.interactivity.lociHighlights.clearHighlights();
        if (selected)
          plugin.managers.interactivity.lociHighlights.highlightOnly({
            loci: structureModule.StructureElement.Loci.remap(
              structureModule.StructureElement.Loci.all(selected),
              structure,
            ),
          });
        c.syncVisibility();
        c.commit(true);
        c.camera.setState(camera, 0);
        c.requestDraw();
        c.tick(0, { isSynchronous: true, updateControls: false });
      },
      project(position) {
        if (disposed) throw new Error("molecular viewer is disposed");
        position = vector(position, "position");
        const p = [0, 0, 0, 0];
        c.camera.project(p, position);
        return {
          x: finite((p[0] * root.clientWidth) / canvas.width, "screen x"),
          y: finite(
            ((canvas.height - p[1]) * root.clientHeight) / canvas.height,
            "screen y",
          ),
          depth: finite(p[2], "screen depth"),
        };
      },
      dispose() {
        if (!disposed) {
          disposed = true;
          plugin.dispose();
          canvas.remove();
        }
      },
    };
  } catch (error) {
    plugin.dispose();
    canvas.remove();
    throw error;
  }
}
