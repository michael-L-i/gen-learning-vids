import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startServer } from "../server/app.js";
import { pcmWave } from "../server/speech.js";

let instance, root;
test.beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-ui-"));
  instance = await startServer({
    root,
    port: 0,
    synthesize: async (_, file) =>
      fs.writeFile(file, pcmWave(new Float32Array(2400))),
  });
});
test.afterAll(async () => {
  await instance?.close();
  await fs.rm(root, { recursive: true, force: true });
});
test("notes, learning profile, and provider settings persist through the real API", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(instance.url);
  await expect(
    page.getByRole("heading", { name: "No videos yet" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sources & notes", exact: true })
    .click();
  await page.getByRole("button", { name: "Add a source", exact: true }).click();
  await page.getByRole("button", { name: "Paste text" }).click();
  await page.getByLabel("Title", { exact: true }).fill("My starting point");
  await page
    .getByLabel("Text", { exact: true })
    .fill("I know loops but recursion is unfamiliar.");
  await page.getByRole("button", { name: "Add to sources" }).click();
  await expect(
    page.getByText("My starting point", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Learning profile", exact: true })
    .click();
  await page
    .getByLabel("Learning profile", { exact: true })
    .fill("Use a small worked example.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect
    .poll(() => instance.library.profile())
    .toBe("Use a small worked example.");
  await page
    .getByRole("button", { name: "Settings & connections", exact: true })
    .click();
  await page.getByLabel("Agent", { exact: true }).selectOption("claude");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect
    .poll(async () => (await instance.library.settings()).provider)
    .toBe("claude");
  await page.reload();
  await page
    .getByRole("button", { name: "Create a lesson", exact: true })
    .click();
  await page
    .getByLabel("What would you like to understand?")
    .fill("How recursion returns");
  await page.getByLabel("My starting point", { exact: true }).check();
  await page
    .getByLabel("Presentation", { exact: true })
    .selectOption("diagram");
  await page
    .getByLabel("Visual directions")
    .fill("Use a flow diagram with arrows.");
  // Observe the UI's create request without invoking an authenticated external agent in CI.
  let submitted;
  await page.route("**/api/lessons", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submitted = route.request().postDataJSON();
    return route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Generation paused for this test." }),
    });
  });
  await page
    .getByRole("button", { name: "Create lesson", exact: true })
    .click();
  await expect(
    page.getByText("Generation paused for this test."),
  ).toBeVisible();
  expect(submitted.topic).toBe("How recursion returns");
  expect(submitted.presentation).toBe("diagram");
  expect(submitted.visualBrief).toBe("Use a flow diagram with arrows.");
  expect(submitted.sourceIds).toEqual([
    (await instance.library.sources())[0].id,
  ]);
  expect(errors).toEqual([]);
});
test("navigation and creation remain usable on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(instance.url);
  await page
    .getByRole("button", { name: "Create a lesson", exact: true })
    .click();
  await expect(
    page.getByLabel("What would you like to understand?"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("voice preview uses the selected voice without saving the form", async ({
  page,
}) => {
  await page.goto(instance.url);
  await page
    .getByRole("button", { name: "Settings & connections", exact: true })
    .click();
  await page
    .getByLabel("Speech engine", { exact: true })
    .selectOption("kokoro");
  await page
    .getByLabel("Narration voice", { exact: true })
    .selectOption("bf_emma");
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/api/speech/preview"),
  );
  await page
    .getByRole("button", { name: "Preview voice", exact: true })
    .click();
  expect((await response).request().postDataJSON().settings.kokoroVoice).toBe(
    "bf_emma",
  );
  await expect(page.getByLabel("Voice preview", { exact: true })).toBeVisible();
  expect((await instance.library.settings()).kokoroVoice).toBe("af_heart");
});

test("source picker imports files, memory, and selected folder notes", async ({
  page,
}, testInfo) => {
  await page.goto(instance.url);
  await page
    .getByRole("button", { name: "Sources & notes", exact: true })
    .click();
  const open = async (name) => {
    await page
      .getByRole("button", { name: "Add a source", exact: true })
      .click();
    await page.getByRole("button", { name, exact: false }).click();
  };
  await page.getByRole("button", { name: "Add a source", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("source-picker.png") });
  await page.getByRole("button", { name: "ChatGPT memory Paste" }).click();
  await expect(
    page.getByText(/does not connect to your ChatGPT account/),
  ).toBeVisible();
  await page
    .getByLabel("Memory", { exact: true })
    .fill("I know algebra and prefer diagrams.");
  await page.getByRole("button", { name: "Add to sources" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const memory = (await instance.library.sources()).find(
    (s) => s.kind === "memory",
  );
  expect(memory.content).toBe("I know algebra and prefer diagrams.");

  for (const [mode, name, contents, expected] of [
    [
      "File Markdown",
      "Calculus.md",
      "# Derivatives\nRate of change",
      "Rate of change",
    ],
    [
      "Chat export Import",
      "Conversation.JSON",
      JSON.stringify([
        {
          name: "Functions",
          chat_messages: [{ sender: "human", text: "Explain return values" }],
        },
      ]),
      "human: Explain return values",
    ],
  ]) {
    await open(mode);
    await page
      .getByLabel(mode.startsWith("File") ? "Source file" : "Chat export file")
      .setInputFiles({
        name,
        mimeType: "text/plain",
        buffer: Buffer.from(contents),
      });
    await page.getByRole("button", { name: "Add to sources" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const source = (await instance.library.sources()).find(
      (s) => s.origin === name,
    );
    expect(source.content).toContain(expected);
    expect(source.kind).toBe(mode.startsWith("File") ? "file" : "conversation");
  }

  const folder = path.join(root, "notes-to-import");
  await fs.mkdir(folder);
  await fs.writeFile(
    path.join(folder, "Selected.md"),
    "Only this note is selected.",
  );
  await fs.writeFile(
    path.join(folder, "Unselected.md"),
    "Do not import this note.",
  );
  for (const [mode, label, kind] of [
    ["Folder Select", "Folder path", "folder"],
    ["Obsidian vault Select", "Vault path", "obsidian"],
  ]) {
    await open(mode);
    await page.getByLabel(label).fill(folder);
    await page.getByRole("button", { name: "Preview notes" }).click();
    await page.getByLabel("Selected.md", { exact: true }).check();
    await page.getByRole("button", { name: "Import 1 selected notes" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const source = (await instance.library.sources()).find(
      (s) => s.kind === kind,
    );
    expect(source.content).toBe("Only this note is selected.");
    expect(
      (await instance.library.sources()).some((s) => s.title === "Unselected"),
    ).toBe(false);
  }
  expect(await fs.readFile(path.join(folder, "Selected.md"), "utf8")).toBe(
    "Only this note is selected.",
  );
});

test("source types and back navigation fit a narrow screen", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(instance.url);
  await page
    .getByRole("button", { name: "Sources & notes", exact: true })
    .click();
  await page.screenshot({ path: testInfo.outputPath("sources-mobile.png") });
  await page.getByRole("button", { name: "Add a source", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("source-picker-mobile.png"),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Obsidian vault Select" }).click();
  await expect(page.getByLabel("Vault path")).toBeVisible();
  await page.getByRole("button", { name: "Source types" }).click();
  await page.getByRole("button", { name: "Paste text" }).click();
  await expect(page.getByLabel("Text", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
