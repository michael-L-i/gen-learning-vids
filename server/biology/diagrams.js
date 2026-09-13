import { z } from "zod";
const color = z.string().regex(/^#[a-fA-F0-9]{6}$/);
const common = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,24}$/),
  x: z.number().finite().default(0),
  y: z.number().finite().default(0),
  width: z.number().min(160).max(1200).default(800),
  height: z.number().min(40).max(600).default(100),
  fill: color.default("#CCE2BC"),
  stroke: color.default("#367D59"),
});
const compact = (s) =>
  s.replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi, (n) =>
    String(Math.round(Number(n) * 100) / 100),
  );
const ellipsePath = (x, y, rx, ry) =>
  `M ${x - rx} ${y} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;

// Split only at absolute subpath starts so every node stays within the shared
// geometry limit without changing the shape or dropping lipid columns.
function paths(id, suffix, geometry, style) {
  const chunks = [""];
  for (const part of compact(geometry).match(/M[^M]*/g) || []) {
    if (chunks.at(-1).length + part.length > 3800) chunks.push("");
    chunks[chunks.length - 1] += part;
  }
  return chunks.map((path, i) => ({
    id: `${id}-${suffix}${i ? "-" + i : ""}`,
    parent: id,
    type: "path",
    path,
    ...style,
  }));
}

// Authoring helpers compile to ordinary animation nodes. No special renderer or
// fixed scene layout; callers own labels, compartments, proteins and timing.
export function membraneNodes(options) {
  const o = common
    .extend({ columns: z.number().int().min(6).max(32).default(24) })
    .parse(options);
  const { id, x, y, width: w, height: h } = o;
  let heads = "",
    tails = "";
  const r = Math.min(8, w / o.columns / 4, h / 8);
  for (let i = 0; i < o.columns; i++) {
    const cx = ((i + 0.5) * w) / o.columns;
    heads += ellipsePath(cx, r, r, r) + ellipsePath(cx, h - r, r, r);
    for (const dx of [-r * 0.4, r * 0.4]) {
      tails += `M ${cx + dx} ${2 * r} L ${cx + dx - 2} ${h * 0.45} M ${cx + dx} ${h - 2 * r} L ${cx + dx + 2} ${h * 0.55} `;
    }
  }
  return {
    nodes: [
      { id, type: "group", x, y },
      {
        id: id + "-core",
        parent: id,
        type: "rect",
        width: w,
        height: h,
        fill: o.fill,
        opacity: 0.4,
      },
      ...paths(id, "tails", tails, { stroke: o.stroke, strokeWidth: 2 }),
      ...paths(id, "heads", heads, {
        fill: o.fill,
        stroke: o.stroke,
        strokeWidth: 1,
      }),
    ],
    anchors: {
      top: { x: x + w / 2, y },
      bottom: { x: x + w / 2, y: y + h },
      center: { x: x + w / 2, y: y + h / 2 },
    },
  };
}

export function chloroplastNodes(options) {
  const o = common
    .extend({ height: z.number().min(120).max(600).default(320) })
    .parse(options);
  const { id, x, y, width: w, height: h } = o;
  let discs = "",
    links = "";
  const stackX = [0.27, 0.5, 0.73],
    cy = h * 0.57;
  for (const u of stackX)
    for (let row = 0; row < 4; row++)
      discs += ellipsePath(
        w * u,
        cy + (row - 1.5) * h * 0.065,
        w * 0.085,
        h * 0.033,
      );
  for (let i = 0; i < 2; i++)
    links += `M ${w * (stackX[i] + 0.08)} ${cy} L ${w * (stackX[i + 1] - 0.08)} ${cy} `;
  return {
    nodes: [
      { id, type: "group", x, y },
      {
        id: id + "-outer",
        parent: id,
        type: "ellipse",
        x: w / 2,
        y: h / 2,
        width: w,
        height: h,
        fill: o.fill,
        stroke: o.stroke,
        strokeWidth: 3,
      },
      {
        id: id + "-inner",
        parent: id,
        type: "ellipse",
        x: w / 2,
        y: h / 2,
        width: w - 20,
        height: h - 20,
        stroke: o.stroke,
        strokeWidth: 2,
      },
      {
        id: id + "-links",
        parent: id,
        type: "path",
        path: compact(links),
        stroke: o.stroke,
        strokeWidth: 7,
      },
      {
        id: id + "-grana",
        parent: id,
        type: "path",
        path: compact(discs),
        fill: o.stroke,
        stroke: o.fill,
        strokeWidth: 2,
      },
    ],
    anchors: {
      stroma: { x: x + w * 0.5, y: y + h * 0.25 },
      granum: { x: x + w * 0.27, y: y + cy },
      envelope: { x: x + w * 0.91, y: y + h * 0.25 },
    },
  };
}

export const biologyGuide = `For biology, select the visual scale that answers the question: verified microscopy for real anatomy, compartment diagrams for transport, pathways for reactions, or sourced molecular structures for atomic detail. Freely compose standard animation nodes; never imply schematic shapes are measured protein structures. Keep membrane sides and compartment names consistent across shots. Give electrons, protons and carbon visibly different tokens, with a short legend; arrows must distinguish material movement from energy transfer. Use controlled particle motion tied to narration, not random decorative motion. In stoichiometry scenes count atoms explicitly and distinguish net products from recycled intermediates. Do not invent molecular bonds or claim particle counts represent stoichiometry unless they do. Authoring agents with file access can import membraneNodes/chloroplastNodes from server/biology/diagrams.js to generate ordinary grouped nodes plus absolute anchors; JSON-only planners must compose standard nodes themselves. Photosynthesis: label stroma and lumen; protons build up in the lumen and return via ATP synthase to the stroma, where ATP is made. Oxygen is derived from water; carbon comes from CO2. Show PSII before PSI in linear electron flow, both receiving light; NADPH is produced on the stromal side. The Calvin cycle consumes ATP and NADPH and regenerates RuBP; G3P is its net carbohydrate product, not direct glucose. For three CO2, distinguish six G3P formed from one net G3P and five recycled; total cost nine ATP and six NADPH. This is a schematic teaching route, not a biochemical simulator; simplified carrier chains and omitted pathways must be identified.`;
