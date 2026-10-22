import { expect, test, type Page, type Request } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loopVideoMarkup } from "../../src/components/loop-video.mjs";
import { monitorRuntime } from "./support";

// The loop player (#94): src/components/loop-video.mjs, the one module every loop on the site
// plays through (src/components/LoopVideo.astro). No page places a loop yet (#95 waits on the
// renders), so this spec serves a page of its own on the site's origin: two loops, one waiting
// for its play control and one allowed an idle hint, the module's own markup and script, and a
// small VP9 clip the test browser can decode (tests/fixtures/loop-fixture.webm). The tour's
// poster stands in as each loop's poster.
//
// Data saver has no Playwright emulation, so it is stubbed as `navigator.connection.saveData`.

const ROOT = process.cwd();
const FIXTURE = "/__loop-video-fixture";
const CLIP = "/media/loop-fixture.webm";
const IDLE_CLIP = "/media/loop-fixture-idle.webm";
const POSTER = "/media/personalclaw-tour-poster.webp";

function fixturePage(): string {
  const loop = (src: string, label: string, autoplay: string) =>
    loopVideoMarkup({
      src,
      poster: POSTER,
      width: 160,
      height: 100,
      label,
      autoplay,
      fallback: "The still frame, and the text beside it."
    });
  const module = readFileSync(join(ROOT, "src/components/loop-video.mjs"), "utf8");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Loop fixture</title>
<style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.loop-video{position:relative;width:480px;margin:0}.loop-video video{display:block;width:100%;height:100%}
.loop-toggle{position:absolute;right:8px;bottom:8px;min-width:44px;min-height:44px}.spacer{height:3000px}</style>
</head><body><main>
<section id="waits">${loop(CLIP, "A loop that waits for its play control", "none")}</section>
<div class="spacer"></div>
<section id="idles">${loop(IDLE_CLIP, "A loop allowed an idle hint", "idle-hint")}</section>
</main><script type="module">${module}\nmountLoopVideos();</script></body></html>`;
}

async function serve(page: Page, options: { failClip?: boolean } = {}) {
  const clip = readFileSync(join(ROOT, "tests/fixtures/loop-fixture.webm"));
  await page.route(`**${FIXTURE}`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: fixturePage() })
  );
  await page.route(/\/media\/loop-fixture(-idle)?\.webm$/, (route) =>
    options.failClip
      ? route.fulfill({ status: 404, contentType: "text/plain", body: "gone" })
      : route.fulfill({ status: 200, contentType: "video/webm", body: clip })
  );
}

function mediaRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on("request", (request) => {
    if (/\.(webm|mp4)(\?|$)/.test(new URL(request.url()).pathname) || request.resourceType() === "media") {
      seen.push(request);
    }
  });
  return seen;
}

const waits = (page: Page) => page.locator("#waits [data-loop-video]");
const idles = (page: Page) => page.locator("#idles [data-loop-video]");
const playing = (figure: ReturnType<typeof waits>) =>
  figure.locator("video").evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0);

async function saveData(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true, addEventListener() {}, removeEventListener() {} }
    });
  });
}

async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((isHidden) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (isHidden ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

test.describe("a loop", () => {
  // The player's rules do not depend on the viewport, and the reduced-motion case emulates its
  // own media: the desktop run holds them all.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "held by the desktop run");
  });

  test("renders as its poster, muted, inline and looping, with its box, and no source", async ({ page }) => {
    await serve(page);
    await page.goto(FIXTURE);
    for (const figure of [waits(page), idles(page)]) {
      const video = figure.locator("video");
      for (const attribute of ["muted", "playsinline", "loop"]) await expect(video).toHaveAttribute(attribute, "");
      await expect(video).toHaveAttribute("poster", POSTER);
      await expect(video).toHaveAttribute("width", "160");
      await expect(video).toHaveAttribute("height", "100");
    }
    // The HTML carries no source; one is attached only on play, or on an allowed idle hint.
    expect(fixturePage()).not.toContain("<source");
    await expect(waits(page).locator("video source")).toHaveCount(0);
  });

  test("asks for no byte before its play control, and plays and pauses from it", async ({ page, baseURL }) => {
    const runtime = monitorRuntime(page, baseURL!);
    const media = mediaRequests(page);
    await serve(page);
    await page.goto(FIXTURE);
    await page.waitForTimeout(400);
    expect(media.filter((r) => r.url().endsWith(CLIP)).map((r) => r.url()), "no byte before play").toEqual([]);

    const play = waits(page).getByRole("button", { name: /^Play/ });
    await play.click();
    await expect(waits(page).getByRole("button", { name: /^Pause/ })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => playing(waits(page))).toBe(true);
    expect(media.some((r) => r.url().endsWith(CLIP))).toBe(true);

    await waits(page).getByRole("button", { name: /^Pause/ }).click();
    await expect(waits(page).locator("video")).toHaveJSProperty("paused", true);
    await expect(waits(page).getByRole("button", { name: /^Play/ })).toHaveAttribute("aria-pressed", "false");
    runtime.assertClean();
  });

  test("pauses scrolled away and while the page is hidden, and comes back with both", async ({ page, baseURL }) => {
    const runtime = monitorRuntime(page, baseURL!);
    await serve(page);
    await page.goto(FIXTURE);
    await waits(page).getByRole("button", { name: /^Play/ }).click();
    await expect.poll(() => playing(waits(page))).toBe(true);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(waits(page).locator("video")).toHaveJSProperty("paused", true);
    await expect(waits(page)).toHaveAttribute("data-state", "held");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => playing(waits(page))).toBe(true);

    await setHidden(page, true);
    await expect(waits(page).locator("video")).toHaveJSProperty("paused", true);
    await setHidden(page, false);
    await expect(waits(page).locator("video")).toHaveJSProperty("paused", false);
    runtime.assertClean();
  });

  test("an idle hint starts only the loop allowed one, and only once it is in view", async ({ page, baseURL }) => {
    const runtime = monitorRuntime(page, baseURL!);
    const media = mediaRequests(page);
    await serve(page);
    await page.goto(FIXTURE);
    await page.waitForTimeout(400);
    expect(media.map((r) => new URL(r.url()).pathname), "nothing offscreen loads").toEqual([]);
    await expect(idles(page)).toHaveAttribute("data-state", "held");

    await idles(page).scrollIntoViewIfNeeded();
    await expect.poll(() => playing(idles(page))).toBe(true);
    expect(media.map((r) => new URL(r.url()).pathname)).toEqual([IDLE_CLIP]);
    expect(await waits(page).locator("video").evaluate((v: HTMLVideoElement) => v.querySelector("source"))).toBeNull();
    runtime.assertClean();
  });

  for (const [name, setup] of [
    ["under reduced motion", (page: Page) => page.emulateMedia({ reducedMotion: "reduce" })],
    ["under data saver", saveData]
  ] as const) {
    test(`${name}, shows only its poster, with no control and no request`, async ({ page, baseURL }) => {
      await setup(page);
      const runtime = monitorRuntime(page, baseURL!);
      const media = mediaRequests(page);
      await serve(page);
      await page.goto(FIXTURE);
      for (const figure of [waits(page), idles(page)]) {
        await figure.scrollIntoViewIfNeeded();
        await expect(figure).toHaveAttribute("data-state", "still");
        await expect(figure.getByRole("button")).toHaveCount(0);
        await expect(figure.locator("video")).toHaveAttribute("poster", POSTER);
      }
      await page.waitForTimeout(400);
      expect(media.map((r) => r.url()), "no media request at all").toEqual([]);
      runtime.assertClean();
    });
  }

  test("that fails keeps its poster and says it could not play", async ({ page }) => {
    await serve(page, { failClip: true });
    await page.goto(FIXTURE);
    await waits(page).getByRole("button", { name: /^Play/ }).click();
    await expect(waits(page)).toHaveAttribute("data-state", "failed");
    await expect(waits(page).getByText("The still frame, and the text beside it.")).toBeVisible();
    await expect(waits(page).locator("video")).toHaveAttribute("poster", POSTER);
    await expect(waits(page).getByRole("button")).toHaveCount(0);
  });
});
