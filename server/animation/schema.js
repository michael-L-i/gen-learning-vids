import { validateCountries } from "../geography/globe.js";
import { z } from "zod";
const number = z.number().finite();
const color = z.string().regex(/^(#[a-fA-F0-9]{6}|none)$/);
export const animationSchema = z.object({
  kind: z.literal("animation"),
  background: color,
  beats: z
    .array(
      z.object({
        id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
        narration: z.string().min(1).max(500),
        seconds: number.min(0.5).max(20),
      }),
    )
    .min(1)
    .max(8),
  nodes: z
    .array(
      z.object({
        id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
        parent: z.string().max(40).nullable().default(null),
        type: z.enum([
          "group",
          "rect",
          "ellipse",
          "text",
          "path",
          "image",
          "globe",
        ]),
        longitude: number.min(-3600).max(3600).default(0),
        latitude: number.min(-90).max(90).default(20),
        zoom: number.min(0.5).max(4).default(1),
        highlightOpacity: number.min(0).max(1).default(1),
        geography: z
          .object({
            highlights: z
              .array(
                z.object({ country: z.string().regex(/^[A-Z0-9]{3}$/), color }),
              )
              .max(80)
              .default([]),
            ocean: color.default("#142B3D"),
            land: color.default("#455B68"),
            border: color.default("#8DABB5"),
            grid: color.default("#5B7988"),
            markers: z.boolean().default(false),
          })
          .default({}),
        asset: z.string().max(64).default(""),
        fit: z.enum(["contain", "cover"]).default("contain"),
        x: number.min(-2560).max(2560).default(0),
        y: number.min(-1440).max(1440).default(0),
        width: number.min(0).max(2560).default(0),
        height: number.min(0).max(1440).default(0),
        rotation: number.min(-3600).max(3600).default(0),
        scale: number.min(0).max(10).default(1),
        opacity: number.min(0).max(1).default(1),
        fill: color.default("none"),
        stroke: color.default("none"),
        strokeWidth: number.min(0).max(20).default(2),
        radius: number.min(0).max(100).default(0),
        text: z.string().max(240).default(""),
        fontSize: number.min(16).max(96).default(28),
        fontFamily: z.enum(["sans", "mono"]).default("sans"),
        fontWeight: z.enum(["normal", "bold"]).default("normal"),
        textAlign: z.enum(["left", "center", "right"]).default("left"),
        verticalAlign: z.enum(["top", "middle", "bottom"]).default("top"),
        padding: number.min(0).max(64).default(0),
        lineHeight: number.min(1).max(2).default(1.25),
        // Only SVG path geometry. No markup, URLs, scripts, or external assets.
        path: z
          .string()
          .max(4000)
          .regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]*$/)
          .default(""),
      }),
    )
    .min(1)
    .max(100),
  tracks: z
    .array(
      z.object({
        node: z.string().max(40),
        property: z.union([
          z.string().regex(/^highlight:[A-Z0-9]{3}$/),
          z.enum([
            "x",
            "y",
            "rotation",
            "scale",
            "opacity",
            "draw",
            "longitude",
            "latitude",
            "zoom",
            "highlightOpacity",
          ]),
        ]),
        beat: z.string().max(40),
        start: number.min(0).max(1),
        end: number.min(0).max(1),
        from: number.min(-3600).max(3600),
        to: number.min(-3600).max(3600),
        easing: z.enum(["linear", "smooth", "accelerate", "decelerate"]),
      }),
    )
    .max(180),
});
export function validateAnimation(value) {
  const a = animationSchema.parse(value);
  const nodes = new Map(a.nodes.map((n) => [n.id, n]));
  const beats = new Map(a.beats.map((b, i) => [b.id, i]));
  if (nodes.size !== a.nodes.length || beats.size !== a.beats.length)
    throw new Error("Animation IDs must be unique.");
  for (const node of a.nodes) {
    if (node.type === "image" && (!node.asset || !node.width || !node.height))
      throw new Error(
        "Image nodes require an asset ID and positive width and height.",
      );
    if (node.type === "globe") {
      if (!node.width || !node.height)
        throw new Error("Globe nodes require positive width and height.");
      validateCountries(node.geography.highlights.map((h) => h.country));
      if (
        new Set(node.geography.highlights.map((h) => h.country)).size !==
        node.geography.highlights.length
      )
        throw new Error("Country highlights must be unique.");
    }
    const seen = new Set([node.id]);
    let parent = node.parent;
    while (parent) {
      if (
        seen.has(parent) ||
        !nodes.has(parent) ||
        nodes.get(parent).type !== "group"
      )
        throw new Error(
          "Animation parents must reference groups without cycles.",
        );
      seen.add(parent);
      parent = nodes.get(parent).parent;
    }
  }
  const ranges = new Map();
  for (const t of a.tracks) {
    if (!nodes.has(t.node) || !beats.has(t.beat) || t.end <= t.start)
      throw new Error("Animation track has an invalid target or time range.");
    if (
      (["opacity", "draw", "highlightOpacity"].includes(t.property) ||
        t.property.startsWith("highlight:")) &&
      [t.from, t.to].some((v) => v < 0 || v > 1)
    )
      throw new Error("Opacity and draw values must be between zero and one.");
    if (t.property === "scale" && [t.from, t.to].some((v) => v < 0 || v > 10))
      throw new Error("Scale must be between zero and ten.");
    if (t.property === "draw" && nodes.get(t.node).type !== "path")
      throw new Error("Draw tracks require a path.");
    if (
      ["longitude", "latitude", "zoom", "highlightOpacity"].includes(
        t.property,
      ) &&
      nodes.get(t.node).type !== "globe"
    )
      throw new Error("Geography tracks require a globe node.");
    if (
      t.property === "latitude" &&
      [t.from, t.to].some((v) => v < -90 || v > 90)
    )
      throw new Error("Latitude must be between -90 and 90.");
    if (t.property === "zoom" && [t.from, t.to].some((v) => v < 0.5 || v > 4))
      throw new Error("Globe zoom must be between 0.5 and 4.");
    if (
      t.property.startsWith("highlight:") &&
      (nodes.get(t.node).type !== "globe" ||
        !nodes
          .get(t.node)
          .geography.highlights.some((h) => h.country === t.property.slice(10)))
    )
      throw new Error(
        "Country highlight tracks must reference a highlighted country on a globe.",
      );
    const key = `${t.node}:${t.property}`;
    const range = [beats.get(t.beat) + t.start, beats.get(t.beat) + t.end];
    if ((ranges.get(key) || []).some((r) => range[0] < r[1] && range[1] > r[0]))
      throw new Error("Tracks for the same property cannot overlap.");
    ranges.set(key, [...(ranges.get(key) || []), range]);
  }
  return a;
}
export const animationGuide = `Animation content uses kind="animation", background (#RRGGBB), beats, nodes, tracks. Canvas 1280x720; safe margin 48. No automatic title/footer: include a short title as a text node if useful. Aim for a clear focal object and generous whitespace.
Typography: text nodes support fontFamily:sans|mono, fontWeight:normal|bold, textAlign:left|center|right, verticalAlign:top|middle|bottom, padding (pixels), lineHeight (1–2). Defaults are sans, normal, left, top, 0, 1.25. x/y/width/height describe the OUTER text box; alignment and padding are calculated by the renderer. For a card label give it the same box as the card, padding 16–24, verticalAlign middle. Do not guess a centered label's x/y from character counts. Align related headings, labels and paragraphs to shared edges; use consistent gaps of at least 16 pixels. Do not place simultaneous text boxes over one another. For code use fontFamily mono, left alignment, preserve indentation and explicit newlines; monospace lines do not wrap. Use one multiline code node so line spacing is uniform, and position line highlights at padding + line index * fontSize * lineHeight. History timelines: place each date and its caption in one consistently aligned group, center groups on their date anchors, and stagger close events above/below the axis instead of squeezing labels together. Keep generous empty space, short labels, and one main explanation at a time. Typography may vary by lesson; avoid unnecessary panels and repeated card grids.
Beats: {id,narration,seconds}; narration is synthesized per beat, giving real audio boundaries. Scene narration MUST equal beat narrations joined with spaces. Aim for 20–30 spoken words for a 10–15 second clip. seconds is a minimum, never truncate speech.
Nodes: {id,parent:null or group ID,type:group|rect|ellipse|text|path,x,y,width,height,rotation,scale,opacity,fill,stroke,strokeWidth,radius,text,fontSize,path}. Defaults: x/y/width/height/rotation=0,scale/opacity=1,fill/stroke="none",strokeWidth=2,radius=0,text/path="",fontSize=28. Colors #RRGGBB or none. Parent coordinates are local; a group moves attached shapes/labels together. Rect x/y is top left; ellipse x/y is center and width/height are full diameters. Text x/y is top left, width controls word wrapping, height optional bounds, fontSize>=16. Paths use SVG geometry only, local coordinates. Rotation/scale pivot around node x/y. Use actual objects and spatial relationships, not boxes full of prose. Keep labels short.
Tracks: {node,property:x|y|rotation|scale|opacity|draw,beat,start,end,from,to,easing:linear|smooth|accelerate|decelerate}. start/end are fractions of that beat, 0<=start<end<=1. Values hold after a track; before the first track use from. No overlapping tracks on a property. draw is path stroke reveal 0–1; use stroke with fill none. Constant acceleration position uses accelerate easing (t squared), not arbitrary easing. Opacity/draw 0–1. At most 100 nodes, 180 tracks, 8 beats. Shapes are schematic, so do not imply anatomical detail or physical accuracy beyond what is actually represented.`;

export const imageGuide = `Optional lesson assets contain id, url (public HTTPS image download), sourceUrl (original source page), title, creator, license, licenseUrl, alt. Use only verified assets supplied in context or discovered by an agent with image-search; never invent image URLs or licensing. Image nodes use type=image, asset=asset ID, width/height, fit=contain|cover. Contain preserves the whole image; cover crops. They support the same grouping and motion tracks as shapes. Use photographs to establish real objects, and diagrams for hidden processes. Choose the balance for the explanation; no fixed photo quota. Review each image before describing it. Distinguish schematics from literal device layouts, and keep source/creator/license credits readable in scenes that show photographs. If no verified assets are available, use diagrams and return assets=[].`;

export const geographyGuide = `For geographic explanations use type=globe nodes within animation scenes. Set x,y,width,height (a square works well), longitude and latitude of the camera center, zoom (0.5–4), highlightOpacity (0–1), and geography:{highlights:[{country:"VEN",color:"#E9B86B"}],ocean,land,border,grid,markers}. Country IDs are Natural Earth ADM0_A3 (usually ISO alpha-3); examples USA,CAN,VEN,SAU,IRN,IRQ,KWT,ARE,RUS,LBY. Only use supported IDs; unknown IDs fail. All colors are #RRGGBB. Omitted geography fields use restrained defaults. The engine draws real boundaries with correct spherical horizon and antimeridian clipping. Tracks may animate longitude,latitude,zoom,highlightOpacity on globe nodes. Use property="highlight:SAU" (0–1) to animate one country already listed in geography.highlights; it multiplies the overall highlightOpacity. Use unwrapped longitudes for smooth seam crossing (170 to 190, not 170 to -170), bounded latitude, and smooth camera easing. Fade in country highlights after arrival, hold for narration, and keep country names and exact figures in clean adjacent text nodes. Geographic area must not imply statistical magnitude; use labeled values or calibrated bars. Reserve a footer with data source, reference year, units and relevant scope limitations. Boundary data is generalized Natural Earth de facto geography; choose more detailed data for close local maps. Do not imply flags, oil fields or historic borders from modern national polygons. Globe scenes remain freely composed with text, charts, photographs and other animation nodes.`;
