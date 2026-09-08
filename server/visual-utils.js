export const palettes = {
  paper: {
    bg: "#eee8dc",
    fg: "#272b29",
    accent: "#b15335",
    card: "#fbf8f0",
    muted: "#77756a",
  },
  midnight: {
    bg: "#17242a",
    fg: "#f4f1e8",
    accent: "#e5b86d",
    card: "#24363d",
    muted: "#adc0c3",
  },
  sage: {
    bg: "#dfe8de",
    fg: "#244c40",
    accent: "#32705a",
    card: "#f0f5eb",
    muted: "#638071",
  },
};
export const escapeXml = (s) =>
  String(s).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
export function wrap(text, max) {
  const words = String(text)
    .split(/\s+/)
    .flatMap((w) =>
      w.length > max ? w.match(new RegExp(`.{1,${max}}`, "g")) : [w],
    );
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max && line) {
      lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines;
}
export const textLines = (
  text,
  x,
  y,
  size,
  color,
  max,
  lineHeight = 1.3,
  family = "sans-serif",
) =>
  `<text x="${x}" y="${y}" fill="${color}" font-family="${family}" font-size="${size}">${wrap(
    text,
    max,
  )
    .map(
      (line, i) =>
        `<tspan x="${x}" dy="${i ? size * lineHeight : 0}">${escapeXml(line)}</tspan>`,
    )
    .join("")}</text>`;
