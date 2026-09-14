import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../process.js";
import { renderAuthored } from "../authored/render.js";

export async function blenderExecutable(explicit) {
  if (explicit)
    return explicit.includes("/") || explicit.includes("\\")
      ? path.resolve(explicit)
      : explicit;
  if (process.env.LEARNVID_BLENDER)
    return blenderExecutable(process.env.LEARNVID_BLENDER);
  const mac = "/Applications/Blender.app/Contents/MacOS/Blender";
  if (process.platform === "darwin")
    try {
      await fs.access(mac);
      return mac;
    } catch {}
  return "blender";
}

export async function renderBlender(
  library,
  sourceDir,
  { blender, ...options } = {},
) {
  if (!(await library.settings()).blenderEnabled)
    throw new Error(
      "Blender is disabled. Enable it in Settings or run learnvid capability enable blender. Blender must be installed separately.",
    );
  const executable = await blenderExecutable(blender);
  const adapter = {
    name: "blender",
    directory: "blender",
    stage: "Rendering 3D scenes with Blender",
    async check() {
      const { stdout } = await run(
        executable,
        [
          "--background",
          "--factory-startup",
          "--python-exit-code",
          "1",
          "--python-expr",
          "import bpy; print('LEARNVID_VERSION', bpy.app.version_string)",
        ],
        { timeout: 30000 },
      );
      const version = stdout.match(/LEARNVID_VERSION (.+)/)?.[1];
      if (!version || Number(version.split(".")[0]) < 4)
        throw new Error(
          "Blender 4 or newer is required; Blender 4.5 LTS is the tested version.",
        );
      return { version, executable };
    },
    async render({ module, timeline, output, progress }) {
      const statusFile = path.join(output, "progress.json");
      let last = "";
      const timer = setInterval(async () => {
        try {
          const s = JSON.parse(await fs.readFile(statusFile, "utf8"));
          const msg = `Blender chapter ${s.scene + 1}: ${s.frame}/${s.frames} frames (${s.rendered} rendered, ${s.reused} reused)`;
          if (msg !== last) {
            last = msg;
            progress(msg);
          }
        } catch {}
      }, 5000);
      try {
        await run(
          executable,
          [
            "--background",
            "--factory-startup",
            "--python-exit-code",
            "1",
            "--python",
            fileURLToPath(new URL("./host.py", import.meta.url)),
            "--",
            "--module",
            module,
            "--timeline",
            timeline,
            "--output",
            output,
          ],
          { cwd: output, timeout: 3 * 60 * 60 * 1000 },
        );
      } finally {
        clearInterval(timer);
      }
    },
  };
  return renderAuthored(library, sourceDir, { ...options, adapter });
}
