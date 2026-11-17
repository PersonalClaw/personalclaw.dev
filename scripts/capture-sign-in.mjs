// How a capture signs its browser in to the gateway: the link `personalclaw token` prints is opened
// as a page, the way a person opens it (scripts/capture-app-shots.mjs, capture-clip.mjs,
// capture-action-clip.mjs, capture-tour.mjs).
//
// From core v0.3.9 a fetch of `/?token=…` is not a sign-in. It sets the gateway's cookie, but the
// dashboard keeps its pairing in the page's own storage, which only a page load of the link writes,
// and a page opened with the cookie alone says "You're signed out". So the link is opened in a
// context of its own, which records nothing, and what that page stored (its cookies and its storage)
// is handed to the context a capture records in, as Playwright's storageState.
//
// Nothing here prints an error Playwright raised: its call log carries the URL, and the URL carries
// the token.

/** What the dashboard says when this browser is not signed in. */
export const SIGNED_OUT = /You.re signed out/;

/**
 * The storage state of a browser signed in to the gateway at *base* with *token*, or the reason it
 * could not be signed in, in words that never hold the token.
 *
 * @param {import("playwright").Browser} browser
 * @param {string} base
 * @param {string} token
 * @returns {Promise<{ state?: Awaited<ReturnType<import("playwright").BrowserContext["storageState"]>>, error?: string }>}
 */
export async function signedInState(browser, base, token) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const answer = await page
      .goto(`${base}/?token=${encodeURIComponent(token)}`, { waitUntil: "domcontentloaded", timeout: 60000 })
      .catch(() => null);
    if (!answer) return { error: `Could not reach the gateway at ${base} to sign this browser in.` };
    if (!answer.ok()) return { error: `The gateway at ${base} did not sign this browser in: HTTP ${answer.status()}` };
    // The dashboard takes the token out of the address once it has stored its pairing.
    await page.waitForURL((url) => !url.search.includes("token="), { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const text = await page.locator("body").innerText().catch(() => "");
    if (SIGNED_OUT.test(text)) {
      return { error: `The gateway at ${base} did not sign this browser in: the page says it is signed out.` };
    }
    return { state: await context.storageState() };
  } finally {
    await context.close();
  }
}
