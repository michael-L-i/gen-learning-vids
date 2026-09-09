import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  discoverObsidianVaults,
  obsidianRegistryPath,
  conversationText,
} from "../server/imports.js";

test("Obsidian discovery uses registered accessible vaults without scanning unrelated folders", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-discovery-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const registry = path.join(root, "obsidian.json"),
    vault = path.join(root, "Vault");
  await fs.mkdir(vault);
  await fs.writeFile(
    registry,
    JSON.stringify({
      vaults: {
        a: { path: vault, open: true },
        duplicate: { path: vault },
        stale: { path: path.join(root, "gone") },
        relative: { path: "relative" },
        invalid: null,
      },
    }),
  );
  const result = await discoverObsidianVaults({ registry });
  assert.deepEqual(result.vaults, [
    { name: "Vault", path: await fs.realpath(vault), open: true },
  ]);
  await fs.writeFile(registry, "broken");
  assert.match(
    (await discoverObsidianVaults({ registry })).message,
    /Could not read/,
  );
  assert.match(
    (await discoverObsidianVaults({ registry: path.join(root, "missing") }))
      .message,
    /No local/,
  );
  for (const platform of ["darwin", "win32", "linux"])
    assert.match(
      obsidianRegistryPath({ platform, home: root, env: {} }),
      /obsidian[\/]obsidian.json$/,
    );
});

test("Gemini activity JSON and HTML become inert readable text", () => {
  const json = JSON.stringify([
    {
      header: "Gemini Apps",
      title: "Prompted Explain force",
      time: "2026-09-08",
      safeHtmlItem: [
        {
          html: "<p>Force &amp; mass</p><pre>a = F / m</pre><script>secret()</script><img src='https://invalid.example/a'>",
        },
      ],
    },
  ]);
  const text = conversationText(json, "MyActivity.json", "gemini");
  assert.match(text, /Prompted Explain force/);
  assert.match(text, /Force & mass\n\na = F \/ m/);
  assert.doesNotMatch(text, /secret|img|https/);
  assert.equal(
    conversationText(
      "<head><style>hidden</style></head><p>First</p><p>Second</p>",
      "MyActivity.html",
      "gemini",
    ),
    "First\n\nSecond",
  );
  assert.equal(
    conversationText("Copied memory", "memory.txt", "gemini"),
    "Copied memory",
  );
});

test("provider import rejects mismatched, malformed and unsupported exports", () => {
  for (const [text, file, provider] of [
    ["null", "a.json", "chatgpt"],
    ["{", "a.json", "claude"],
    ["[]", "a.json", "gemini"],
    ["{}", "a.zip", "chatgpt"],
    [JSON.stringify([{ mapping: {} }]), "a.json", "claude"],
  ])
    assert.throws(() => conversationText(text, file, provider));
});
