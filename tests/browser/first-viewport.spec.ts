import { expect, test, type Locator, type Page } from "@playwright/test";
import { openPage } from "./support";

// Home's first viewport, direction A (#87, DESIGN.md "Home's first viewport", and section 5.2 of
// SITE-REDESIGN.md): before anything is scrolled, the proposition, a real System Window capture
// and the install action are all on screen together, and the window crosses from the coral field
// into the dark theater. A coral field that fills the first screen on its own, a brand preamble
// in front of the product proof, fails here. The two sizes are the ones DESIGN.md names.
const FIRST_VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 }
];

/** Below this width the System Window's caption moves under the capture instead of over it. */
const PHONE_CAPTION_BELOW = 640;

/** How much of the window's real capture must be on screen, of its height. */
const CAPTURE_SHOWN = 0.5;

type Box = { top: number; bottom: number; left: number; right: number; height: number };

const box = (locator: Locator): Promise<Box> =>
  locator.evaluate((element) => {
    const { top, bottom, left, right, height } = element.getBoundingClientRect();
    return { top, bottom, left, right, height };
  });

function expectOnScreen(found: Box, name: string, page: Page) {
  const { width, height } = page.viewportSize()!;
  expect(found.top, `${name} starts below the top of the screen`).toBeGreaterThanOrEqual(0);
  expect(found.left, `${name} starts inside the left edge`).toBeGreaterThanOrEqual(0);
  expect(found.bottom, `${name} ends inside the first ${height} px`).toBeLessThanOrEqual(height);
  expect(found.right, `${name} ends inside the right edge`).toBeLessThanOrEqual(width);
}

for (const size of FIRST_VIEWPORTS) {
  test(`home's first viewport holds the proposition, the System Window and the install action at ${size.width}x${size.height}`, async ({
    page
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the test sets its own viewport");
    await page.setViewportSize({ width: size.width, height: size.height });
    await openPage(page, "/");
    expect(await page.evaluate(() => window.scrollY), "nothing is scrolled").toBe(0);

    const hero = page.locator(".home-hero");
    const field = hero.locator(".hero-field");
    expect(await field.count(), "Home opens on a coral field").toBe(1);

    // The proposition: the name, its line and its sentence, in dark ink on coral.
    for (const part of ["h1", ".hero-line", ".hero-support"]) {
      expectOnScreen(await box(field.locator(part)), `the proposition's ${part}`, page);
    }
    const colours = await field.evaluate((element) => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement("span");
      document.body.append(probe);
      const resolve = (token: string) => {
        probe.style.color = root.getPropertyValue(token).trim();
        return getComputedStyle(probe).color;
      };
      const tokens = { coral: resolve("--coral"), coralInk: resolve("--coral-ink") };
      probe.remove();
      return {
        ...tokens,
        field: getComputedStyle(element).backgroundColor,
        heading: getComputedStyle(element.querySelector("h1")!).color
      };
    });
    expect(colours.field, "the field is coral").toBe(colours.coral);
    expect(colours.heading, "the name is dark ink on the coral").toBe(colours.coralInk);

    // The install action, the hero's one primary button.
    const action = hero.locator(".button-primary");
    expect(await action.count(), "the hero has one primary action").toBe(1);
    expectOnScreen(await box(action), "the install action", page);

    // A real capture in the System Window, most of it on screen.
    const systemWindow = hero.locator(".system-window");
    const capture = systemWindow.locator("img.system-image.is-active");
    expect(await capture.count(), "the System Window shows one capture").toBe(1);
    expect(
      await capture.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      "the capture is a loaded image"
    ).toBe(true);
    const shot = await box(capture);
    const shown = Math.min(shot.bottom, size.height) - Math.max(shot.top, 0);
    expect(shown / shot.height, `at least ${CAPTURE_SHOWN * 100}% of the capture is on screen`).toBeGreaterThanOrEqual(
      CAPTURE_SHOWN
    );
    const frame = await box(systemWindow);
    expect(frame.left, "the window starts inside the left edge").toBeGreaterThanOrEqual(0);
    expect(frame.right, "the window ends inside the right edge").toBeLessThanOrEqual(size.width);

    // The window crosses the coral field's lower edge, and the crossing is on screen.
    const coral = await box(field);
    expect(coral.bottom, "the coral field ends inside the first viewport").toBeLessThan(size.height);
    expect(frame.top, "the window starts on the coral field").toBeLessThan(coral.bottom);
    expect(frame.bottom, "the window reaches past the coral into the dark theater").toBeGreaterThan(coral.bottom);

    // Every view's tab is whole on screen: none is clipped at the strip's edge.
    const strip = await box(systemWindow.locator(".system-tabs"));
    const tabs = systemWindow.getByRole("tab");
    for (let index = 0; index < (await tabs.count()); index += 1) {
      const tab = await box(tabs.nth(index));
      const label = await tabs.nth(index).textContent();
      expect(tab.left, `the ${label} tab starts inside the strip`).toBeGreaterThanOrEqual(strip.left - 0.5);
      expect(tab.right, `the ${label} tab ends inside the strip`).toBeLessThanOrEqual(strip.right + 0.5);
    }

    // On a phone the caption sits under the capture, so the product itself stays in view.
    if (size.width < PHONE_CAPTION_BELOW) {
      const caption = await box(systemWindow.locator(".system-caption"));
      expect(caption.top, "the caption starts below the capture").toBeGreaterThanOrEqual(shot.bottom - 0.5);
    }

    // What follows on the theater starts beside or below the window's overhang, never under it.
    const next = await box(page.locator("#trust-title"));
    const textRight = await page.locator("#trust-title").evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return Math.max(...[...range.getClientRects()].map((rect) => rect.right));
    });
    const covered = next.top < frame.bottom && textRight > frame.left;
    expect(covered, "the next chapter's heading is not under the window").toBe(false);
  });
}
