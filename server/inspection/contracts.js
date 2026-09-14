const finite = (v, n) => {
  if (!Number.isFinite(v)) throw new Error(`${n} must be finite`);
  return v;
};
export function sourceReference(source) {
  if (!source || typeof source !== "object")
    throw new Error("Source reference required");
  const result = {};
  for (const key of ["id", "title", "url", "attribution", "rights"]) {
    if (typeof source[key] !== "string" || !source[key].trim())
      throw new Error(`Source ${key} required`);
    result[key] = source[key];
  }
  const url = new URL(result.url);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Source reference URL must be HTTP(S)");
  return Object.freeze(result);
}
export function regionRect(region, width, height) {
  finite(width, "image width");
  finite(height, "image height");
  if (width <= 0 || height <= 0)
    throw new Error("Image dimensions must be positive");
  const r = Object.fromEntries(
    ["x", "y", "width", "height"].map((k) => [
      k,
      finite(region?.[k], `region ${k}`),
    ]),
  );
  if (
    r.x < 0 ||
    r.y < 0 ||
    r.width <= 0 ||
    r.height <= 0 ||
    r.x + r.width > width ||
    r.y + r.height > height
  )
    throw new Error("Region must be a nonempty rectangle inside the image");
  return r;
}
export function interpolateRegion(from, to, amount) {
  finite(amount, "amount");
  if (amount < 0 || amount > 1)
    throw new Error("amount must be between 0 and 1");
  const blend = {};
  for (const key of ["x", "y", "width", "height"])
    blend[key] = finite(
      finite(from[key], key) * (1 - amount) + finite(to[key], key) * amount,
      `interpolated ${key}`,
    );
  if (blend.width <= 0 || blend.height <= 0)
    throw new Error("Region dimensions must be positive");
  return blend;
}
/** UTF-16 offsets, matching DOM Range. Refuse splitting a surrogate pair. */
export function textSpan(text, { start, end, quote } = {}) {
  if (typeof text !== "string") throw new Error("Text must be a string");
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end > text.length ||
    end <= start
  )
    throw new Error("Text range must have valid nonempty UTF-16 offsets");
  const splits = (i) =>
    i > 0 &&
    i < text.length &&
    /[\uD800-\uDBFF]/.test(text[i - 1]) &&
    /[\uDC00-\uDFFF]/.test(text[i]);
  if (splits(start) || splits(end))
    throw new Error("Text range cannot split a Unicode surrogate pair");
  const selected = text.slice(start, end);
  if (quote !== undefined && quote !== selected)
    throw new Error("Text quote does not match the supplied offsets");
  return { start, end, text: selected };
}
