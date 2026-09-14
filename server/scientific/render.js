import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../process.js";
import { renderAuthored } from "../authored/render.js";
export {
  authoredManifest as scientificManifest,
  probeVideo,
} from "../authored/render.js";

export async function renderScientific(
  library,
  sourceDir,
  { python = "python3", ...options } = {},
) {
  if (python.includes("/") || python.includes("\\"))
    python = path.resolve(python);
  const adapter = {
    name: "matplotlib",
    directory: "scientific",
    stage: "Drawing diagrams and graphs with Matplotlib",
    async check() {
      await run(python, ["-c", "import matplotlib; import sympy"], {
        timeout: 15000,
      });
      return { executable: python };
    },
    async render({ module, timeline, output }) {
      await run(
        python,
        [
          fileURLToPath(new URL("./host.py", import.meta.url)),
          "--module",
          module,
          "--timeline",
          timeline,
          "--output",
          output,
        ],
        { cwd: output, timeout: 30 * 60 * 1000 },
      );
    },
  };
  return renderAuthored(library, sourceDir, { ...options, adapter });
}
