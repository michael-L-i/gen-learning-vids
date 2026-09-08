import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const resolveUserPath = (p) =>
  path.resolve(p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p);
export function textFromExport(text, filename = "") {
  if (!/\.json$/i.test(filename)) return text;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This JSON export could not be read.");
  }
  // ChatGPT exports contain branching message maps. Follow only the active conversation branch.
  const conversations = Array.isArray(data) ? data : [data];
  if (conversations.some((c) => c.mapping))
    return conversations
      .map((c) => {
        const mapping = c.mapping || {};
        const chain = [];
        const seen = new Set();
        let node =
          mapping[c.current_node] ||
          Object.values(mapping).find((n) => !n.children?.length);
        while (node && !seen.has(node.id)) {
          seen.add(node.id);
          chain.unshift(node);
          node = mapping[node.parent];
        }
        const messages = chain
          .map((n) => n.message)
          .filter((m) => m && ["user", "assistant"].includes(m.author?.role));
        return (
          `# ${c.title || "Conversation"}\n\n` +
          messages
            .map(
              (m) =>
                `${m.author.role}: ${(m.content?.parts || []).filter((p) => typeof p === "string").join("\n")}`,
            )
            .join("\n\n")
        );
      })
      .join("\n\n---\n\n");
  if (conversations.some((c) => Array.isArray(c.chat_messages)))
    return conversations
      .map(
        (c) =>
          `# ${c.name || "Conversation"}\n\n` +
          (c.chat_messages || [])
            .map(
              (m) =>
                `${m.sender}: ${m.text || (m.content || []).map((p) => p.text || "").join("\n")}`,
            )
            .join("\n\n"),
      )
      .join("\n\n---\n\n");
  return JSON.stringify(data, null, 2);
}
export async function scanNotes(input) {
  const root = await fs.realpath(resolveUserPath(input));
  if (!(await fs.stat(root)).isDirectory())
    throw new Error("Choose a folder containing Markdown or text notes.");
  const notes = [];
  let capped = false;
  async function walk(dir, depth) {
    if (depth > 12) return;
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
      if (notes.length >= 500) {
        capped = true;
        return;
      }
      if (
        item.name.startsWith(".") ||
        item.name === "node_modules" ||
        item.isSymbolicLink()
      )
        continue;
      const file = path.join(dir, item.name);
      if (item.isDirectory()) await walk(file, depth + 1);
      else if (/\.(md|txt)$/i.test(item.name)) {
        const stat = await fs.stat(file);
        if (stat.size <= 200000)
          notes.push({
            path: path.relative(root, file),
            title: item.name.replace(/\.(md|txt)$/i, ""),
            bytes: stat.size,
          });
      }
    }
  }
  await walk(root, 0);
  return { root, notes, capped };
}
export async function importNotes(
  library,
  rootInput,
  selected,
  kind = "obsidian",
) {
  if (!["folder", "obsidian"].includes(kind))
    throw new Error("Choose a folder or Obsidian source.");
  if (!Array.isArray(selected) || selected.length < 1 || selected.length > 100)
    throw new Error("Choose between 1 and 100 notes.");
  const root = await fs.realpath(resolveUserPath(rootInput));
  const results = [];
  for (const relative of selected) {
    if (typeof relative !== "string" || path.isAbsolute(relative))
      throw new Error("Invalid note path.");
    const file = await fs.realpath(path.join(root, relative));
    if (!file.startsWith(root + path.sep) || !/\.(md|txt)$/i.test(file))
      throw new Error("Only notes inside the selected folder can be imported.");
    const stat = await fs.stat(file);
    if (stat.size > 200000) throw new Error(`Note is too large: ${relative}`);
    results.push(
      await library.addSource({
        title: path.basename(file).replace(/\.(md|txt)$/i, ""),
        content: await fs.readFile(file, "utf8"),
        origin: file,
        kind,
      }),
    );
  }
  return results;
}

// Uploaded folders are one named source; file headings retain the original structure.
export async function importUpload(library, { kind, files } = {}) {
  if (
    !["file", "folder"].includes(kind) ||
    !Array.isArray(files) ||
    !files.length ||
    files.length > 100 ||
    (kind === "file" && files.length !== 1)
  )
    throw new Error(
      "Choose one file or a folder with up to 100 supported files.",
    );
  let bytes = 0;
  const names = new Set();
  const sections = files.map((file) => {
    if (typeof file?.path !== "string" || typeof file.content !== "string")
      throw new Error("Provide file names and text contents.");
    const parts = file.path.split("/");
    if (
      parts.some(
        (part) => !part || part.startsWith(".") || part === "node_modules",
      ) ||
      file.path.includes("\\") ||
      !/\.(md|txt|json)$/i.test(file.path) ||
      names.has(file.path) ||
      (kind === "file" ? parts.length !== 1 : parts.length < 2)
    )
      throw new Error(
        "Choose Markdown, text, or JSON files with valid relative names.",
      );
    names.add(file.path);
    bytes += Buffer.byteLength(file.content);
    const text = textFromExport(file.content, file.path);
    return kind === "folder"
      ? `# ${parts.slice(1).join("/")}\n\n${text}`
      : text;
  });
  if (bytes > 3000000) throw new Error("Choose a smaller upload (up to 3 MB).");
  const title = files[0].path.split("/")[0];
  if (
    kind === "folder" &&
    files.some((file) => !file.path.startsWith(`${title}/`))
  )
    throw new Error("Choose files from a single folder.");
  return library.addSource({
    title,
    content: sections.join("\n\n---\n\n"),
    origin: title,
    kind,
  });
}
