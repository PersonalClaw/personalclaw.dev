import { expect, test, type Page, type Request } from "@playwright/test";
import { monitorRuntime, openPage, settlePage } from "./support";

// /product (#90): the tour first, poster-first, with its chapter kept in the URL, then one
// section per capability, each with one dominant capture in a box that does not move.
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
    if (VIDEO.test(new URL(request.url()).pathname) || request.resourceType() === "media") {
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
  baseURL
}) => {
  const runtime = monitorRuntime(page, baseURL!);
  const videos = videoRequests(page);
  await openPage(page, "/product");
  const loops = chapter(page, "A goal loop and its findings");
  await expect(chapter(page, "The gateway's own dashboard")).toHaveAttribute("aria-pressed", "true");

  await loops.click();
  await expect(loops).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\/product\?chapter=loops$/);

  await page.reload();
  await expect(loops).toHaveAttribute("aria-pressed", "true");

  await openPage(page, "/apps");
  await page.goBack();
  await expect(page).toHaveURL(/\/product\?chapter=loops$/);
  await expect(loops).toHaveAttribute("aria-pressed", "true");

  await page.goForward();
  await expect(page).toHaveURL(/\/apps$/);
  await page.goBack();
  await expect(loops).toHaveAttribute("aria-pressed", "true");
  await expect(chapter(page, "The gateway's own dashboard")).toHaveAttribute("aria-pressed", "false");

  expect(videos.map((r) => r.url()), "video requested before play").toEqual([]);
  runtime.assertClean();
});

test("a chapter choice adds no history entry, and the first play starts at it", async ({
  page,
  baseURL
}) => {
  const runtime = monitorRuntime(page, baseURL!);
  await openPage(page, "/");
  await openPage(page, "/product");
  await chapter(page, "Chat with a model on this machine").click();
  const approval = chapter(page, "The approval it stops on");
  await approval.click();
  await expect(page).toHaveURL(/\?chapter=approval$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/product\?chapter=approval$/);
  await expect(approval).toHaveAttribute("aria-pressed", "true");

  // The seek waits for the first explicit play. Playing the file itself is not measured here
  // (the test browser has no H.264 decoder); the page's play handler is, through the event a
  // press of the video's own play control dispatches.
  const start = Number(await approval.getAttribute("data-start"));
  expect(start).toBeGreaterThan(0);
  const video = page.locator("#tour video");
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(0);
  await video.evaluate((v: HTMLVideoElement) => v.dispatchEvent(new Event("play")));
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(start);
  runtime.assertClean();
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

test("every capability's docs link resolves", async ({ page }) => {
  await openPage(page, "/product");
  const hrefs = await page.locator("[data-capability] a.docs-link").evaluateAll((links) =>
    links.map((a) => (a as HTMLAnchorElement).getAttribute("href")!)
  );
  expect(hrefs).toHaveLength(CAPABILITIES.length);
  for (const href of new Set(hrefs)) {
    const response = await page.request.get(href);
    expect(response.ok(), `${href} resolves`).toBe(true);
  }
});
