import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { registryAppRoutePaths } from "../support/site-contract.mjs";
import { withProbeBuild } from "../../scripts/registry-probe.mjs";
import { assertLayoutIntegrity, openPage } from "./support";

// The install-safety sheets (/registry/<name>, #112).
//
// 1. Every sheet the pinned data yields answers 200 with the app's name as its h1, and there is
//    at least one: a contract over zero sheets passes on a site that publishes none.
// 2. The selected evidence panel lives in the URL (?panel=), by click and by keyboard, and
//    survives a reload, back then forward, and the same URL in a new browser context.
// 3. One sheet per state, from a probe build against the fixtures (scripts/registry-probe.mjs),
//    since the pinned data has no community listing and no incompatible app: at each width
//    nothing scrolls sideways or clips, nor at 200% text on 320 px; under forced colors the state
//    and verdict stay text and focus stays visible; and Tab reaches every control in order.

const WIDTHS = [320, 390, 412, 768, 1024, 1440];

test("every sheet the pinned data yields answers with the app's name as its h1", async ({ page }) => {
  const paths = await registryAppRoutePaths();
  expect(paths.length, "the pinned data yields no sheet at all").toBeGreaterThan(0);
  for (const path of paths) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("h1"), path).toHaveText(path.split("/").at(-1)!);
  }
});

async function panelShown(page: Page, id: string) {
  await expect(page.getByRole("tab", { name: label[id] })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`#evidence-${id}`)).toBeVisible();
  for (const other of Object.keys(label).filter((panel) => panel !== id)) {
    await expect(page.locator(`#evidence-${other}`)).toBeHidden();
  }
}

const label: Record<string, string> = { manifest: "Manifest", scan: "Scan record", claims: "Claims and evidence" };

test("the selected evidence panel is in the URL, and a reload, history and a copied link keep it", async ({ page, browser, baseURL }) => {
  await openPage(page, "/registry/skills-sh");
  await panelShown(page, "manifest");

  await page.getByRole("tab", { name: "Scan record" }).click();
  await expect(page).toHaveURL(/[?&]panel=scan\b/);
  await panelShown(page, "scan");

  await page.getByRole("tab", { name: "Scan record" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Claims and evidence" })).toBeFocused();
  await expect(page).toHaveURL(/[?&]panel=claims\b/);
  await panelShown(page, "claims");

  await page.reload();
  await panelShown(page, "claims");

  await page.goto("/registry");
  await page.goBack();
  await panelShown(page, "claims");
  await page.goForward();
  await page.goBack();
  await panelShown(page, "claims");

  const copied = page.url();
  const fresh = await browser.newContext({ baseURL });
  const other = await fresh.newPage();
  await other.goto(copied);
  await panelShown(other, "claims");
  await fresh.close();

  // An unknown panel opens the first.
  await page.goto("/registry/skills-sh?panel=nonsense");
  await panelShown(page, "manifest");
});

// The maintainer's decision on #112: the sheet keeps no reviewed state, because a static page
// cannot hold consent. So after every control on it is used, nothing remembers the reader but the
// URL, and the URL names only the app and the panel.
test("after every control on a sheet is used, storage, cookies and the URL hold only the app and the panel", async ({ page, context }) => {
  await openPage(page, "/registry/skills-sh");
  for (const name of ["Scan record", "Claims and evidence", "Manifest", "Claims and evidence"]) {
    await page.getByRole("tab", { name }).click();
  }
  await page.getByRole("tab", { name: "Claims and evidence" }).focus();
  for (const key of ["ArrowLeft", "End", "Home", "ArrowRight"]) await page.keyboard.press(key);
  const held = await page.evaluate(() => ({
    local: Object.keys(window.localStorage),
    session: Object.keys(window.sessionStorage),
    cookie: document.cookie
  }));
  expect(held).toEqual({ local: [], session: [], cookie: "" });
  expect(await context.cookies()).toEqual([]);
  const url = new URL(page.url());
  expect(url.pathname).toBe("/registry/skills-sh");
  expect([...url.searchParams.keys()]).toEqual(["panel"]);
  expect(url.hash).toBe("");
});

test.describe("one sheet per state, from a fixture build", () => {
  test.describe.configure({ mode: "serial" });

  const outDir = join(process.cwd(), ".registry-sheet-probe");
  let server: Server;
  let origin = "";

  const states = {
    "community, not endorsed": "registry-fixture-clean",
    "community, no scan on record": "registry-fixture-unscanned",
    "unsafe": "registry-fixture-dangerous",
    "first-party, compatible": "fixture-has-its-features",
    "incompatible": "fixture-needs-a-feature"
  };

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    withProbeBuild("listed", outDir, () => undefined);
    const types: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css",
      ".js": "text/javascript",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".webp": "image/webp",
      ".woff2": "font/woff2",
      ".json": "application/json",
      ".xml": "application/xml",
      ".txt": "text/plain"
    };
    server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://probe.localhost");
      let file = normalize(join(outDir, decodeURIComponent(url.pathname)));
      if (!file.startsWith(outDir)) {
        response.writeHead(403).end();
        return;
      }
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
      if (!existsSync(file)) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
      response.end(readFileSync(file));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });

  test.afterAll(async () => {
    await new Promise((resolve) => server?.close(resolve));
    rmSync(outDir, { recursive: true, force: true });
  });

  for (const [state, name] of Object.entries(states)) {
    test(`${state}: no width scrolls sideways or clips, nor 200% text on 320 px`, async ({ page }) => {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${origin}/registry/${name}`, { waitUntil: "networkidle" });
        await expect(page.locator("h1")).toHaveText(name);
        await assertLayoutIntegrity(page);
      }
      await page.setViewportSize({ width: 320, height: 900 });
      await page.goto(`${origin}/registry/${name}`, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${name} at 200% text on 320 px`).toBeLessThanOrEqual(1);
    });

    test(`${state}: under forced colors the state and verdict stay text, and focus stays visible`, async ({ browser }) => {
      const context = await browser.newContext({ forcedColors: "active" });
      const page = await context.newPage();
      await page.goto(`${origin}/registry/${name}`, { waitUntil: "networkidle" });
      const decision = page.locator("[data-decision]");
      await expect(decision.locator(".registry-verdict")).not.toHaveText("");
      if (name.startsWith("registry-")) await expect(decision.locator(".registry-not-endorsed")).toHaveText("Community-listed, not endorsed");
      else await expect(decision.locator("[data-state-label]")).not.toHaveText("");
      await page.keyboard.press("Tab");
      const ring = await page.evaluate(() => {
        const style = getComputedStyle(document.activeElement as Element);
        return style.outlineStyle !== "none" && style.outlineWidth !== "0px";
      });
      expect(ring, "focus is visible under forced colors").toBe(true);
      await context.close();
    });

    test(`${state}: Tab reaches every control, in document order`, async ({ page }) => {
      await page.goto(`${origin}/registry/${name}`, { waitUntil: "networkidle" });
      const controls = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("main a[href], main button, main [tabindex='0']")]
          .filter((element) => element.offsetParent !== null && (element.getAttribute("role") !== "tab" || element.getAttribute("aria-selected") === "true"))
          .map((element) => element.outerHTML.slice(0, 80))
      );
      const reached: string[] = [];
      for (let index = 0; index < controls.length + 20 && reached.length < controls.length; index += 1) {
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null;
          return element && element.closest("main") ? element.outerHTML.slice(0, 80) : null;
        });
        if (focused && reached.at(-1) !== focused) reached.push(focused);
      }
      expect(reached, `${name}: the Tab order`).toEqual(controls);
    });
  }

  test("a blocked sheet has no enable steps and says why; its control has them", async ({ page }) => {
    for (const [name, blocked] of [
      ["registry-fixture-dangerous", true],
      ["registry-fixture-clean", false],
      ["fixture-needs-a-feature", true],
      ["fixture-has-its-features", false]
    ] as const) {
      await page.goto(`${origin}/registry/${name}`, { waitUntil: "networkidle" });
      await expect(page.locator("[data-enable-steps]"), name).toHaveCount(blocked ? 0 : 1);
      await expect(page.locator("[data-no-enable]"), name).toHaveCount(blocked ? 1 : 0);
    }
  });
});
