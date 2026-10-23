import { expect, test } from "@playwright/test";
import { openPage, tabTo } from "./support";

test("skip link moves keyboard focus to main content", async ({ page }) => {
  await openPage(page, "/");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await expect(page).toHaveURL(/#main-content$/);
});

test("primary navigation is keyboard operable", async ({ page }, testInfo) => {
  await openPage(page, "/");

  const destination =
    testInfo.project.name === "mobile"
      ? page.locator("#mobile-menu").getByRole("link", { name: "Product", exact: true })
      : page.getByRole("link", { name: "Product", exact: true }).first();

  if (testInfo.project.name === "mobile") {
    const menuButton = page.getByRole("button", { name: "Open navigation" });
    await tabTo(page, menuButton);
    await page.keyboard.press("Enter");
  }

  await tabTo(page, destination);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/product");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("See it do the work.");
});

test("system tabs support roving keyboard navigation", async ({ page }) => {
  await openPage(page, "/");

  // Four views: Home, a thread, a goal loop and Apps (#88).
  await expect(page.getByRole("tab")).toHaveText(["Home", "Chat", "Loops", "Apps"]);
  const home = page.getByRole("tab", { name: "Home" });
  await tabTo(page, home);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Chat" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Chat" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Apps" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(home).toBeFocused();
});

test("app search and category filters work by keyboard", async ({ page }) => {
  await openPage(page, "/apps");

  const search = page.getByRole("searchbox", { name: "Search first-party apps" });
  await tabTo(page, search);
  await page.keyboard.type("vLLM");
  await expect(page.locator(".app-card")).toHaveCount(1);
  await expect(page).toHaveURL(/q=vLLM/);

  // A select at 960 px and below, the rail's buttons above it.
  if ((page.viewportSize()?.width ?? 1440) <= 960) {
    const category = page.getByLabel("Category", { exact: true });
    await tabTo(page, category);
    await page.keyboard.type("Models");
    await expect(category).toHaveValue("Models");
  } else {
    const models = page.getByRole("button", { name: /^Models \d+ apps$/ });
    await tabTo(page, models);
    await page.keyboard.press("Enter");
    await expect(models).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page).toHaveURL(/category=models/);
});

test("the download command can be copied without a pointer", async ({
  page,
  context,
  baseURL
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: baseURL
  });
  await openPage(page, "/");

  const install = page.locator(".home-hero").getByRole("button", { name: "Install PersonalClaw" });
  await tabTo(page, install);
  await page.keyboard.press("Enter");
  const copy = page.locator("#install-panel .copy-button").first();
  await expect(copy).toHaveAccessibleName("Copy download command");
  await tabTo(page, copy);
  await page.keyboard.press("Enter");
  await expect(copy).toHaveAccessibleName("Download command copied");
});
