import { expect, test, type Page } from "@playwright/test";
import { appFactLabels, appFacts, apps } from "../../src/data/apps";
import { monitorRuntime, openPage, settlePage } from "./support";

// The directory filters from a rail of buttons on wide screens and from one select at
// 960 px and below, where a row of fifteen buttons used to scroll sideways.
function isNarrow(page: Page) {
  return (page.viewportSize()?.width ?? 1440) <= 960;
}

function categoryButton(page: Page, name: string) {
  return page
    .getByRole("group", { name: "Filter apps by category" })
    .getByRole("button", { name: new RegExp(`^${name} \\d+ apps?$`) });
}

async function chooseCategory(page: Page, name: string) {
  if (isNarrow(page)) {
    await page.getByLabel("Category", { exact: true }).selectOption(name);
  } else {
    await categoryButton(page, name).click();
  }
}

async function expectCategory(page: Page, name: string) {
  if (isNarrow(page)) {
    await expect(page.getByLabel("Category", { exact: true })).toHaveValue(name);
  } else {
    await expect(categoryButton(page, name)).toHaveAttribute("aria-pressed", "true");
  }
}

/** Each category the control offers, with the count it shows beside the name. */
async function shownCategories(page: Page) {
  if (isNarrow(page)) {
    const labels = await page.locator(".category-select option").allTextContents();
    return labels.map((label) => {
      const [, name, count] = /^(.+) \((\d+)\)$/.exec(label)!;
      return { name, count: Number(count) };
    });
  }
  const buttons = page.getByRole("group", { name: "Filter apps by category" }).getByRole("button");
  const shown = [];
  for (const button of await buttons.all()) {
    shown.push({
      name: (await button.locator("span").first().textContent())!,
      count: Number.parseInt((await button.locator(".category-count").textContent())!, 10)
    });
  }
  return shown;
}

function appCard(page: Page, name: string) {
  return page
    .locator(".app-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}

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
  await openPage(page, "/apps?q=vLLM&category=models");

  const search = page.getByRole("searchbox", { name: "Search first-party apps" });
  await expect(search).toHaveValue("vLLM");
  await expectCategory(page, "Models");
  await expect(page.locator(".app-card")).toHaveCount(1);
  await expect(page.locator(".app-card").getByRole("heading")).toHaveText("vLLM");
  await expect(page).toHaveURL(/q=vLLM&category=models$/);

  await chooseCategory(page, "Search");
  await expect(page.getByText("No apps match those filters.")).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(search).toHaveValue("");
  await expectCategory(page, "All");
  // Exact on purpose: a directory entry disappearing should fail, not be tolerated.
  // Tracks the first-party app count of the pinned release (69 at v0.2.2).
  await expect(page.locator(".app-card")).toHaveCount(69);
  await expect(page).toHaveURL("/apps");
  runtime.assertClean();
});

// Every count beside a category comes from the pinned manifests (the release sync counts
// them), so a count can only disagree with the directory if the two read different
// sources. Each category's filter must show exactly the number it claims.
test("each category's count is the number of apps its filter shows", async ({
  page,
  baseURL
}) => {
  const runtime = monitorRuntime(page, baseURL!);
  await openPage(page, "/apps");

  const shown = await shownCategories(page);
  expect(shown[0].name).toBe("All");
  expect(shown.length).toBeGreaterThan(1);
  // Every app sits in exactly one category.
  expect(shown.slice(1).reduce((sum, { count }) => sum + count, 0)).toBe(shown[0].count);

  for (const { name, count } of shown) {
    await chooseCategory(page, name);
    await expect(page.locator(".app-card"), `the ${name} filter`).toHaveCount(count);
    await expect(page.locator(".result-count")).toHaveText(
      `${count} ${count === 1 ? "app" : "apps"}`
    );
  }
  runtime.assertClean();
});

// The filters stay on screen while the grid scrolls under them, so a filter chosen from
// far down the page used to leave the reader past the end of a one-card result.
test("a filter chosen far down the grid brings its results into view", async ({
  page,
  baseURL
}) => {
  const runtime = monitorRuntime(page, baseURL!);
  await openPage(page, "/apps");

  await page.locator(".app-card").nth(60).scrollIntoViewIfNeeded();
  await chooseCategory(page, "Skills");
  await expect(page.locator(".app-card")).toHaveCount(1);
  await expect(page.locator(".app-card")).toBeInViewport();
  runtime.assertClean();
});

test("an unknown category in the URL says so and shows every category", async ({
  page,
  baseURL
}) => {
  const runtime = monitorRuntime(page, baseURL!);
  await openPage(page, "/apps?category=spreadsheets");

  const notice = page.getByRole("status");
  await expect(notice).toHaveText("There is no “spreadsheets” category. Showing every category.");
  await expectCategory(page, "All");
  await expect(page.locator(".app-card")).toHaveCount(apps.length);
  await expect(page).toHaveURL("/apps");

  await chooseCategory(page, "Speech");
  await expect(notice).toHaveCount(0);
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
    // Exact: a name otherwise matches as a substring, and "Companion" is inside "Menu
    // Bar Companion".
    const card = appCard(page, app.name);
    await expect(card.locator(".app-traits > span")).toHaveText([...appFacts(app), ...app.tags]);
    // The card's one link is named by the app alone, not by everything on the card.
    await expect(card.getByRole("link")).toHaveAccessibleName(app.name);
  }
  await expect(page.locator(".app-directory").getByRole("list")).toHaveCount(0);

  // ── The pill budget, which used to be a silent runtime slice ──────────────────────────
  //
  // `AppDirectory` rendered `tags.slice(0, 4)`, so a card with five tags simply lost one. Censused
  // across all 39 apps, that cap's entire effect was to drop `openrouter-models`' `Video` — while the
  // search haystack indexes every tag, so the app was findable by a word its card refused to show.
  //
  // The slice is gone and the bound lives here instead: a card that would need more pills than the
  // layout can carry now fails THIS, with the app named, instead of truncating without saying so. The
  // numbers are measured, not chosen — 5 is the widest card in the catalogue today (5 tags + 0 facts),
  // and 6 is the ceiling the two-fact case would reach at four tags.
  const PILL_BUDGET = 6;
  const widest = Math.max(...apps.map((app) => appFacts(app).length + app.tags.length));
  expect(widest, "the widest card in the catalogue grew — re-measure before raising the budget").toBe(5);
  for (const app of apps) {
    const pills = appFacts(app).length + app.tags.length;
    expect(
      pills,
      `${app.name} needs ${pills} pills; the card budget is ${PILL_BUDGET}. Reduce its tags, or raise ` +
        `the budget deliberately after checking the card still reads at 390px — do NOT re-add a slice, ` +
        `which drops a real capability silently.`
    ).toBeLessThanOrEqual(PILL_BUDGET);
  }

  // The two Diarization cards are the sharpest case: they differ (only ONNX is keyless)
  // but their tags were the same two words in a different order, so the cards read as
  // identical. The chips are what makes the difference visible.
  await expect(appCard(page, "Diarization (ONNX)").locator(".app-traits > span")).toHaveText([
    "Local",
    "Keyless",
    "Diarization"
  ]);
  await expect(
    appCard(page, "Diarization (pyannote)").locator(".app-traits > span")
  ).toHaveText(["Local", "Diarization"]);

  // Searching a fact now reaches the field rather than the copy of it in `tags`.
  await page.getByRole("searchbox", { name: "Search first-party apps" }).fill("keyless");
  await expect(page.locator(".app-card")).toHaveCount(
    apps.filter((app) => app.keyless).length
  );
  runtime.assertClean();
});

test("copy command writes the complete download command", async ({
  page,
  context,
  baseURL
}) => {
  const runtime = monitorRuntime(page, baseURL!);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: baseURL
  });
  await openPage(page, "/");
  await page.locator(".home-hero").getByRole("button", { name: "Install PersonalClaw" }).click();

  // The download step only downloads: nothing on Home copies a pipe into a shell.
  const copy = page.locator("#install-panel .copy-button").first();
  await expect(copy).toHaveAccessibleName("Copy download command");
  await copy.click();
  await expect(copy).toHaveAccessibleName("Download command copied");
  await expect(page.getByRole("status").filter({ hasText: "copied" })).toHaveText("Download command copied");
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe("curl -fsSLO https://personalclaw.dev/install");
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
