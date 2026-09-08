import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";
import { palettes, escapeXml as esc, textLines } from "./visual-utils.js";
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const math = mathjax.document("", {
  InputJax: new TeX({
    packages: ["base", "ams"],
    maxBuffer: 2000,
    maxMacros: 100,
  }),
  OutputJax: new SVG({ fontCache: "none" }),
});
export const resolvePalette = (style, scene) =>
  palettes[style] ||
  palettes[
    scene?.visual === "code"
      ? "midnight"
      : scene?.visual === "diagram"
        ? "sage"
        : "paper"
  ];
export function frameCount(scene) {
  const c = scene.content;
  return c?.kind === "equation"
    ? c.steps.length
    : c?.kind === "code"
      ? Math.max(1, c.highlightLines.length)
      : c?.kind === "diagram"
        ? c.nodes.length
        : scene.visual === "steps"
          ? scene.points.length
          : 1;
}
function formula(tex, x, y, width, height, color) {
  if (
    /\\(?:href|url|html|style|class|cssId|require|def|newcommand|includegraphics)\b/.test(
      tex,
    )
  )
    throw new Error("Equations support mathematical TeX only.");
  const node = math.convert(tex, { display: true });
  const svg = adaptor.outerHTML(adaptor.firstChild(node));
  if (svg.includes("data-mjx-error"))
    throw new Error(`Invalid equation: ${tex}`);
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
  if (!viewBox) throw new Error("Equation could not be typeset.");
  const [, , vw, vh] = viewBox.split(/\s+/).map(Number);
  const scale = Math.min(0.033, width / vw, height / vh);
  const fittedWidth = vw * scale,
    fittedHeight = vh * scale;
  y += (height - fittedHeight) / 2;
  width = fittedWidth;
  height = fittedHeight;
  return svg.replace(
    /^<svg[^>]*>/,
    `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${viewBox}" preserveAspectRatio="xMinYMid meet" color="${color}" xmlns="http://www.w3.org/2000/svg">`,
  );
}
const rect = (x, y, w, h, fill, stroke = "none") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${stroke}"/>`;
const text = (s, x, y, size, color) =>
  `<text x="${x}" y="${y}" font-family="sans-serif" font-size="${size}" fill="${color}">${esc(s)}</text>`;
function codeContent(c, p, step) {
  const active = c.highlightLines[Math.min(step, c.highlightLines.length - 1)];
  let s =
    rect(64, 194, 1152, 377, p.card) + text(c.language, 86, 222, 16, p.muted);
  c.code.split("\n").forEach((line, i) => {
    const y = 251 + i * 21;
    if (i + 1 === active)
      s += rect(76, y - 17, 1128, 22, p.accent) + `<g fill="${p.bg}">`;
    const color = i + 1 === active ? p.bg : p.fg;
    s += text(String(i + 1).padStart(2, "0"), 88, y, 15, color);
    s += `<text x="135" y="${y}" font-family="monospace" font-size="19" xml:space="preserve" fill="${color}">${esc(line)}</text>`;
    if (i + 1 === active) s += "</g>";
  });
  if (c.output)
    s += textLines(
      "Output: " + c.output,
      76,
      598,
      18,
      p.muted,
      105,
      1.2,
      "monospace",
    );
  return s;
}
function equations(c, p, step) {
  let s = "";
  const visible = Math.min(c.steps.length, step + 1);
  c.steps.slice(0, visible).forEach((v, i) => {
    const y = 198 + i * 94;
    s += rect(64, y, 1152, 83, i === visible - 1 ? p.card : p.bg);
    s += text(String(i + 1), 82, y + 45, 18, p.accent);
    s += formula(v.tex, 119, y + 8, 650, 65, p.fg);
    s += textLines(v.explanation, 805, y + 29, 18, p.muted, 35, 1.25);
  });
  return s;
}
function diagram(c, p, step) {
  const visible = c.nodes.slice(0, Math.min(c.nodes.length, step + 1));
  const nodes = new Map(
    visible.map((n) => [
      n.id,
      { ...n, cx: 180 + n.x * 9.2, cy: 245 + n.y * 2.65 },
    ]),
  );
  let s = "";
  for (const e of c.edges) {
    const a = nodes.get(e.from),
      b = nodes.get(e.to);
    if (!a || !b) continue;
    const dx = b.cx - a.cx,
      dy = b.cy - a.cy;
    if (!dx && !dy) continue;
    const f = 1 / Math.max(Math.abs(dx) / 104, Math.abs(dy) / 38);
    const x1 = a.cx + dx * Math.min(0.4, f),
      y1 = a.cy + dy * Math.min(0.4, f),
      x2 = b.cx - dx * Math.min(0.4, f),
      y2 = b.cy - dy * Math.min(0.4, f);
    s += `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${p.accent}" stroke-width="3" fill="none" marker-end="url(#arrow)"/>`;
    if (e.label)
      s += textLines(
        e.label,
        (a.cx + b.cx) / 2 - 55,
        (a.cy + b.cy) / 2 - 12,
        16,
        p.muted,
        23,
      );
  }
  for (const n of nodes.values()) {
    s +=
      n.shape === "ellipse"
        ? `<ellipse cx="${n.cx}" cy="${n.cy}" rx="105" ry="40" fill="${p.card}" stroke="${p.accent}" stroke-width="2"/>`
        : rect(n.cx - 105, n.cy - 40, 210, 80, p.card, p.accent);
    s += textLines(
      n.label,
      n.cx - 88,
      n.cy - (n.label.length > 22 ? 10 : -7),
      19,
      p.fg,
      22,
      1.1,
    );
  }
  return s;
}
function plot(c, p) {
  const all = c.series.flatMap((s) => s.points);
  const xs = all.map((v) => v.x),
    ys = all.map((v) => v.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(0, ...ys),
    maxY = Math.max(0, ...ys);
  const X = (x) => 150 + ((x - minX) / (maxX - minX || 1)) * 940,
    Y = (y) => 535 - ((y - minY) / (maxY - minY || 1)) * 285;
  let s = "";
  for (let i = 0; i <= 4; i++) {
    const x = minX + ((maxX - minX) * i) / 4,
      y = minY + ((maxY - minY) * i) / 4;
    s += `<path d="M150 ${Y(y)}H1090 M${X(x)} 250V535" stroke="${p.muted}" opacity=".2"/>`;
    s +=
      text(Number(x.toPrecision(4)), X(x) - 12, 559, 16, p.muted) +
      text(Number(y.toPrecision(4)), 76, Y(y) + 6, 16, p.muted);
  }
  s += `<path d="M150 245V535H1100" fill="none" stroke="${p.fg}" stroke-width="2"/>`;
  const colors = [p.accent, "#597fbd", "#ba6287"];
  c.series.forEach((series, i) => {
    s += `<polyline points="${series.points.map((v) => `${X(v.x)},${Y(v.y)}`).join(" ")}" fill="none" stroke="${colors[i]}" stroke-width="4"/>`;
    s += text(series.name, 160 + i * 325, 218, 18, colors[i]);
  });
  s += text(c.xLabel, 500, 596, 19, p.fg) + text(c.yLabel, 76, 240, 17, p.fg);
  return s;
}
function processSteps(scene, p, step) {
  const n = scene.points.length,
    w = (1152 - (n - 1) * 22) / n;
  let s = "";
  scene.points.slice(0, step + 1).forEach((point, i) => {
    const x = 64 + i * (w + 22);
    if (i)
      s += `<path d="M${x - 21} 364H${x - 5}" stroke="${p.accent}" stroke-width="2" marker-end="url(#arrow)"/>`;
    s +=
      rect(x, 267, w, 220, p.card) +
      text(String(i + 1).padStart(2, "0"), x + 20, 303, 20, p.accent) +
      textLines(point, x + 20, 346, 18, p.fg, Math.floor((w - 40) / 10), 1.2);
  });
  return s;
}
export function contentSvg(scene, index, total, p, step = Infinity) {
  const c = scene.content;
  const body =
    c?.kind === "code"
      ? codeContent(c, p, step)
      : c?.kind === "equation"
        ? equations(c, p, step)
        : c?.kind === "diagram"
          ? diagram(c, p, step)
          : c?.kind === "plot"
            ? plot(c, p)
            : processSteps(scene, p, step);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${p.accent}"/></marker></defs>${rect(0, 0, 1280, 720, p.bg)}${text(scene.visual.toUpperCase(), 64, 48, 14, p.muted)}${text(`${index + 1} / ${total}`, 1150, 48, 16, p.muted)}${textLines(scene.title, 64, 108, 37, p.fg, 55, 1.15)}${body}<path d="M64 630H1216" stroke="${p.muted}" opacity=".3"/>${textLines(scene.takeaway, 64, 664, 20, p.muted, 106, 1.2)}<rect x="0" y="714" width="${(1280 * (index + 1)) / total}" height="6" fill="${p.accent}"/></svg>`;
}
