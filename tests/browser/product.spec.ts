import { expect, test, type Page, type Request } from "@playwright/test";
import { monitorRuntime, openPage, settlePage } from "./support";

// /product (#90, #96): the tour first, poster-first, with its chapter kept in the URL, then one
// section per capability, each with one dominant capture in a box that does not move. The tour
// plays only when asked (a chapter, or its own play control), fetches its file once, pauses out
// of view and on a hidden page, and falls back to its chapters as text when it cannot play.
//
// "No video byte before an explicit play" (SITE-REDESIGN.md, section 5.6) is measured by
// recording every request the page makes: a request for the tour's video file, or for any
// other video, before play fails the test. Data saver has no Playwright emulation, so it is
// stubbed as `navigator.connection.saveData = true` before the page's scripts run.

const CAPABILITIES = ["chat", "loops", "memory", "knowledge", "automation", "agents"];
const VIDEO = /\.(mp4|webm|mov|m4v)(\?|$)/i;

function videoRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    // A blob: or data: URL is the page reading what it already holds, not a request for a video.
    if (url.protocol === "blob:" || url.protocol === "data:") return;
    if (VIDEO.test(url.pathname) || request.resourceType() === "media") {
      seen.push(request);
    }
  });
  return seen;
}

async function saveData(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true, effectiveType: "4g", addEventListener() {}, removeEventListener() {} }
    });
  });
}

const chapter = (page: Page, name: string) =>
  page.getByRole("list", { name: "Tour chapters" }).getByRole("button", { name: new RegExp(`^${name}`) });

async function expectPoster(page: Page) {
  const video = page.locator("#tour video");
  await expect(video).toHaveAttribute("preload", "none");
  await expect(video).toHaveAttribute("poster", /personalclaw-tour-poster\.webp$/);
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused && v.readyState === 0)).toBe(true);
}

test.describe("the tour asks for no video before play", () => {
  for (const [name, setup] of [
    ["by default", async () => {}],
    ["with reduced motion", async (page: Page) => page.emulateMedia({ reducedMotion: "reduce" })],
    ["with data saver", saveData]
  ] as const) {
    test(`on /product and on a chapter's link, ${name}`, async ({ page, baseURL }) => {
      await setup(page);
      const runtime = monitorRuntime(page, baseURL!);
      const videos = videoRequests(page);
      await openPage(page, "/product");
      await expectPoster(page);
      await openPage(page, "/product?chapter=knowledge#tour");
      await expect(chapter(page, "Knowledge searched locally")).toHaveAttribute("aria-pressed", "true");
      await expectPoster(page);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await settlePage(page);
      expect(videos.map((r) => r.url()), "video requested before play").toEqual([]);
      runtime.assertClean();
    });
  }
});

test("the chosen chapter is in the URL and comes back on reload, back and forward", async ({
  page,
  context,
  baseURL
}) => {
  // Choosing a chapter is an explicit play, so it puts the chapter in the URL and plays.
  await openPage(page, "/product");
  const chosen = chapter(page, "A goal loop and its report");
  await expect(chapter(page, "Home, and what needs you")).toHaveAttribute("aria-pressed", "true");
  await chosen.click();
  await expect(page).toHaveURL(/\/product\?chapter=loops$/);
  await expectPlayingFrom(page, Number(await chosen.getAttribute("data-start")));
  const link = page.url();

  // That URL, loaded again, restores the chapter and asks for no video, through back and forward.
  const again = await context.newPage();
  const runtime = monitorRuntime(again, baseURL!);
  const videos = videoRequests(again);
  await again.goto(link);
  await settlePage(again);
  const loops = chapter(again, "A goal loop and its report");
  await expect(loops).toHaveAttribute("aria-pressed", "true");

  await again.reload();
  await expect(loops).toHaveAttribute("aria-pressed", "true");

  await openPage(again, "/apps");
  await again.goBack();
  await expect(again).toHaveURL(/\/product\?chapter=loops$/);
  await expect(loops).toHaveAttribute("aria-pressed", "true");

  await again.goForward();
  await expect(again).toHaveURL(/\/apps$/);
  await again.goBack();
  await expect(loops).toHaveAttribute("aria-pressed", "true");
  await expect(chapter(again, "Home, and what needs you")).toHaveAttribute("aria-pressed", "false");

  expect(videos.map((r) => r.url()), "video requested by a restored chapter").toEqual([]);
  runtime.assertClean();
});

test("a chapter choice adds no history entry, and plays the tour from that chapter", async ({
  page,
  baseURL
}) => {
  const runtime = monitorRuntime(page, baseURL!);
  await openPage(page, "/");
  await openPage(page, "/product");
  const approval = chapter(page, "The approval it stops on");
  await approval.click();
  await expect(page).toHaveURL(/\?chapter=approval$/);
  await expectPlayingFrom(page, Number(await approval.getAttribute("data-start")));

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/product\?chapter=approval$/);
  await expect(approval).toHaveAttribute("aria-pressed", "true");
  runtime.assertClean();
});

/** The tour plays, from at least *start* seconds in. */
async function expectPlayingFrom(page: Page, start: number) {
  const video = page.locator("#tour video");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement, from: number) => !v.paused && v.currentTime >= from, start))
    .toBe(true);
}

test("the tour carries a poster, a captions track and a chapters track", async ({ page }) => {
  await openPage(page, "/product");
  const video = page.locator("#tour video");
  await expect(video).toHaveAttribute("poster", /personalclaw-tour-poster\.webp$/);
  await expect(video.locator('track[kind="captions"]')).toHaveAttribute("src", /personalclaw-tour\.vtt$/);
  await expect(video.locator('track[kind="chapters"]')).toHaveAttribute("src", /personalclaw-tour-chapters\.vtt$/);
});

test("playing, choosing three chapters out of order and scrubbing fail no request, and fetch the file once", async ({
  page,
  baseURL
}) => {
  const runtime = monitorRuntime(page, baseURL!);
  const videos = videoRequests(page);
  await openPage(page, "/product");
  await page.getByRole("button", { name: "Play the tour" }).click();
  await expectPlayingFrom(page, 0);
  for (const name of ["Knowledge searched locally", "A chat, in your own words", "What it made, in the Library"]) {
    const button = chapter(page, name);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expectPlayingFrom(page, Number(await button.getAttribute("data-start")));
  }
  const video = page.locator("#tour video");
  await video.evaluate(async (v: HTMLVideoElement) => {
    v.currentTime = 30;
    await new Promise((resolve) => v.addEventListener("seeked", resolve, { once: true }));
  });
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(30, 0);
  expect(videos.map((r) => new URL(r.url()).pathname), "the tour's file, fetched once").toEqual([
    "/media/personalclaw-tour.mp4"
  ]);
  runtime.assertClean();
});

test("scrolled out of view or on a hidden page the tour pauses, and neither resumes it", async ({ page }) => {
  await openPage(page, "/product");
  const video = page.locator("#tour video");
  const paused = () => video.evaluate((v: HTMLVideoElement) => v.paused);

  await page.getByRole("button", { name: "Play the tour" }).click();
  await expectPlayingFrom(page, 0);
  await page.locator("#automation").scrollIntoViewIfNeeded();
  await expect.poll(paused).toBe(true);
  await page.locator("#tour").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  expect(await paused(), "coming back into view does not resume it").toBe(true);

  await video.evaluate((v: HTMLVideoElement) => v.play());
  await expectPlayingFrom(page, 0);
  const visibility = (state: "hidden" | "visible") =>
    page.evaluate((value) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
  await visibility("hidden");
  await expect.poll(paused).toBe(true);
  await visibility("visible");
  await page.waitForTimeout(500);
  expect(await paused(), "the page coming back does not resume it").toBe(true);
});

test("with its video blocked the tour shows its poster, its chapters as text and one line, and tries no second time", async ({
  page
}) => {
  const attempts: string[] = [];
  await page.route(/personalclaw-tour\.mp4$/, (route) => {
    attempts.push(route.request().url());
    return route.abort();
  });
  await openPage(page, "/product");
  await page.getByRole("button", { name: "Play the tour" }).click();

  const fallback = page.locator("[data-tour-fallback]");
  await expect(fallback).toBeVisible();
  await expect(fallback.getByRole("status")).toHaveText(/could not play/);
  await expect(fallback.locator("img")).toHaveAttribute("src", /personalclaw-tour-poster\.webp$/);
  const titles = await page.locator("[data-chapter] .chapter-label").allTextContents();
  const outline = fallback.locator("ol > li");
  await expect(outline).toHaveCount(titles.length);
  for (const [index, title] of titles.entries()) {
    await expect(outline.nth(index)).toContainText(title);
    expect((await outline.nth(index).textContent())!.length, `${title} reads with its caption`).toBeGreaterThan(title.length + 20);
  }
  await expect(page.getByRole("list", { name: "Tour chapters" })).toBeVisible();

  await chapter(page, "The approval it stops on").click();
  await page.waitForTimeout(500);
  expect(attempts, "one attempt, and no retry").toHaveLength(1);
});

test("from the keyboard alone, Tab reaches the play control and every chapter in order, and Enter and Space work them", async ({
  page
}) => {
  await openPage(page, "/product");
  const play = page.getByRole("button", { name: "Play the tour" });
  for (let i = 0; i < 40 && !(await play.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(play).toBeFocused();
  expect(await play.evaluate((el) => el.matches(":focus-visible")), "focus shows").toBe(true);

  const ids = await page.locator("[data-chapter]").evaluateAll((all) => all.map((b) => (b as HTMLElement).dataset.chapter));
  for (const id of ids) {
    await page.keyboard.press("Tab");
    await expect(page.locator(`[data-chapter="${id}"]`)).toBeFocused();
  }

  await page.locator('[data-chapter="loops"]').focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?chapter=loops$/);
  await expectPlayingFrom(page, Number(await page.locator('[data-chapter="loops"]').getAttribute("data-start")));
  await page.locator('[data-chapter="knowledge"]').focus();
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(/\?chapter=knowledge$/);
});

test.describe("each capability has one capture in a box that does not move", () => {
  for (const [name, setup] of [
    ["by default", async () => {}],
    ["with reduced motion and data saver", async (page: Page) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await saveData(page);
    }]
  ] as const) {
    test(name, async ({ page }) => {
      await setup(page);
      await page.route(VIDEO, (route) => route.abort());
      const videos = videoRequests(page);
      const response = await page.goto("/product", { waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBe(true);

      const sections = page.locator("[data-capability]");
      await expect(sections).toHaveCount(CAPABILITIES.length);
      expect(await sections.evaluateAll((all) => all.map((s) => s.id))).toEqual(CAPABILITIES);

      for (const id of CAPABILITIES) {
        const section = page.locator(`#${id}`);
        await expect(section.locator("[data-media]"), `${id} has one dominant media surface`).toHaveCount(1);
        await expect(section.locator("img, video, picture > source"), `${id}'s media is one still`).toHaveCount(1);
        const media = section.locator("[data-media]");
        const image = media.locator("img");
        await expect(image).toHaveAttribute("width", /^\d+$/);
        await expect(image).toHaveAttribute("height", /^\d+$/);
        expect(await media.evaluate((el) => getComputedStyle(el).aspectRatio), `${id} reserves its box`).not.toBe("auto");

        const before = await media.boundingBox();
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(async (img: HTMLImageElement) => {
          img.loading = "eager";
          await img.decode();
        });
        const after = await media.boundingBox();
        expect(after?.width, `${id}'s box keeps its width`).toBeCloseTo(before!.width, 0);
        expect(after?.height, `${id}'s box keeps its height`).toBeCloseTo(before!.height, 0);
        expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth), `${id}'s still shows`).toBeGreaterThan(0);

        await expect(section.getByRole("heading", { level: 2 })).toBeVisible();
        const docs = section.locator("a.docs-link");
        await expect(docs).toHaveAttribute("href", /^\/docs\/architecture\//);
      }
      expect(videos.filter((r) => !r.failure()).map((r) => r.url()), "no video fetched").toEqual([]);
    });
  }
});

test("every capability's docs link resolves, and each says where it goes", async ({ page }) => {
  await openPage(page, "/product");
  const hrefs = await page.locator("[data-capability] a.docs-link").evaluateAll((links) =>
    links.map((a) => (a as HTMLAnchorElement).getAttribute("href")!)
  );
  expect(hrefs).toHaveLength(CAPABILITIES.length);
  const labels = await page.locator("[data-capability] a.docs-link").allTextContents();
  expect(new Set(labels.map((l) => l.trim())).size, "no two sections end on the same link").toBe(labels.length);
  for (const href of new Set(hrefs)) {
    const response = await page.request.get(href);
    expect(response.ok(), `${href} resolves`).toBe(true);
  }
});

test("while the tour's file comes, its control says so, and focus moves to the video once it plays", async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/personalclaw-tour\.mp4$/, async (route) => {
    await held;
    await route.continue();
  });
  await openPage(page, "/product");
  const play = page.getByRole("button", { name: "Play the tour" });
  await play.focus();
  await page.keyboard.press("Enter");
  const loading = page.getByRole("button", { name: "Loading the tour…" });
  await expect(loading).toHaveAttribute("aria-disabled", "true");
  await expect(loading, "it keeps the focus it was pressed with").toBeFocused();
  await expect(loading).toHaveAttribute("aria-busy", "true");
  release();
  await expectPlayingFrom(page, 0);
  await expect(page.locator("#tour video")).toBeFocused();
});

test("the hero names no version", async ({ page }) => {
  await openPage(page, "/product");
  const hero = page.locator("#tour .tour-copy");
  await expect(hero).not.toContainText(/\bv?\d+\.\d+\.\d+\b/);
});

test("the play control keeps one line at 320 px and its edge under forced colors", async ({ browser, baseURL }) => {
  const narrow = await browser.newPage({ viewport: { width: 320, height: 640 }, baseURL });
  await openPage(narrow, "/product");
  const box = await narrow.getByRole("button", { name: "Play the tour" }).boundingBox();
  expect(box!.height, "one line").toBeLessThan(60);
  await narrow.close();

  const forced = await browser.newContext({ viewport: { width: 1440, height: 900 }, forcedColors: "active", baseURL });
  const page = await forced.newPage();
  await openPage(page, "/product");
  const border = await page
    .getByRole("button", { name: "Play the tour" })
    .evaluate((el) => getComputedStyle(el).borderTopStyle + " " + getComputedStyle(el).borderTopWidth);
  expect(border).toBe("solid 2px");
  await forced.close();
});
