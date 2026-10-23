import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import { monitorRuntime, openPage } from "./support";

// Home's loops (#95), each through the site's one loop player (src/components/loop-video.mjs):
// the System Window's Home tab plays the hero loop and its Apps tab the app install, and the
// "Approve from the keyboard" feature plays approving with Cmd Enter. Each shows the still that
// was there until it plays, so Home's largest paint and its captures are what they were. The
// player's own rules (no byte before play, the offscreen pause, the idle hint) are
// tests/browser/loop-video.spec.ts's. This holds Home to them:
// - each loop is its still until its Play is pressed, and Home asks for no video byte;
// - the System Window's tabs keep their keyboard model with the loops in them;
// - a video that cannot load leaves the still, a line saying so and the text beside it;
// - reduced motion leaves the stills, with no control and no request.
//
// Playback itself is not measured here: the test browser has no H.264 decoder, and the loops are
// H.264. The blocked case fails the request on purpose, so it is the one run with no runtime
// monitor.

const HERO = { tab: "Home", src: "/media/hero-loop.mp4" };
const APPS = { tab: "Apps", src: "/media/app-install.mp4" };
const APPROVE = "/media/approve-enter.mp4";
const MEDIA = /\.(mp4|webm|mov|m4v)(\?|$)/i;

function mediaRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on("request", (request) => {
    if (MEDIA.test(new URL(request.url()).pathname) || request.resourceType() === "media") seen.push(request);
  });
  return seen;
}

const tab = (page: Page, name: string) => page.locator(".system-tabs").getByRole("tab", { name, exact: true });
const windowLoop = (page: Page) => page.locator(".system-window .system-loop:not([hidden]) [data-loop-video]");
const approveLoop = (page: Page) => page.locator(`.delegation [data-loop-video][data-src="${APPROVE}"]`);

/**
 * A loop shown as its still: the still decoded and visible, the video hidden. Before a Play it has
 * no source; one that failed has the source it tried.
 */
async function expectStill(loop: Locator, state = "poster") {
  await expect(loop).toHaveAttribute("data-state", state);
  await expect(loop).toHaveAttribute("data-still", "");
  const still = loop.locator(":scope > img");
  await still.scrollIntoViewIfNeeded();
  await expect(still).toBeVisible();
  await expect
    .poll(() => still.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { message: "the still loads" })
    .toBe(true);
  const video = loop.locator("video");
  await expect(video).not.toHaveAttribute("poster", /./);
  expect(await video.evaluate((v) => getComputedStyle(v).opacity)).toBe("0");
  if (state !== "failed") await expect(video.locator("source")).toHaveCount(0);
}

test.describe("Home's loops", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === "reduced-motion", "the reduced-motion run is its own case below");
  });

  test("each shows its still until it plays, beside the stills of the tabs with no loop, and nothing loads", async ({
    page,
    baseURL
  }) => {
    const runtime = monitorRuntime(page, baseURL!);
    const media = mediaRequests(page);
    await openPage(page, "/");

    for (const loop of [HERO, APPS]) {
      await tab(page, loop.tab).click();
      await expect(windowLoop(page)).toHaveCount(1);
      await expect(windowLoop(page)).toHaveAttribute("data-src", loop.src);
      await expectStill(windowLoop(page));
      await expect(windowLoop(page).getByRole("button", { name: /^Play/ })).toBeVisible();
    }
    for (const name of ["Chat", "Loops"]) {
      await tab(page, name).click();
      await expect(windowLoop(page)).toHaveCount(0);
      await expect(page.locator(".system-window img.system-image.is-active:visible")).toHaveCount(1);
    }

    await expectStill(approveLoop(page));
    await expect(approveLoop(page).getByRole("button", { name: /^Play/ })).toBeVisible();

    await page.waitForTimeout(400);
    expect(media.map((r) => r.url()), "no video byte before a Play").toEqual([]);
    runtime.assertClean();
  });

  test("the System Window's Home tab keeps Home's largest paint: its still, fetched first", async ({ page }) => {
    await openPage(page, "/");
    const still = windowLoop(page).locator(":scope > img");
    await expect(still).toHaveAttribute("fetchpriority", "high");
    await expect(still).toHaveAttribute("loading", "eager");
    await expect(still).toHaveClass(/\bsystem-image\b/);
  });

  test("the tabs keep their keyboard model with the loops in them, and the loop's Play follows its tab", async ({
    page,
    baseURL
  }) => {
    const runtime = monitorRuntime(page, baseURL!);
    await openPage(page, "/");
    await tab(page, "Home").focus();

    await page.keyboard.press("ArrowRight");
    await expect(tab(page, "Chat")).toBeFocused();
    await expect(tab(page, "Chat")).toHaveAttribute("aria-selected", "true");
    await expect(windowLoop(page)).toHaveCount(0);

    await page.keyboard.press("End");
    await expect(tab(page, "Apps")).toBeFocused();
    await expect(windowLoop(page)).toHaveAttribute("data-src", APPS.src);

    await page.keyboard.press("ArrowRight");
    await expect(tab(page, "Home")).toBeFocused();
    await expect(windowLoop(page)).toHaveAttribute("data-src", HERO.src);

    // From the chosen tab, Tab reaches that tab's loop control, not a hidden one.
    await page.keyboard.press("Tab");
    await expect(windowLoop(page).getByRole("button", { name: /^Play/ })).toBeFocused();
    runtime.assertClean();
  });

  test("with their video blocked, the loops keep their stills, say they could not play, and their text stays", async ({
    page
  }) => {
    await page.route(MEDIA, (route) => route.abort("failed"));
    await openPage(page, "/");

    await windowLoop(page).getByRole("button", { name: /^Play/ }).click();
    await expect(windowLoop(page)).toHaveAttribute("data-state", "failed");
    await expect(windowLoop(page).getByText(/^The loop could not play\./)).toBeVisible();
    await expectStill(windowLoop(page), "failed");
    await expect(windowLoop(page).getByRole("button")).toHaveCount(0);
    await expect(page.locator(".system-window .system-caption")).toContainText("See what waits on you");

    await approveLoop(page).scrollIntoViewIfNeeded();
    await approveLoop(page).getByRole("button", { name: /^Play/ }).click();
    await expect(approveLoop(page)).toHaveAttribute("data-state", "failed");
    await expect(approveLoop(page).getByText(/^The loop could not play\./)).toBeVisible();
    await expectStill(approveLoop(page), "failed");
    await expect(page.locator(".delegation")).toContainText("approves the request that has keyboard focus");
  });
});

test("under reduced motion Home's loops show their stills, with no control and no request", async ({
  page,
  baseURL
}, testInfo) => {
  test.skip(testInfo.project.name !== "reduced-motion", "the reduced-motion run");
  const runtime = monitorRuntime(page, baseURL!);
  const media = mediaRequests(page);
  await openPage(page, "/");

  for (const loop of [HERO, APPS]) {
    await tab(page, loop.tab).click();
    await expectStill(windowLoop(page), "still");
    await expect(windowLoop(page).getByRole("button")).toHaveCount(0);
  }
  await expectStill(approveLoop(page), "still");
  await expect(approveLoop(page).getByRole("button")).toHaveCount(0);

  await page.waitForTimeout(400);
  expect(media.map((r) => r.url()), "no media request at all").toEqual([]);
  runtime.assertClean();
});
