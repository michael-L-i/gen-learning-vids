import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startServer } from "../server/app.js";
import { pcmWave } from "../server/speech.js";

let instance, root;
test.beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-ui-"));
  await fs.mkdir(path.join(root, "known-vault"));
  await fs.writeFile(
    path.join(root, "known-vault", "Known note.md"),
    "Discovered note.",
  );
  instance = await startServer({
    discoverVaults: async () => ({
      vaults: [
        {
          name: "Known vault",
          path: path.join(root, "known-vault"),
          open: true,
        },
      ],
      message: "",
    }),
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
  await expect
    .poll(() =>
      page
        .locator(".source-types .brand-logo")
        .evaluateAll(
          (images) =>
            images.length === 4 &&
            images.every((img) => img.complete && img.naturalWidth > 0),
        ),
    )
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath("source-picker.png") });
  await page
    .getByRole("button", { name: "Conversations & memory ChatGPT" })
    .click();
  await page.getByRole("button", { name: "ChatGPT", exact: true }).click();
  await page.getByLabel("Memory / summary", { exact: true }).check();
  await page.getByLabel("Title", { exact: true }).fill("ChatGPT memory");
  await expect(
    page.getByText(/does not connect to your account/),
  ).toBeVisible();
  await page
    .getByLabel("Memory or summary", { exact: true })
    .fill("I know algebra and prefer diagrams.");
  await page.getByRole("button", { name: "Add to sources" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const memory = (await instance.library.sources()).find(
    (s) => s.kind === "memory",
  );
  expect(memory.content).toBe("I know algebra and prefer diagrams.");

  for (const [mode, name, contents, expected] of [
    [
      "Upload file",
      "Calculus.md",
      "# Derivatives\nRate of change",
      "Rate of change",
    ],
    [
      "Conversations & memory ChatGPT",
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
    const payload = {
      name,
      mimeType: "text/plain",
      buffer: Buffer.from(contents),
    };
    if (mode === "Upload file") {
      await page
        .getByRole("button", { name: "Add a source", exact: true })
        .click();
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: mode }).click();
      await (await chooser).setFiles(payload);
    } else {
      await open(mode);
      await page.getByRole("button", { name: "Claude", exact: true }).click();
      await page.getByLabel("Chat export file").setInputFiles(payload);
      await expect(page.getByLabel("Conversation text")).toHaveValue(
        /Explain return values/,
      );
      await page.getByRole("button", { name: "Add to sources" }).click();
    }
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const source = (await instance.library.sources()).find(
      (s) => s.origin === name,
    );
    expect(source.content).toContain(expected);
    expect(source.kind).toBe(mode === "Upload file" ? "file" : "conversation");
    if (mode === "Upload file") expect(source.title).toBe(name);
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
    ["Obsidian Choose", "Vault path", "obsidian"],
  ]) {
    await open(mode);
    await expect(
      page.getByLabel("Known note.md", { exact: true }),
    ).toBeVisible();
    await page.getByText("Use another vault", { exact: true }).click();
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
  await fs.writeFile(path.join(folder, "ignored.pdf"), "unsupported");
  await page.getByRole("button", { name: "Add a source", exact: true }).click();
  const directoryChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload folder" }).click();
  await (await directoryChooser).setFiles(folder);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const uploadedFolder = (await instance.library.sources()).find(
    (source) => source.kind === "folder",
  );
  expect(uploadedFolder.title).toBe("notes-to-import");
  expect(uploadedFolder.content).toContain("# Selected.md");
  expect(uploadedFolder.content).toContain("# Unselected.md");
  expect(uploadedFolder.content).not.toContain("unsupported");
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
  await page
    .getByRole("button", { name: "Conversations & memory ChatGPT" })
    .click();
  await expect(
    page.getByRole("button", { name: "Gemini", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("chat-services-mobile.png"),
  });
  await page.getByRole("button", { name: "Gemini", exact: true }).click();
  await expect(page.getByLabel("Conversation text")).toBeVisible();
  await page
    .getByRole("button", { name: "Chat services", exact: true })
    .click();
  await page.getByRole("button", { name: "Source types", exact: true }).click();
  await page.getByRole("button", { name: "Obsidian Choose" }).click();
  await expect(page.getByLabel("Known note.md", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Vault path")).not.toBeVisible();
  await page.getByRole("button", { name: "Source types" }).click();
  await page.getByRole("button", { name: "Paste text" }).click();
  await expect(page.getByLabel("Text", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("chat services show logos and preview the selected provider's exports", async ({
  page,
}, testInfo) => {
  await page.goto(instance.url);
  await page
    .getByRole("button", { name: "Sources & notes", exact: true })
    .click();
  for (const [provider, name, payload, expected] of [
    [
      "chatgpt",
      "ChatGPT",
      [
        {
          title: "Functions",
          current_node: "a",
          mapping: {
            a: {
              id: "a",
              parent: null,
              message: {
                author: { role: "user" },
                content: { parts: ["Explain arguments"] },
              },
            },
          },
        },
      ],
      "Explain arguments",
    ],
    [
      "claude",
      "Claude",
      [
        {
          name: "Functions",
          chat_messages: [{ sender: "human", text: "Explain scope" }],
        },
      ],
      "Explain scope",
    ],
    [
      "gemini",
      "Gemini",
      [
        {
          header: "Gemini Apps",
          title: "Prompted Explain closures",
          time: "2026-09-08T12:00:00Z",
          safeHtmlItem: [
            {
              html: "<p>A closure keeps its <strong>environment</strong>.</p><script>bad()</script>",
            },
          ],
        },
      ],
      "A closure keeps its environment.",
    ],
  ]) {
    await page
      .getByRole("button", { name: "Add a source", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Conversations & memory ChatGPT" })
      .click();
    const logos = page.locator(".chat-service .brand-logo");
    await expect(logos).toHaveCount(3);
    await expect
      .poll(() =>
        logos.evaluateAll((images) =>
          images.every((img) => img.complete && img.naturalWidth > 0),
        ),
      )
      .toBe(true);
    if (provider === "chatgpt")
      await page.screenshot({ path: testInfo.outputPath("chat-services.png") });
    await page.getByRole("button", { name, exact: true }).click();
    await page.getByLabel("Chat export file").setInputFiles({
      name: `${provider}.json`,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(payload)),
    });
    await expect(page.getByLabel("Conversation text")).toHaveValue(
      new RegExp(expected.replaceAll(".", "\\.")),
    );
    await expect(page.getByLabel("Conversation text")).not.toHaveValue(
      /bad\(\)/,
    );
    // Imported JSON becomes editable plain text, without being parsed a second time.
    await page
      .getByLabel("Conversation text")
      .fill(`${expected}\nMy own context.`);
    await page.getByRole("button", { name: "Add to sources" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const saved = (await instance.library.sources()).find(
      (source) => source.origin === `${provider}.json`,
    );
    expect(saved.provider).toBe(provider);
    expect(saved.content).toBe(`${expected}\nMy own context.`);
  }
});

test("benchmark viewer compares runs and persists timestamped review", async ({
  page,
}) => {
  const { createBenchmarkRun, executeBenchmarkRun, caseDir } = await import(
    "../server/benchmarks.js"
  );
  const first = await createBenchmarkRun(instance.library, {
    mode: "reference",
    caseIds: ["physics-kinematics"],
    label: "UI reference",
  });
  const file = path.join(
    caseDir(instance.library, first.id, "physics-kinematics"),
    "storyboard.json",
  );
  const scene = JSON.parse(await fs.readFile(file));
  scene.content.beats.forEach((b) => (b.seconds = 0.5));
  await fs.writeFile(file, JSON.stringify(scene));
  const opts = {
    synthesize: async (_, file) =>
      fs.writeFile(file, pcmWave(new Float32Array(12000))),
  };
  await executeBenchmarkRun(instance.library, first.id, opts);
  const second = await createBenchmarkRun(instance.library, {
    mode: "replay",
    fromRun: first.id,
    label: "UI replay",
  });
  await executeBenchmarkRun(instance.library, second.id, opts);
  await page.goto(instance.url);
  await page.getByRole("button", { name: "Benchmarks", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Benchmarks", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Physics Distance under constant/ })
    .click();
  await page.getByLabel("Run", { exact: true }).selectOption(second.id);
  await page.getByLabel("Compare with", { exact: true }).selectOption(first.id);
  await expect(page.locator("video")).toHaveCount(2);
  await expect
    .poll(() =>
      page
        .locator("video")
        .first()
        .evaluate((v) => v.readyState),
    )
    .toBeGreaterThan(0);
  await page
    .getByLabel("Notes", { exact: true })
    .fill("At 0.5s keep the arrow attached.");
  await page.getByLabel("Timestamp (seconds)").fill("0.5");
  await page.getByLabel("motion score").selectOption("4");
  await page.getByLabel("Decision").selectOption("keep");
  await page.getByLabel("Preferred clip").selectOption("current");
  await page
    .getByRole("button", { name: "Save feedback", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Feedback saved");
  await page.reload();
  await page.getByRole("button", { name: "Benchmarks", exact: true }).click();
  await page
    .getByRole("button", { name: /Physics Distance under constant/ })
    .click();
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
    "At 0.5s keep the arrow attached.",
  );
  await expect(page.getByLabel("motion score")).toHaveValue("4");
  await page.getByText("New run", { exact: true }).click();
  await page.getByLabel("Run type", { exact: true }).selectOption("replay");
  await expect(
    page.getByRole("checkbox", { name: "Physics", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Biology", exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Benchmarks", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
