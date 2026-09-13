// Authored renderer fixtures. These are baselines, not outputs attributed to an agent.
import fs from "node:fs/promises";
import { sceneSchema } from "../server/schema.js";
const directory = new URL("./", import.meta.url);
const node = (id, type, x, y, extra = {}) => ({ id, type, x, y, ...extra });
const text = (id, value, x, y, width = 500, fontSize = 28, fill = "#172333") =>
  node(id, "text", x, y, { text: value, width, fontSize, fill });
const rect = (id, x, y, width, height, fill, extra = {}) =>
  node(id, "rect", x, y, { width, height, fill, ...extra });
const ellipse = (id, x, y, width, height, fill, extra = {}) =>
  node(id, "ellipse", x, y, { width, height, fill, ...extra });
const path = (id, d, stroke = "#596A7D", extra = {}) =>
  node(id, "path", 0, 0, { path: d, stroke, strokeWidth: 3, ...extra });
const track = (
  id,
  property,
  beat,
  from,
  to,
  easing = "smooth",
  start = 0.05,
  end = 0.9,
) => ({ node: id, property, beat, start, end, from, to, easing });
const reveal = (id, beat) =>
  track(id, "opacity", beat, 0, 1, "smooth", 0.05, 0.3);
async function save(
  id,
  subject,
  title,
  prompt,
  learner,
  style,
  constraints,
  narrations,
  nodes,
  tracks,
  background = "#F5F6F8",
) {
  const definition = {
    id,
    version: 1,
    subject,
    title,
    prompt,
    learner,
    styleBrief: style,
    variationKey: `${id}-v1`,
    targetSeconds: 12,
    criteria: constraints,
  };
  const scene = sceneSchema.parse({
    title,
    narration: narrations.join(" "),
    visual: "animation",
    points: [constraints[0]],
    takeaway: constraints[0],
    visualReason: style,
    content: {
      kind: "animation",
      background,
      beats: narrations.map((n, i) => ({
        id: `b${i}`,
        narration: n,
        seconds: 4,
      })),
      nodes: [
        text(
          "title",
          title,
          56,
          40,
          1168,
          38,
          background === "#101927" ? "#F4F7FB" : "#172333",
        ),
        ...nodes,
      ],
      tracks,
    },
  });
  await fs.writeFile(
    new URL(`cases/${id}.json`, directory),
    JSON.stringify(definition, null, 2) + "\n",
  );
  await fs.writeFile(
    new URL(`references/${id}.json`, directory),
    JSON.stringify(scene, null, 2) + "\n",
  );
}
await save(
  "physics-kinematics",
  "Physics",
  "Distance under constant acceleration",
  "Solve the distance traveled by a cart starting from rest, accelerating at 2 m/s² for 4 s. Animate the cart and a synchronized velocity-time graph.",
  "Knows velocity; new to constant acceleration.",
  "Technical diagram: moving cart on a track, attached velocity arrow, graph on the right, compact calculation.",
  [
    "Displacement is 16 m; final velocity is 8 m/s.",
    "Cart position grows quadratically with simulated time; velocity grows linearly.",
    "Distinguish simulated time from video playback time.",
  ],
  [
    "The cart starts from rest, accelerating at two meters per second squared.",
    "Watch four simulated seconds of motion.",
    "Half acceleration times time squared gives sixteen meters.",
  ],
  [
    text("given", "a = 2 m/s²     v₀ = 0", 56, 125, 650, 28),
    text("sim", "Motion below spans 4 simulated seconds", 56, 175, 700, 22),
    path("rail", "M 70 400 H 725"),
    text("zero", "0 m", 70, 425, 100, 22),
    text("sixteen", "16 m", 640, 425, 100, 22),
    node("cart", "group", 90, 325),
    rect("body", -35, 0, 70, 40, "#3574DC", { parent: "cart", radius: 8 }),
    ellipse("wheel1", -20, 48, 20, 20, "#172333", { parent: "cart" }),
    ellipse("wheel2", 20, 48, 20, 20, "#172333", { parent: "cart" }),
    path("arrow", "M 0 -30 H 90 M 78 -40 L 90 -30 L 78 -20", "#D76732", {
      parent: "cart",
    }),
    text("vlabel", "velocity", 0, -75, 150, 20, "#B74D1D"),
    path("axes", "M 850 390 V 185 M 850 390 H 1160"),
    text("vy", "v (m/s)", 840, 135, 180, 24),
    text("tx", "t (s)", 1115, 425, 120, 24),
    text("eight", "8", 811, 185, 40, 22),
    text("four", "4", 1133, 395, 40, 22),
    path("slope", "M 850 390 L 1140 195", "#3574DC", { strokeWidth: 5 }),
    text("answer", "s = ½ × 2 × 4² = 16 m", 70, 530, 1000, 42),
  ],
  [
    track("cart", "x", "b1", 90, 690, "accelerate"),
    track("arrow", "scale", "b1", 0.05, 1, "linear"),
    track("slope", "draw", "b1", 0, 1, "linear"),
    reveal("answer", "b2"),
  ],
);
// Attach the velocity label to the cart rather than to canvas coordinates.
const physicsUrl = new URL("references/physics-kinematics.json", directory);
const physics = JSON.parse(await fs.readFile(physicsUrl));
physics.content.nodes.find((n) => n.id === "vlabel").parent = "cart";
await fs.writeFile(physicsUrl, JSON.stringify(physics, null, 2) + "\n");
await save(
  "math-square",
  "Mathematics",
  "Completing a square",
  "Explain geometrically why x² + 2x + 1 = (x + 1)², using a square, two strips, and a missing corner.",
  "Knows rectangle area and simple algebra.",
  "Geometric construction: colored area pieces move into place; symbolic labels stay attached.",
  [
    "The two strips each have area x, and the corner has area 1.",
    "The completed square has side x + 1.",
    "Movement should preserve each piece's size.",
  ],
  [
    "Start with x squared and two strips of area x.",
    "Add the strips and one unit corner.",
    "The completed square has side x plus one.",
  ],
  [
    rect("square", 220, 200, 240, 240, "#C9DDF9"),
    text("x2", "x²", 307, 289, 90, 48),
    node("right", "group", 760, 200),
    rect("rs", 0, 0, 80, 240, "#E8BF72", { parent: "right" }),
    text("rx", "x", 25, 90, 60, 40),
    node("bottom", "group", 720, 495),
    rect("bs", 0, 0, 240, 80, "#E8BF72", { parent: "bottom" }),
    text("bx", "x", 96, 12, 60, 40),
    node("corner", "group", 1050, 495),
    rect("cs", 0, 0, 80, 80, "#BE9BDC", { parent: "corner" }),
    text("one", "1", 27, 14, 50, 36),
    text("side", "x + 1", 320, 535, 260, 30),
    text("identity", "x² + 2x + 1 = (x + 1)²", 680, 280, 520, 36),
  ],
  [
    track("right", "x", "b1", 760, 460),
    track("bottom", "x", "b1", 720, 220),
    track("bottom", "y", "b1", 495, 440),
    track("corner", "x", "b1", 1050, 460),
    track("corner", "y", "b1", 495, 440),
    reveal("side", "b2"),
    reveal("identity", "b2"),
  ],
);
const mathURL = new URL("references/math-square.json", directory);
const math = JSON.parse(await fs.readFile(mathURL));
for (const [id, parent] of [
  ["rx", "right"],
  ["bx", "bottom"],
  ["one", "corner"],
])
  math.content.nodes.find((n) => n.id === id).parent = parent;
await fs.writeFile(mathURL, JSON.stringify(math, null, 2) + "\n");
await save(
  "biology-enzyme",
  "Biology",
  "An enzyme binds and releases",
  "Show a substrate binding to an enzyme active site and subsequently leaving. Focus on binding specificity, without claiming all enzymes are rigid locks.",
  "Has heard of proteins; no biochemistry background.",
  "Large organic silhouettes with a close-up binding site and direct labels; a schematic illustration, not a molecular simulation.",
  [
    "Enzyme persists after binding and release.",
    "Label the active site and substrate clearly.",
    "State that the simplified shapes represent binding, not atom-level detail.",
  ],
  [
    "An enzyme binds a substrate at its active site.",
    "These shapes are simplified. Real proteins can flex.",
    "After release, the enzyme can bind again.",
  ],
  [
    path(
      "enzyme",
      "M 440 240 C 260 120 190 310 240 440 C 285 570 480 575 560 450 L 450 360 L 565 275 C 530 250 490 235 440 240 Z",
      "#438C78",
      { fill: "#BBDCD0", strokeWidth: 4 },
    ),
    path("substrate", "M 0 0 L 110 -85 Q 145 0 110 90 Z", "#AB6D34", {
      x: 895,
      y: 360,
      fill: "#F2C680",
      strokeWidth: 4,
    }),
    text("enzymeLabel", "Enzyme", 260, 570, 250, 28),
    text("substrateLabel", "Substrate", 835, 195, 310, 28),
    path("leader", "M 685 495 L 535 370", "#67746B"),
    text("site", "Active site", 690, 480, 300, 28),
    text(
      "caption",
      "Schematic binding cycle · not to scale",
      56,
      650,
      1100,
      22,
    ),
  ],
  [
    track("substrate", "x", "b1", 895, 450),
    track("substrate", "x", "b2", 450, 895),
    track("substrateLabel", "opacity", "b1", 1, 0),
    track("substrateLabel", "opacity", "b2", 0, 1),
  ],
  "#F4F7F2",
);
const atoms = [
  ellipse("h1", 230, 270, 44, 44, "#D9E5F0"),
  ellipse("h2", 285, 270, 44, 44, "#D9E5F0"),
  ellipse("h3", 230, 455, 44, 44, "#D9E5F0"),
  ellipse("h4", 285, 455, 44, 44, "#D9E5F0"),
  ellipse("o1", 585, 335, 68, 68, "#DF756C"),
  ellipse("o2", 665, 335, 68, 68, "#DF756C"),
];
await save(
  "chemistry-conservation",
  "Chemistry",
  "Atoms are conserved",
  "Animate 2 H₂ + O₂ → 2 H₂O with atom identities preserved. Explain counting, not the chemical reaction mechanism.",
  "Recognizes hydrogen, oxygen, and molecular formulas.",
  "Particle bookkeeping: fixed atom colors and sizes, spatial regrouping, persistent equation.",
  [
    "Exactly four hydrogen and two oxygen atoms remain throughout.",
    "Each final water group contains one oxygen and two hydrogens.",
    "Describe the animation as atom accounting, not a reaction pathway.",
  ],
  [
    "Two hydrogen molecules plus one oxygen molecule: six atoms.",
    "Regroup them into two water molecules.",
    "Four hydrogens, two oxygens. No atoms disappear.",
  ],
  [
    ...atoms,
    text("formula", "2 H₂ + O₂ → 2 H₂O", 56, 125, 1100, 40),
    text(
      "legend",
      "Hydrogen: small, pale     Oxygen: large, red",
      56,
      580,
      1100,
      26,
    ),
    text(
      "note",
      "Atom accounting; not a reaction mechanism",
      56,
      635,
      1100,
      22,
    ),
  ],
  [
    ["h1", 860, 245],
    ["h2", 960, 245],
    ["o1", 910, 290],
    ["h3", 860, 430],
    ["h4", 960, 430],
    ["o2", 910, 475],
  ].flatMap(([id, x, y]) => [
    track(id, "x", "b1", atoms.find((a) => a.id === id).x, x),
    track(id, "y", "b1", atoms.find((a) => a.id === id).y, y),
  ]),
);
await save(
  "cs-stack",
  "Computer science",
  "A recursive call returns",
  "Trace factorial(2) through factorial(1), emphasizing return values and the shrinking call stack.",
  "Knows functions and multiplication; new to recursion.",
  "Dark code workspace with a separate stack and return-value trace. Highlight only the currently relevant line.",
  [
    "factorial(1) returns 1; factorial(2) returns 2 × 1 = 2.",
    "Stack grows on a call and shrinks on return.",
    "Code and stack must agree.",
  ],
  [
    "Factorial of two calls factorial of one, then waits.",
    "The base case returns one and leaves the stack.",
    "Two times one returns two.",
  ],
  [
    rect("codepanel", 56, 160, 660, 370, "#1A293C", { radius: 12 }),
    text(
      "code",
      "def factorial(n):\n    if n == 1:\n        return 1\n    return n * factorial(n - 1)",
      85,
      195,
      600,
      28,
      "#E5EDF8",
    ),
    rect("highlight", 76, 302, 620, 37, "#36537A", { opacity: 0.35 }),
    rect("stack2", 820, 385, 345, 84, "#294564", { radius: 8 }),
    text("call2", "factorial(2) waits", 848, 408, 300, 26, "#E5EDF8"),
    node("base", "group", 820, 270),
    rect("basebox", 0, 0, 345, 84, "#35796E", { parent: "base", radius: 8 }),
    text("call1", "factorial(1) → 1", 28, 23, 300, 26, "#E5EDF8"),
    text("result", "2 × 1 = 2", 837, 535, 360, 42, "#8DD7BE"),
    text("stackLabel", "Call stack", 820, 170, 350, 28, "#B3C5DD"),
  ],
  [
    track("highlight", "y", "b1", 302, 264),
    track("highlight", "y", "b2", 264, 302),
    track("base", "opacity", "b1", 1, 0, "smooth", 0.65, 0.95),
    reveal("result", "b2"),
  ],
  "#101927",
);
const csURL = new URL("references/cs-stack.json", directory);
const cs = JSON.parse(await fs.readFile(csURL));
cs.content.nodes.find((n) => n.id === "call1").parent = "base";
await fs.writeFile(csURL, JSON.stringify(cs, null, 2) + "\n");
await save(
  "engineering-feedback",
  "Engineering",
  "Feedback reduces an error",
  "Explain a thermostat feedback loop: measure temperature, compare with target, apply heat, measure again. Show a qualitative approach toward the target.",
  "Everyday familiarity with room temperature.",
  "System diagram paired with a growing response curve; signal direction is conveyed by a moving marker.",
  [
    "Error is target minus measured temperature.",
    "The feedback path returns a measurement to the controller.",
    "Response curve is qualitative, with no invented controller tuning.",
  ],
  [
    "Target minus measured temperature gives the error.",
    "Too cold? The controller requests heat.",
    "Measurements feed back as temperature approaches the target.",
  ],
  [
    rect("controller", 110, 270, 300, 110, "#D7E6FA", { radius: 10 }),
    text("ctl", "Controller", 155, 300, 230, 32),
    rect("room", 760, 270, 300, 110, "#E6DBCB", { radius: 10 }),
    text("roomLabel", "Room", 855, 300, 160, 32),
    path("forward", "M 410 325 H 760 M 742 312 L 760 325 L 742 338"),
    text("heat", "Heat request", 475, 265, 280, 25),
    path(
      "feedback",
      "M 910 380 V 495 H 260 V 380 M 248 398 L 260 380 L 272 398",
    ),
    text("measure", "Measured temperature", 430, 510, 480, 25),
    ellipse("signal", 260, 495, 18, 18, "#3574DC"),
    text("target", "Target − measurement = error", 110, 145, 1080, 32),
    path("response", "M 1080 225 C 1110 195 1115 155 1175 150", "#C26B38", {
      strokeWidth: 4,
    }),
    path("setpoint", "M 1060 148 H 1210", "#8D969F"),
    text("qualitative", "Response\n(schematic)", 1060, 80, 160, 18),
  ],
  [
    track("signal", "x", "b2", 910, 260, "linear"),
    track("response", "draw", "b2", 0, 1),
  ],
);
await save(
  "history-printing",
  "History",
  "Early European printing spreads",
  "Show three milestones in early European movable-type printing: Gutenberg's work in Mainz around 1450, the Gutenberg Bible around 1455, and a press in Paris in 1470. Avoid claiming Gutenberg invented all printing.",
  "No prior knowledge of printing history.",
  "Editorial timeline with date anchors, small page illustrations, and progressive annotations.",
  [
    "Scope is early European movable-type printing, not the origin of printing worldwide.",
    "Use approximate dates for Gutenberg's work and Bible.",
    "Keep timeline positions proportional to dates.",
  ],
  [
    "Around fourteen fifty: Gutenberg develops printing in Mainz.",
    "The Gutenberg Bible follows around fourteen fifty-five.",
    "Fourteen seventy: a press operates in Paris.",
  ],
  [
    text("scope", "European movable-type printing", 56, 115, 1100, 26),
    path("line", "M 170 420 H 1110", "#907554", { strokeWidth: 4 }),
    ...[
      ["mainz", 170, "c. 1450", "Mainz"],
      ["bible", 405, "c. 1455", "Gutenberg Bible"],
      ["paris", 1110, "1470", "Paris"],
    ].flatMap(([id, x, date, label]) =>
      [
        ellipse(id + "dot", x, 420, 18, 18, "#866440"),
        text(id + "date", date, x - 70, 460, 200, 26),
        text(id + "label", label, x - 110, 505, 220, 24),
        rect(id + "page", x - 40, 265, 80, 110, "#FFFFFF", {
          stroke: "#A18A6C",
          radius: 3,
        }),
        path(
          id + "ink",
          `M ${x - 25} 290 H ${x + 25} M ${x - 25} 310 H ${x + 25} M ${x - 25} 330 H ${x + 25}`,
          "#A18A6C",
        ),
      ].map((n) =>
        n.id === id + "date"
          ? { ...n, text: date }
          : n.id === id + "label"
            ? { ...n, text: label }
            : n,
      ),
    ),
    text(
      "scopeNote",
      "Printing traditions existed in East Asia centuries earlier.",
      56,
      635,
      1168,
      24,
    ),
  ],
  [
    track("line", "draw", "b2", 0.25, 1),
    ...["bible", "paris"].flatMap((id, i) =>
      ["dot", "date", "label", "page", "ink"].map((s) =>
        reveal(id + s, `b${i + 1}`),
      ),
    ),
  ],
  "#F6F1E8",
);
await save(
  "humanities-argument",
  "Humanities",
  "Evidence and a qualified claim",
  "Explain why one successful school tutoring trial supports a qualified claim about that setting, not a universal claim that tutoring always works.",
  "Can distinguish a claim from an example.",
  "Argument annotation: highlight the evidence, connect it to a bounded claim, then mark the unsupported generalization.",
  [
    "One trial cannot establish that tutoring always works everywhere.",
    "Keep the example hypothetical; do not invent study results.",
    "Use motion to reveal the scope of inference.",
  ],
  [
    "Suppose tutoring improves results at one school.",
    "This supports a claim about that particular setting.",
    "It cannot establish that tutoring always works everywhere.",
  ],
  [
    text("hypothetical", "Hypothetical example", 56, 120, 1000, 24),
    rect("evidence", 80, 230, 465, 165, "#DBE8F4", { radius: 10 }),
    text(
      "ev",
      "One school\nOne tutoring program\nImproved results",
      110,
      253,
      400,
      28,
    ),
    path("link", "M 555 310 H 700 M 682 298 L 700 310 L 682 322", "#567C92"),
    rect("claim", 715, 230, 480, 165, "#D9EADC", { radius: 10 }),
    text(
      "qualified",
      "Supported here:\nThis program helped\nin this setting.",
      745,
      250,
      420,
      28,
    ),
    text(
      "universal",
      "“Tutoring always works everywhere.”",
      100,
      500,
      1100,
      34,
    ),
    path("strike", "M 100 555 H 950", "#B65450", { strokeWidth: 4 }),
    text(
      "limit",
      "The evidence does not support this broader claim.",
      100,
      590,
      1100,
      26,
    ),
  ],
  [
    reveal("claim", "b1"),
    reveal("qualified", "b1"),
    track("link", "draw", "b1", 0, 1),
    reveal("universal", "b2"),
    track("strike", "draw", "b2", 0, 1),
    reveal("limit", "b2"),
  ],
);
