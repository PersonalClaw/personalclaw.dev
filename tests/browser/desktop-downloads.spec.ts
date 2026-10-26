import { expect, test, type Page } from "@playwright/test";
import { openPage } from "./support";

// The desktop downloads (components/DesktopDownloads.astro): Home's install panel and /release.
//
// 1. The Mac download is reached with the keyboard alone, announces its file and size, is a 44 px
//    target, and Enter starts the pinned release's own file (the request is stopped at GitHub).
// 2. A Mac gets the desktop downloads before the install steps; any other platform gets them
//    after. The page reads the platform and nothing else: no request, no storage.
// 3. /release lists the same files: from 0.3.0 a dmg for each kind of Mac, so neither page sends
//    an Intel Mac to the install script.

const platform = (page: Page, name: string, userAgent: string) =>
  page.addInitScript(
    ([name, userAgent]) => {
      Object.defineProperty(navigator, "userAgentData", { value: { platform: name }, configurable: true });
      Object.defineProperty(navigator, "userAgent", { value: userAgent, configurable: true });
    },
    [name, userAgent]
  );

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** The order of the panel's two paths, as the reader meets them. */
const pathsInOrder = (page: Page) =>
  page.locator("#install-panel").evaluate((panel) =>
    [...panel.querySelectorAll("[data-install-steps], [data-desktop-downloads]")].map((element) =>
      element.hasAttribute("data-install-steps") ? "script" : "desktop"
    )
  );

test("the Mac download is reached by keyboard, announces its file and size, and starts the pinned file", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "a keyboard path, the same in every project");
  await platform(page, "Linux", LINUX);
  const requested: string[] = [];
  await page.route("https://github.com/**", (route) => {
    requested.push(route.request().url());
    return route.abort();
  });
  await openPage(page, "/");
  await page.getByRole("button", { name: "Install PersonalClaw" }).first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#install-panel")).toBeVisible();

  const mac = page.locator('a[data-desktop-download="mac"]');
  for (let presses = 0; presses < 40 && !(await mac.evaluate((element) => element === document.activeElement)); presses++) {
    await page.keyboard.press("Tab");
  }
  await expect(mac).toBeFocused();
  // What a screen reader announces: the file and its size, without the visual separators.
  await expect(mac).toHaveAccessibleName(/^Download for Mac Apple silicon ?, \d+\.\d MB ?, PersonalClaw-\d+\.\d+\.\d+-arm64\.dmg$/);
  const box = await mac.boundingBox();
  expect(box && box.height).toBeGreaterThanOrEqual(44);

  await page.keyboard.press("Enter");
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  expect(requested[0]).toMatch(/^https:\/\/github\.com\/PersonalClaw\/PersonalClaw\/releases\/download\/v\d+\.\d+\.\d+\/PersonalClaw-\d+\.\d+\.\d+-arm64\.dmg$/);
});

test("a Mac gets the desktop downloads first, and another platform gets the install steps first", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "a platform check, the same at every width");
  await platform(page, "Linux", LINUX);
  await openPage(page, "/");
  expect(await pathsInOrder(page)).toEqual(["script", "desktop"]);

  await platform(page, "macOS", MAC);
  await page.reload();
  expect(await pathsInOrder(page)).toEqual(["desktop", "script"]);
  // An Intel Mac gets its own dmg, and no line sends it to the steps instead.
  await expect(page.locator('#install-panel a[data-desktop-download="intel"]')).toHaveAttribute(
    "href",
    /\/releases\/download\/v\d+\.\d+\.\d+\/PersonalClaw-\d+\.\d+\.\d+-x64\.dmg$/
  );
  await expect(page.locator("#install-panel [data-desktop-intel-fallback]")).toHaveCount(0);
});

test("/release lists the same files, the Intel dmg among them, and no Intel Mac line", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one route check");
  await openPage(page, "/release");
  const section = page.locator("[data-desktop-downloads]");
  await expect(section.getByRole("heading", { name: /Desktop app/ })).toBeVisible();
  for (const kind of ["mac", "intel", "appimage", "deb"]) await expect(section.locator(`a[data-desktop-download="${kind}"]`)).toHaveCount(1);
  await expect(section.locator('a[data-desktop-download="intel"]')).toHaveAccessibleName(/^Intel Mac.*PersonalClaw-\d+\.\d+\.\d+-x64\.dmg, \d+\.\d MB$/);
  await expect(section.locator("[data-desktop-intel-fallback]")).toHaveCount(0);
});
