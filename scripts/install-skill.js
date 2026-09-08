import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const host = process.argv[2] || "codex";
if (!["codex", "claude"].includes(host))
  throw new Error("Usage: node scripts/install-skill.js codex|claude");
const source = fileURLToPath(
  new URL("../plugins/lesson-library/skills/lesson-library/", import.meta.url),
);
const root =
  host === "codex"
    ? path.join(os.homedir(), ".agents", "skills")
    : path.join(os.homedir(), ".claude", "skills");
await fs.mkdir(root, { recursive: true });
const destination = path.join(root, "lesson-library");
try {
  await fs.lstat(destination);
  throw new Error(
    `A skill already exists at ${destination}. Remove or rename it explicitly before installing this version.`,
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await fs.symlink(source, destination, "dir");
console.log(
  `Installed ${host} skill at ${destination}\nKeep this checkout in place. Start a new agent session to discover it.`,
);
