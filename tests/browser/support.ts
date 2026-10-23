import { expect, type Locator, type Page } from "@playwright/test";

export async function openPage(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "networkidle" });
  expect(response, `${path} should return a response`).not.toBeNull();
  expect(response?.ok(), `${path} should return a successful status`).toBe(true);
  await settlePage(page);
}

export async function settlePage(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images];
    for (const image of images) image.loading = "eager";
    await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
  });
  await page.waitForTimeout(50);
}

export async function settleSystemWindow(page: Page) {
  await page.locator(".system-window").evaluate(async (element) => {
    // Decode the freshly mounted panel image (React remounts it per tab via
    // `key`), so the frame is painted before the shot. A tab that plays a loop
    // (#95) shows its still, and the hidden tabs' stills are skipped.
    const image = [...element.querySelectorAll("img")].find((img) => img.offsetParent !== null);
    if (image) {
      image.loading = "eager";
      await image.decode().catch(() => undefined);
    }

    // Let every FINITE animation/transition in the subtree finish. The ::after
    // activity trace is infinite — its `finished` promise never fulfils; the
    // screenshot's `animations: "disabled"` rewinds it deterministically instead.
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => {
        const timing = animation.effect?.getTiming();
        return timing?.iterations === Infinity
          ? Promise.resolve()
          : animation.finished.catch(() => undefined);
      })
    );

    // Frame the tab strip identically on every run: on mobile it overflows and
    // scrolls (`overflow-x: auto`), and a click-focus-driven scroll offset must
    // not leak into the shot.
    const tabs = element.querySelector(".system-tabs");
    if (tabs) tabs.scrollLeft = 0;

    // Hold until layout is identical across two consecutive frames.
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const snapshot = () => {
      const rect = element.getBoundingClientRect();
      const strip = tabs?.getBoundingClientRect();
      return [
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        strip?.x,
        strip?.width,
        tabs?.scrollLeft ?? 0
      ].join();
    };
    let previous = "";
    let current = snapshot();
    let spins = 0;
    while (previous !== current && spins < 120) {
      previous = current;
      await nextFrame();
      current = snapshot();
      spins += 1;
    }
  });
}

/**
 * Whether a failed request is the page's own media cancelling a read of its own blob, which is
 * not a failed request. The tour plays from a blob URL (src/pages/product.astro), and a seek, such
 * as a chapter choice, makes the video drop the read it had in flight: Chromium reports that
 * as `GET blob:<this origin>/… (net::ERR_ABORTED)`. Only that exact pair is excused. An aborted
 * request for anything else, or a blob of another origin, still fails the run.
 */
export function isOwnBlobAbort(url: string, errorText: string | undefined, expectedOrigin: string): boolean {
  return errorText === "net::ERR_ABORTED" && url.startsWith(`blob:${expectedOrigin}/`);
}

export function monitorRuntime(page: Page, baseURL: string) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const excusedRequests: string[] = [];
  const thirdPartyRequests: string[] = [];
  const expectedOrigin = new URL(baseURL).origin;

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText;
    const line = `${request.method()} ${request.url()} (${errorText ?? "unknown"})`;
    (isOwnBlobAbort(request.url(), errorText, expectedOrigin) ? excusedRequests : failedRequests).push(line);
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["http:", "https:"].includes(url.protocol) && url.origin !== expectedOrigin) {
      thirdPartyRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  return {
    /** The requests that failed, which assertClean fails on. */
    failedRequests,
    /** The blob reads the page's own media cancelled, which assertClean does not count. */
    excusedRequests,
    assertClean() {
      expect(consoleErrors, "browser console errors").toEqual([]);
      expect(pageErrors, "uncaught page errors").toEqual([]);
      expect(failedRequests, "failed network requests").toEqual([]);
      expect(thirdPartyRequests, "third-party or tracker requests").toEqual([]);
    }
  };
}

export async function assertImageIntegrity(page: Page) {
  const issues = await page.locator("img").evaluateAll((images) =>
    (images as HTMLImageElement[]).flatMap((image) => {
      const failures: string[] = [];
      const label = image.alt || image.currentSrc || image.src;
      if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
        failures.push(`broken image: ${label}`);
      }
      if (!image.hasAttribute("width") || !image.hasAttribute("height")) {
        failures.push(`unstable image dimensions: ${label}`);
      }
      return failures;
    })
  );
  expect(issues).toEqual([]);
}

export async function assertLayoutIntegrity(page: Page) {
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const smallTargets = [...document.querySelectorAll<HTMLElement>("a, button, input")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          !element.closest("[inert], [aria-hidden='true']") &&
          rect.width > 0 &&
          rect.height > 0 &&
          (rect.width < 43.5 || rect.height < 43.5)
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const name =
          element.getAttribute("aria-label") ??
          element.textContent?.trim().replace(/\s+/g, " ").slice(0, 48) ??
          "";
        return `${element.tagName.toLowerCase()} "${name}" ${Math.round(rect.width)}x${Math.round(rect.height)}`;
      });

    return {
      horizontalOverflow: root.scrollWidth - root.clientWidth,
      smallTargets
    };
  });

  expect(layout.horizontalOverflow, "horizontal page overflow").toBeLessThanOrEqual(1);
  expect(layout.smallTargets, "interactive targets smaller than 44px").toEqual([]);
}

export async function tabTo(page: Page, target: Locator, maximumTabs = 30) {
  for (let index = 0; index < maximumTabs; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => document.activeElement === element)) return;
  }
  throw new Error(`Could not reach ${await target.getAttribute("aria-label") ?? await target.textContent()} by keyboard`);
}

export async function assertReducedMotion(page: Page) {
  const state = await page.evaluate(() => {
    const toMilliseconds = (duration: string) =>
      Math.max(
        ...duration.split(",").map((part) => {
          const value = Number.parseFloat(part);
          return part.trim().endsWith("ms") ? value : value * 1000;
        })
      );

    const animated = [...document.querySelectorAll<HTMLElement>("*")]
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          element: element.tagName.toLowerCase(),
          animation: toMilliseconds(style.animationDuration),
          transition: toMilliseconds(style.transitionDuration)
        };
      })
      .filter((item) => item.animation > 0.1 || item.transition > 0.1);

    const systemWindow = document.querySelector(".system-window");
    const pseudoAnimation = systemWindow
      ? toMilliseconds(getComputedStyle(systemWindow, "::after").animationDuration)
      : 0;

    return {
      mediaMatches: matchMedia("(prefers-reduced-motion: reduce)").matches,
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      animated,
      pseudoAnimation
    };
  });

  expect(state.mediaMatches).toBe(true);
  expect(state.scrollBehavior).toBe("auto");
  expect(state.animated).toEqual([]);
  expect(state.pseudoAnimation).toBeLessThanOrEqual(0.1);
}
