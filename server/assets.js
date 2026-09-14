import fs from "node:fs/promises";
import path from "node:path";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { Parser } from "htmlparser2";
import { atomicWrite, readJson, writeJson } from "./store.js";

export { assetSchema, assetsSchema } from "./asset-schema.js";
import { assetSchema, assetsSchema } from "./asset-schema.js";
const agent =
  "LessonLibrary/0.1 (https://github.com/michael-L-i/gen-learning-vids)";
export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  return (
    isIP(address) === 6 &&
    /^[23]/i.test(address) &&
    !/^2001:db8:/i.test(address)
  );
}
export async function publicTarget(value, resolve = lookup) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443")
  )
    throw new Error(
      "Image sources must use public HTTPS URLs without credentials",
    );
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const records = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await resolve(host, { all: true });
  if (!records.length || records.some((r) => !publicAddress(r.address)))
    throw new Error("Image sources cannot address local or private networks");
  return { url: u, address: records[0] };
}

// Resolve and pin the public address on every request, including redirects.
export async function downloadPublic(
  value,
  { maxBytes = 16 * 1024 * 1024, redirects = 4 } = {},
) {
  const { url, address } = await publicTarget(value);
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        agent: false,
        family: address.family,
        lookup: (_host, options, cb) =>
          options?.all
            ? cb(null, [address])
            : cb(null, address.address, address.family),
        headers: { "User-Agent": agent, Accept: "image/*,application/json" },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          if (!res.headers.location || redirects === 0)
            return reject(new Error("Too many image redirects"));
          return resolve(
            downloadPublic(new URL(res.headers.location, url).href, {
              maxBytes,
              redirects: redirects - 1,
            }),
          );
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(
            new Error(`Image download returned HTTP ${res.statusCode}`),
          );
        }
        if (Number(res.headers["content-length"] || 0) > maxBytes) {
          res.destroy();
          return reject(new Error("Image exceeds download size limit"));
        }
        const chunks = [];
        let size = 0;
        res.on("data", (b) => {
          size += b.length;
          if (size > maxBytes) {
            res.destroy(new Error("Image exceeds download size limit"));
          } else chunks.push(b);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            bytes: Buffer.concat(chunks),
            url: url.href,
            contentType: res.headers["content-type"] || "",
          }),
        );
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error("Image download timed out")),
      30000,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
  });
}
function plain(html) {
  let result = "";
  const p = new Parser(
    { ontext: (t) => (result += t) },
    { decodeEntities: true },
  );
  p.end(String(html || ""));
  return result.replace(/\s+/g, " ").trim();
}
export async function commonsImages(query, { exact = false } = {}) {
  if (typeof query !== "string" || !query.trim() || query.length > 500)
    throw new Error(
      "Provide an image search or Commons file title under 500 characters",
    );
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "1600",
    ...(exact
      ? { titles: query.startsWith("File:") ? query : `File:${query}` }
      : {
          generator: "search",
          gsrsearch: query,
          gsrnamespace: "6",
          gsrlimit: "8",
        }),
  });
  const { bytes } = await downloadPublic(url.href, {
    maxBytes: 2 * 1024 * 1024,
  });
  const data = JSON.parse(bytes.toString());
  if (data.error) throw new Error(data.error.info || "Commons search failed");
  return Object.values(data.query?.pages || {})
    .filter((p) => p.imageinfo && /\.(png|jpe?g|webp|avif)$/i.test(p.title))
    .map((p) => {
      const i = p.imageinfo[0],
        m = i.extmetadata,
        title = plain(m.ObjectName?.value || p.title.replace(/^File:/, ""));
      const asset = {
        id: ("image-" + p.pageid).slice(0, 64),
        url: i.thumburl || i.url,
        sourceUrl: i.descriptionurl,
        title: title.slice(0, 300),
        creator: plain(m.Artist?.value || m.Attribution?.value).slice(0, 500),
        license: plain(m.LicenseShortName?.value),
        licenseUrl: String(m.LicenseUrl?.value || "").replace(
          /^http:/,
          "https:",
        ),
        alt: plain(m.ImageDescription?.value || title).slice(0, 2000),
      };
      return {
        fileTitle: p.title,
        asset,
        complete: assetSchema.safeParse(asset).success,
      };
    });
}

export async function prepareAssets(
  specs,
  dir,
  { fetchImage = downloadPublic } = {},
) {
  const assets = assetsSchema.parse(specs);
  if (new Set(assets.map((a) => a.id)).size !== assets.length)
    throw new Error("Image asset IDs must be unique");
  await fs.mkdir(dir, { recursive: true });
  const old = await readJson(path.join(dir, "manifest.json"), { assets: [] });
  const prepared = [];
  for (const a of assets) {
    const specHash = createHash("sha256")
      .update(JSON.stringify(a))
      .digest("hex");
    const cached = old.assets.find(
      (x) => x.id === a.id && x.specHash === specHash,
    );
    if (cached) {
      const bytes = await fs
        .readFile(path.join(dir, `${a.id}.png`))
        .catch(() => null);
      if (
        bytes &&
        createHash("sha256").update(bytes).digest("hex") === cached.sha256
      ) {
        prepared.push(cached);
        continue;
      }
    }
    const { bytes, url } = await fetchImage(a.url);
    if (bytes.length > 16 * 1024 * 1024)
      throw new Error("Image exceeds download size limit");
    const raster =
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
      (bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP") ||
      (bytes.toString("ascii", 4, 8) === "ftyp" &&
        /avif|avis/.test(bytes.toString("ascii", 8, 32)));
    if (!raster) throw new Error("Source is not a supported raster image");
    const input = sharp(bytes, { limitInputPixels: 40000000, animated: false });
    const info = await input.metadata();
    if (
      !["jpeg", "png", "webp", "avif"].includes(info.format) ||
      (info.pages || 1) > 1
    )
      throw new Error("Use a still PNG, JPEG, WebP or AVIF image");
    const png = await input
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    const output = await sharp(png).metadata();
    await atomicWrite(path.join(dir, `${a.id}.png`), png);
    prepared.push({
      ...a,
      file: `${a.id}.png`,
      specHash,
      sha256: createHash("sha256").update(png).digest("hex"),
      originalSha256: createHash("sha256").update(bytes).digest("hex"),
      resolvedUrl: url,
      fetchedAt: new Date().toISOString(),
      width: output.width,
      height: output.height,
      changes:
        "Converted to PNG, orientation normalized and resized if needed. May be framed or annotated in the lesson.",
    });
  }
  await writeJson(path.join(dir, "manifest.json"), { assets: prepared });
  return prepared;
}
export function assetCredits(assets) {
  return (
    "# Image credits\n\n" +
    assets
      .map(
        (a) =>
          `- **${a.title}** — ${a.creator}. [${a.license}](${a.licenseUrl}). [Source](${a.sourceUrl}). ${a.changes}`,
      )
      .join("\n\n") +
    "\n"
  );
}
