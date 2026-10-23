import { expect, test } from "@playwright/test";
import { isOwnBlobAbort, monitorRuntime, openPage } from "./support";

// The runtime monitor every page spec ends on (support.ts: monitorRuntime), held to what it
// excuses. A media element that seeks drops the read of its own blob it had in flight, which
// Chromium reports as a failed request; the tour does that on a chapter choice. That, and only
// that, is not a failure. Each case below is planted, so the monitor is shown failing what it must.

test("only the page's own blob reads, cancelled, are excused", () => {
  const origin = "http://127.0.0.1:4321";
  expect(isOwnBlobAbort(`blob:${origin}/5b1f`, "net::ERR_ABORTED", origin)).toBe(true);
  expect(isOwnBlobAbort(`blob:${origin}/5b1f`, "net::ERR_FAILED", origin)).toBe(false);
  expect(isOwnBlobAbort(`${origin}/media/tour.mp4`, "net::ERR_ABORTED", origin)).toBe(false);
  expect(isOwnBlobAbort("blob:https://elsewhere.test/5b1f", "net::ERR_ABORTED", origin)).toBe(false);
  expect(isOwnBlobAbort(`blob:${origin}/5b1f`, undefined, origin)).toBe(false);
});

test("a request for a file that fails still fails the run", async ({ page, baseURL }) => {
  const runtime = monitorRuntime(page, baseURL!);
  await page.route("**/planted-missing-asset.png", (route) => route.abort("failed"));
  await openPage(page, "/");
  await page.evaluate(() => fetch("/planted-missing-asset.png").catch(() => undefined));
  await expect.poll(() => runtime.failedRequests.join("\n")).toMatch(/planted-missing-asset\.png \(net::ERR_FAILED\)/);
  expect(() => runtime.assertClean()).toThrow();
});

test("a cancelled request for a file, not a blob, still fails the run", async ({ page, baseURL }) => {
  const runtime = monitorRuntime(page, baseURL!);
  await page.route("**/planted-cancelled-asset.png", (route) => route.abort("aborted"));
  await openPage(page, "/");
  await page.evaluate(() => fetch("/planted-cancelled-asset.png").catch(() => undefined));
  await expect.poll(() => runtime.failedRequests.join("\n")).toMatch(/planted-cancelled-asset\.png \(net::ERR_ABORTED\)/);
  expect(runtime.excusedRequests, "a cancelled file request is not excused").toEqual([]);
  expect(() => runtime.assertClean()).toThrow();
});

test("the page cancelling a read of its own blob is excused, and the run stays clean", async ({ page, baseURL }) => {
  const runtime = monitorRuntime(page, baseURL!);
  await openPage(page, "/product");
  // What a seek does to the tour's blob read, planted directly: a read of a blob of this origin,
  // cancelled while in flight.
  await page.evaluate(async () => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(8 * 1024 * 1024)]));
    const controller = new AbortController();
    const read = fetch(url, { signal: controller.signal }).then((response) => response.arrayBuffer()).catch(() => undefined);
    controller.abort();
    await read;
  });
  await expect.poll(() => runtime.excusedRequests.length).toBeGreaterThan(0);
  expect(runtime.excusedRequests[0]).toMatch(/^GET blob:http:\/\/[^ ]+ \(net::ERR_ABORTED\)$/);
  runtime.assertClean();
});

test("switching the tour's chapter while it loads leaves the run clean", async ({ page, baseURL }) => {
  const runtime = monitorRuntime(page, baseURL!);
  await openPage(page, "/product");
  const chapters = page.getByRole("list", { name: "Tour chapters" }).getByRole("button");
  expect(await chapters.count(), "the tour has chapters to switch between").toBeGreaterThan(2);
  // Two choices in a row: the second seeks the video while its first read may still be in flight.
  await chapters.nth(1).click();
  await chapters.nth(2).click();
  await page.waitForTimeout(500);
  runtime.assertClean();
});
