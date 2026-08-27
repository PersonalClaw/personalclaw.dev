import { expect, test } from "@playwright/test";
import { appFactLabels, appFacts, apps } from "../../src/data/apps";
import { monitorRuntime, openPage, settlePage } from "./support";

test("system window exposes one coherent selected view", async ({ page, baseURL }) => {
  const runtime = monitorRuntime(page, baseURL!);
  await openPage(page, "/");

  const home = page.getByRole("tab", { name: "Home" });
  const loops = page.getByRole("tab", { name: "Loops" });
  await expect(home).toHaveAttribute("aria-selected", "true");
  await loops.click();
  await expect(loops).toHaveAttribute("aria-selected", "true");
  await expect(home).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName("Loops");
  await expect(page.getByText("Delegate goals, not prompts", { exact: true })).toBeVisible();
  await settlePage(page);
  runtime.assertClean();
});

test("app directory preserves deep-linked filters and can recover from no results", async ({
  page,
  baseURL
}) => {
  const runtime = monitorRuntime(page, baseURL!);
  await openPage(page, "/apps?q=Ollama&category=models");

  const search = page.getByRole("searchbox", { name: "Search first-party apps" });
  const models = page.getByRole("button", { name: "Models", exact: true });
  await expect(search).toHaveValue("Ollama");
  await expect(models).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".app-card")).toHaveCount(1);
  await expect(page.locator(".app-card").getByRole("heading")).toHaveText("Ollama");
  await expect(page).toHaveURL(/q=Ollama&category=models$/);

  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No apps match those filters.")).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("button", { name: "All", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  // Exact on purpose: a directory entry disappearing should fail, not be tolerated.
  // Tracks the first-party app count of the pinned release (39 at v0.1.3).
  await expect(page.locator(".app-card")).toHaveCount(39);
  await expect(page).toHaveURL("/apps");
  runtime.assertClean();
});

// The floor for the two derived chips. Two failures are possible and both used to ship
// silently: a flagged app rendering no chip (the `local`/`keyless` fields had zero
// consumers), and someone hand-copying "Local"/"Keyless" back into `tags`, which would
// double the chip and spend a tag slot on it.
test("every declared local and keyless app renders its derived chip, once", async ({
  page,
  baseURL
}) => {
  const runtime = monitorRuntime(page, baseURL!);
  await openPage(page, "/apps");

  for (const label of appFactLabels) {
    expect(
      apps.filter((app) => app.tags.includes(label)).map((app) => app.slug),
      `"${label}" is derived from a registry field and must not be repeated in tags`
    ).toEqual([]);
  }

  for (const app of apps) {
    const characteristics = page.getByRole("list", { name: `${app.name} characteristics` });
    await expect(characteristics.getByRole("listitem")).toHaveText([
      ...appFacts(app),
      ...app.tags.slice(0, 4)
    ]);
  }

  // The two Diarization cards are the sharpest case: they differ (only ONNX is keyless)
  // but their tags were the same two words in a different order, so the cards read as
  // identical. The chips are what makes the difference visible.
  await expect(
    page.getByRole("list", { name: "Diarization (ONNX) characteristics" }).getByRole("listitem")
  ).toHaveText(["Local", "Keyless", "Diarization"]);
  await expect(
    page
      .getByRole("list", { name: "Diarization (pyannote) characteristics" })
      .getByRole("listitem")
  ).toHaveText(["Local", "Diarization"]);

  // Searching a fact now reaches the field rather than the copy of it in `tags`.
  await page.getByRole("searchbox", { name: "Search first-party apps" }).fill("keyless");
  await expect(page.locator(".app-card")).toHaveCount(
    apps.filter((app) => app.keyless).length
  );
  runtime.assertClean();
});

test("copy command writes the complete install command", async ({
  page,
  context,
  baseURL
}) => {
  const runtime = monitorRuntime(page, baseURL!);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: baseURL
  });
  await openPage(page, "/");

  const copy = page.locator(".copy-button");
  await expect(copy).toHaveAccessibleName("Copy install command");
  await copy.click();
  await expect(copy).toHaveAccessibleName("Install command copied");
  await expect(page.getByRole("status")).toHaveText("Install command copied");
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe("curl -fsSL https://personalclaw.dev/install | sh");
  runtime.assertClean();
});

test("mobile navigation exposes state and restores focus on Escape", async ({
  page,
  baseURL
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile navigation is only rendered at the mobile breakpoint");
  const runtime = monitorRuntime(page, baseURL!);
  await openPage(page, "/");

  const button = page.locator("[data-menu-button]");
  await expect(button).toHaveAccessibleName("Open navigation");
  const menu = page.locator("[data-mobile-menu]");
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toHaveAttribute("aria-hidden", "false");
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toHaveAttribute("aria-hidden", "true");
  await expect(button).toBeFocused();
  runtime.assertClean();
});

test("release provenance exposes exact pinned source evidence", async ({
  page,
  baseURL
}) => {
  const runtime = monitorRuntime(page, baseURL!);
  await openPage(page, "/release");

  const provenance = page.locator("[data-release-provenance]");
  const channel = await provenance.getAttribute("data-source-channel");
  expect(channel).toMatch(/^(?:pre-release|released)$/);
  await expect(provenance).toHaveAttribute("data-content-schema", /^\d+$/);
  const coreCommit = await provenance.getAttribute("data-core-commit");
  const appsCommit = await provenance.getAttribute("data-apps-commit");
  expect(coreCommit).toMatch(/^[0-9a-f]{40}$/);
  expect(appsCommit).toMatch(/^[0-9a-f]{40}$/);
  if (channel === "pre-release") {
    await expect(
      page.getByText("Pinned development snapshot", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("This is a development snapshot, not a release claim.", {
        exact: true
      })
    ).toBeVisible();
  } else {
    await expect(page.getByText("Verified release", { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: coreCommit!.slice(0, 12) })).toHaveAttribute(
    "href",
    new RegExp(coreCommit!)
  );
  await expect(page.getByRole("link", { name: appsCommit!.slice(0, 12) })).toHaveAttribute(
    "href",
    new RegExp(appsCommit!)
  );
  runtime.assertClean();
});
