import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startServer } from "../server/app.js";

let instance, root;
test.beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-ui-"));
  instance = await startServer({ root, port: 0 });
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
    page.getByRole("heading", { name: /What would you like/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sources & notes", exact: true })
    .click();
  await page.getByRole("button", { name: "Add a source", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("My starting point");
  await page
    .getByLabel("Your notes or conversation")
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
    .getByRole("button", { name: "Field notes Fresh & grounded" })
    .click();
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
  expect(submitted.style).toBe("sage");
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
