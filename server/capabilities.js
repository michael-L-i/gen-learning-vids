import fs from "node:fs/promises";
import { chromium } from "playwright";
import { blenderExecutable } from "./blender/render.js";
import { available } from "./process.js";
export async function visualCapabilities(library) {
  const settings = await library.settings();
  const exists = async (file) => {
    try {
      await fs.access(file);
      return true;
    } catch {
      return false;
    }
  };
  const blender = await blenderExecutable();
  return [
    {
      id: "svg",
      enabled: true,
      ready: true,
      description:
        "Structured 2D animation, graphs, equations, maps and sourced images",
      command: "learnvid create TOPIC --plan FILE",
    },
    {
      id: "browser",
      enabled: true,
      ready: await exists(chromium.executablePath()),
      setup:
        "Managed Chromium downloads on first render; learnvid setup-browser can prepare it earlier",
      libraries: [
        "SVG / DOM",
        "animejs",
        "three",
        "@rdkit/rdkit",
        "d3-geo",
        "@lesson-library/physics",
        "@lesson-library/math",
        "@lesson-library/circuits",
      ],
      modules: {
        physics: {
          import: "@lesson-library/physics",
          guidance: "references/physics.md",
          features: [
            "mechanics drawings and attachment anchors",
            "analytic motion and linked graphs",
            "measured label placement",
          ],
        },
        math: {
          import: "@lesson-library/math",
          guidance: "references/math.md",
          features: [
            "2D linear maps",
            "basis and grid geometry",
            "determinant and area",
          ],
        },
        circuits: {
          import: "@lesson-library/circuits",
          guidance: "references/circuits.md",
          features: [
            "SVG schematics",
            "fixed-potential resistor networks",
            "analytic series RC response",
            "signal traces",
          ],
        },
      },
      description:
        "Freely authored 2D, spatial 3D, molecular diagrams; choose per scene",
      command: "learnvid render-browser DIRECTORY",
      guidance: "references/browser-animation.md",
    },
    {
      id: "blender",
      enabled: settings.blenderEnabled,
      ready: blender.includes("/")
        ? await exists(blender)
        : await available(blender),
      setup: "Separate Blender installation and explicit enablement required",
      command: "learnvid render-blender DIRECTORY",
    },
    {
      id: "scientific",
      enabled: true,
      setup: "Optional separately installed Python scientific environment",
      command: "learnvid render-scientific DIRECTORY",
    },
  ];
}
