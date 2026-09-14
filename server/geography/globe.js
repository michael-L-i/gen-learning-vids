import fs from "node:fs";
import {
  geoOrthographic,
  geoPath,
  geoGraticule10,
  geoDistance,
  geoCentroid,
} from "d3-geo";
import { escapeXml } from "../visual-utils.js";
const atlas = JSON.parse(
  fs.readFileSync(new URL("./data/countries.geojson", import.meta.url), "utf8"),
);
const byId = new Map(atlas.features.map((f) => [f.id, f]));
const graticule = geoGraticule10();
export const geographyVersion = "natural-earth-110m-d3-1";
export const countryCatalog = atlas.features.map((f) => ({
  id: f.id,
  name: f.properties.name,
}));
export function validateCountries(ids) {
  for (const id of ids)
    if (!byId.has(id)) throw new Error(`Unknown geographic country ID: ${id}`);
}
export function globeProjection({
  width = 600,
  height = 600,
  longitude = 0,
  latitude = 20,
  zoom = 1,
} = {}) {
  return geoOrthographic()
    .rotate([-longitude, -latitude, 0])
    .translate([width / 2, height / 2])
    .scale(Math.min(width, height) * 0.46 * zoom)
    .precision(0.35)
    .clipAngle(90)
    .clipExtent([
      [0, 0],
      [width, height],
    ]);
}
export function globePoint(lonlat, options = {}) {
  const center = [options.longitude || 0, options.latitude ?? 20];
  if (geoDistance(center, lonlat) >= Math.PI / 2) return null;
  const point = globeProjection(options)(lonlat);
  const { width = 600, height = 600 } = options;
  return point[0] >= 0 &&
    point[0] <= width &&
    point[1] >= 0 &&
    point[1] <= height
    ? point
    : null;
}
export function countryPoint(id, options = {}) {
  validateCountries([id]);
  return globePoint(geoCentroid(byId.get(id)), options);
}
// Geometry and camera are independent of any lesson, statistic or color palette.
export function globeSvg(options = {}) {
  const {
    id = "globe",
    width = 600,
    height = 600,
    highlights = [],
    highlightOpacity = 1,
    ocean = "#142B3D",
    land = "#455B68",
    border = "#8DABB5",
    grid = "#5B7988",
    markers = false,
  } = options;
  validateCountries(highlights.map((h) => h.country));
  const key = String(id).replace(/[^a-zA-Z0-9_-]/g, "_");
  const projection = globeProjection(options),
    path = geoPath(projection).digits(2),
    radius = Math.min(width, height) * 0.46 * (options.zoom ?? 1);
  const colors = new Map(highlights.map((h) => [h.country, h]));
  const geography = atlas.features
    .map((f) => {
      const d = path(f);
      if (!d) return "";
      const c = colors.get(f.id);
      return `<path data-country="${f.id}" d="${d}" fill="${escapeXml(land)}" stroke="${escapeXml(border)}" stroke-width="0.55"/>${c ? `<path d="${d}" fill="${escapeXml(c.color)}" opacity="${highlightOpacity * (c.opacity ?? 1)}" stroke="${escapeXml(c.color)}" stroke-width="1.2"/>` : ""}`;
    })
    .join("");
  const points = markers
    ? highlights
        .map((h) => {
          const p = countryPoint(h.country, options);
          return p
            ? `<circle cx="${p[0]}" cy="${p[1]}" r="4.5" fill="${escapeXml(h.color)}" stroke="#FFFFFF" stroke-width="1.2" opacity="${highlightOpacity * (h.opacity ?? 1)}"/>`
            : "";
        })
        .join("")
    : "";
  return `<svg width="${width}" height="${height}" overflow="hidden"><defs><radialGradient id="${key}-shade" cx="32%" cy="26%" r="78%"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.08"/><stop offset="0.65" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.42"/></radialGradient></defs><circle cx="${width / 2}" cy="${height / 2}" r="${radius + 3}" fill="none" stroke="${escapeXml(grid)}" stroke-width="3" opacity="0.3"/><path d="${path({ type: "Sphere" })}" fill="${escapeXml(ocean)}"/><path d="${path(graticule)}" fill="none" stroke="${escapeXml(grid)}" stroke-width="0.5" opacity="0.45"/>${geography}<circle cx="${width / 2}" cy="${height / 2}" r="${radius}" fill="url(#${key}-shade)"/>${points}</svg>`;
}
