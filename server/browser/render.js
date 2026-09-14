import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { run } from "../process.js";
import { renderAuthored } from "../authored/render.js";
import { renderBrowserScenes } from "./host.js";
const require = createRequire(import.meta.url);
export async function ensureBrowser(
  progress = () => {},
  { install = true } = {},
) {
  const executable = chromium.executablePath();
  try {
    await fs.access(executable);
  } catch {
    if (!install)
      throw new Error("Browser runtime missing. Run learnvid setup-browser.");
    progress(
      "Downloading the managed Chromium rendering runtime (first use only)",
    );
    await run(
      process.execPath,
      [
        path.join(
          path.dirname(require.resolve("playwright/package.json")),
          "cli.js",
        ),
        "install",
        "chromium",
      ],
      { timeout: 15 * 60 * 1000 },
    );
  }
  return executable;
}
export async function renderBrowser(
  library,
  sourceDir,
  { install = true, ...options } = {},
) {
  const adapter = {
    name: "browser",
    directory: "browser",
    entrypoint: "scene.js",
    sourcePattern: /\.(js|mjs|json|css|svg)$/,
    stage: "Rendering animation",
    async check() {
      const executable = await ensureBrowser(options.progress, { install });
      return {
        executable,
        packages: Object.fromEntries(
          ["three", "animejs", "@rdkit/rdkit", "playwright", "elkjs"].map(
            (n) => [
              n,
              JSON.parse(
                require("node:fs").readFileSync(
                  path.join(
                    fileURLToPath(
                      new URL("../../node_modules/", import.meta.url),
                    ),
                    n,
                    "package.json",
                  ),
                  "utf8",
                ),
              ).version,
            ],
          ),
        ),
      };
    },
    render: renderBrowserScenes,
  };
  return renderAuthored(library, sourceDir, { ...options, adapter });
}
