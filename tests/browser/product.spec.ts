import { expect, test, type Page, type Request } from "@playwright/test";
import { monitorRuntime, openPage, settlePage } from "./support";

// /product (#90): the tour first, a still per chapter with the chapter kept in the URL, then
// one section per capability, each with one dominant capture in a box that does not move.
//
// The recorded tour came off the page at the 0.2.6 re-pin (src/data/tour.mjs), so the page plays
// no video at all: every request it makes is recorded, and one for a video file fails the test.
// Data saver has no Playwright emulation, so it is stubbed as
// `navigator.connection.saveData = true` before the page's scripts run.

const CAPABILITIES = ["chat", "loops", "memory", "knowledge", "automation", "agents"];
const CHAPTERS = ["home", "chat", "approval", "loops", "knowledge"];
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

/** The one still the tour shows, by its chapter id, after the image has decoded. */
async function expectStill(page: Page, id: string) {
  const shown = page.locator("#tour [data-still]:not([hidden])");
  await expect(shown).toHaveCount(1);
  await expect(shown).toHaveAttribute("data-still", id);
  const image = shown.locator("img");
  await expect(image).toHaveAttribute("alt", /.{40,}/);
  await image.evaluate((img: HTMLImageElement) => img.decode());
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth), `${id}'s still shows`).toBeGreaterThan(0);
}

test.describe("the tour shows one still per chapter and plays no video", () => {
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
      await expect(page.locator("#tour video")).toHaveCount(0);
      await expect(page.locator("#tour [data-still]")).toHaveCount(CHAPTERS.length);
      await expectStill(page, "home");
      await openPage(page, "/product?chapter=knowledge#tour");
      await expect(chapter(page, "Knowledge, tagged and searchable")).toHaveAttribute("aria-pressed", "true");
      await expectStill(page, "knowledge");
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await settlePage(page);
      expect(videos.map((r) => r.url()), "a video was requested").toEqual([]);
      runtime.assertClean();
    });
  }
});

test("the chosen chapter is in the URL and comes back on reload, back and forward", async ({
  page,
  baseURL
}) => {
  const runtime = monitorRuntime(page, baseURL!);
  await openPage(page, "/product");
  const loops = chapter(page, "A goal loop and its report");
  const home = chapter(page, "Home, and what waits on you");
  await expect(home).toHaveAttribute("aria-pressed", "true");

  await loops.click();
  await expect(loops).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\/product\?chapter=loops$/);
  await expectStill(page, "loops");

  await page.reload();
  await expect(loops).toHaveAttribute("aria-pressed", "true");
  await expectStill(page, "loops");

  await openPage(page, "/apps");
  await page.goBack();
  await expect(page).toHaveURL(/\/product\?chapter=loops$/);
  await expect(loops).toHaveAttribute("aria-pressed", "true");

  await page.goForward();
  await expect(page).toHaveURL(/\/apps$/);
  await page.goBack();
  await expect(loops).toHaveAttribute("aria-pressed", "true");
  await expect(home).toHaveAttribute("aria-pressed", "false");
  await expectStill(page, "loops");

  await home.click();
  await expect(page).toHaveURL(/\/product$/);
  await expectStill(page, "home");
  runtime.assertClean();
});

test("a chapter choice adds no history entry", async ({ page, baseURL }) => {
  const runtime = monitorRuntime(page, baseURL!);
  await openPage(page, "/");
  await openPage(page, "/product");
  await chapter(page, "A chat stopped at its approval").click();
  const approval = chapter(page, "Every approval in one inbox");
  await approval.click();
  await expect(page).toHaveURL(/\?chapter=approval$/);
  await expect(approval).toHaveAttribute("aria-controls", "tour-approval");

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/product\?chapter=approval$/);
  await expect(approval).toHaveAttribute("aria-pressed", "true");
  await expectStill(page, "approval");
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
