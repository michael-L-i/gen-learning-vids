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
        type: z.enum(["group", "rect", "ellipse", "text", "path"]),
        x: number.min(-2560).max(2560).default(0),
        y: number.min(-1440).max(1440).default(0),
        width: number.min(0).max(2560).default(0),
        height: number.min(0).max(1440).default(0),
        rotation: number.min(-3600).max(3600).default(0),
        scale: number.min(0.01).max(10).default(1),
        opacity: number.min(0).max(1).default(1),
        fill: color.default("none"),
        stroke: color.default("none"),
        strokeWidth: number.min(0).max(20).default(2),
        radius: number.min(0).max(100).default(0),
        text: z.string().max(240).default(""),
        fontSize: number.min(16).max(96).default(28),
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
        property: z.enum(["x", "y", "rotation", "scale", "opacity", "draw"]),
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
      ["opacity", "draw"].includes(t.property) &&
      [t.from, t.to].some((v) => v < 0 || v > 1)
    )
      throw new Error("Opacity and draw values must be between zero and one.");
    if (t.property === "scale" && [t.from, t.to].some((v) => v <= 0 || v > 10))
      throw new Error("Scale must be positive and at most ten.");
    if (t.property === "draw" && nodes.get(t.node).type !== "path")
      throw new Error("Draw tracks require a path.");
    const key = `${t.node}:${t.property}`;
    const range = [beats.get(t.beat) + t.start, beats.get(t.beat) + t.end];
    if ((ranges.get(key) || []).some((r) => range[0] < r[1] && range[1] > r[0]))
      throw new Error("Tracks for the same property cannot overlap.");
    ranges.set(key, [...(ranges.get(key) || []), range]);
  }
  return a;
}
export const animationGuide = `Animation content uses kind="animation", background (#RRGGBB), beats, nodes, tracks. Canvas 1280x720; safe margin 48. No automatic title/footer: include a short title as a text node if useful. Aim for a clear focal object and generous whitespace.
Beats: {id,narration,seconds}; narration is synthesized per beat, giving real audio boundaries. Scene narration MUST equal beat narrations joined with spaces. Aim for 20–30 spoken words for a 10–15 second clip. seconds is a minimum, never truncate speech.
Nodes: {id,parent:null or group ID,type:group|rect|ellipse|text|path,x,y,width,height,rotation,scale,opacity,fill,stroke,strokeWidth,radius,text,fontSize,path}. Defaults: x/y/width/height/rotation=0,scale/opacity=1,fill/stroke="none",strokeWidth=2,radius=0,text/path="",fontSize=28. Colors #RRGGBB or none. Parent coordinates are local; a group moves attached shapes/labels together. Rect x/y is top left; ellipse x/y is center and width/height are full diameters. Text x/y is top left, width controls word wrapping, height optional bounds, fontSize>=16. Paths use SVG geometry only, local coordinates. Rotation/scale pivot around node x/y. Use actual objects and spatial relationships, not boxes full of prose. Keep labels short.
Tracks: {node,property:x|y|rotation|scale|opacity|draw,beat,start,end,from,to,easing:linear|smooth|accelerate|decelerate}. start/end are fractions of that beat, 0<=start<end<=1. Values hold after a track; before the first track use from. No overlapping tracks on a property. draw is path stroke reveal 0–1; use stroke with fill none. Constant acceleration position uses accelerate easing (t squared), not arbitrary easing. Opacity/draw 0–1. At most 100 nodes, 180 tracks, 8 beats. Shapes are schematic, so do not imply anatomical detail or physical accuracy beyond what is actually represented.`;
