import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { monitorRuntime, openPage, settlePage } from "./support";

const security = JSON.parse(readFileSync(new URL("../../src/data/security.json", import.meta.url), "utf8"));

// /security draws the boundary two ways, Authority and Network, switched like the System Window's
// tabs: by pointer, or by the arrow keys, Home and End, with the view kept in the URL (`?view=`).
// One table reads both: a row for each boundary, with its responsibility, how it is enforced, the
// code that is its evidence and its known limit. The known limits come before the controls.

const columns = ["Boundary", "Responsibility", "Enforcement", "Evidence", "Known limit"];

test("the boundary's two views switch from the keyboard, and the URL keeps the one shown", async ({ page, baseURL }) => {
  const runtime = monitorRuntime(page, baseURL!);
  await openPage(page, "/security");

  const authority = page.getByRole("tab", { name: "Authority" });
  const network = page.getByRole("tab", { name: "Network" });
  await expect(authority).toHaveAttribute("aria-selected", "true");
  const map = page.getByRole("tabpanel");
  await expect(map).toHaveAccessibleName("Authority");
  await expect(map.getByText("The host gate", { exact: true })).toBeVisible();

  await authority.focus();
  await page.keyboard.press("ArrowRight");
  await expect(network).toBeFocused();
  await expect(network).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName("Network");
  await expect(page.getByRole("tabpanel").getByText("The egress guard", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/[?&]view=network\b/);

  await page.keyboard.press("Home");
  await expect(authority).toBeFocused();
  await expect(authority).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(network).toHaveAttribute("aria-selected", "true");

  await page.reload();
  await expect(page.getByRole("tab", { name: "Network" })).toHaveAttribute("aria-selected", "true");
  await settlePage(page);
  runtime.assertClean();
});

// The page opens on the boundary: its two views are the first thing past the hero, so the switch,
// and on a desktop the map itself, are inside the first viewport.
test("the boundary's two views start inside the first viewport", async ({ page }) => {
  for (const [width, height, mapInView] of [
    [1440, 900, true],
    [390, 844, false],
  ] as const) {
    await page.setViewportSize({ width, height });
    await openPage(page, "/security");
    await expect(page.getByRole("tablist", { name: "Draw the boundary by" })).toBeInViewport({ ratio: 1 });
    if (mapInView) {
      const top = await page.locator("#boundary-panel .boundary-map").evaluate((element) => element.getBoundingClientRect().top);
      expect(top, `the map starts inside a ${width} x ${height} viewport`).toBeLessThan(height - 80);
    }
  }
});

test("the Network view is a hub on your machine, and each crossing opens its row in the table", async ({ page }) => {
  await openPage(page, "/security?view=network");
  const map = page.getByRole("tabpanel", { name: "Network" });
  const network = security.views.find((view: { id: string }) => view.id === "network");
  const hub = network.zones.find((zone: { id: string }) => zone.id === network.hub);
  // One hub, and every other zone a spoke off it: no zone sits between two crossings.
  await expect(map.locator(".boundary-hub-zone")).toHaveCount(1);
  await expect(map.locator(".boundary-hub-zone")).toContainText(hub.name);
  const crossings = security.boundaries.filter((boundary: { view: string }) => boundary.view === "network");
  await expect(map.locator(".boundary-spoke")).toHaveCount(crossings.length);

  const first = crossings[0];
  await map.getByRole("link", { name: new RegExp(first.crossing) }).click();
  await expect(page).toHaveURL(new RegExp(`#boundary-${first.id}$`));
  await expect(page.locator(`#boundary-${first.id}`)).toBeInViewport();
});

test("one table reads both views: a row per boundary, in its five columns", async ({ page }) => {
  await openPage(page, "/security");
  const table = page.getByRole("table", { name: /boundar/i });
  await expect(table.getByRole("columnheader")).toHaveText(columns);
  const rows = table.locator("tbody tr[data-boundary]");
  await expect(rows).toHaveCount(security.boundaries.length);
  for (const boundary of security.boundaries) {
    const row = table.locator(`tr[data-boundary="${boundary.id}"]`);
    await expect(row.getByRole("rowheader")).toContainText(boundary.name);
    await expect(row.locator("th, td")).toHaveCount(columns.length);
    await expect(row.getByRole("link", { name: boundary.evidence_label })).toHaveAttribute("href", boundary.evidence_url);
  }
});

test("the known limits come before the controls, and name the release they were verified against", async ({ page }) => {
  await openPage(page, "/security");
  const limits = page.locator("#limits");
  await expect(limits).toContainText(security.release);
  await expect(limits.locator("[data-limit]")).toHaveCount(security.limits.length);
  const [limitsTop, controlsTop] = await Promise.all([
    limits.evaluate((element) => element.getBoundingClientRect().top + window.scrollY),
    page.locator("#controls").evaluate((element) => element.getBoundingClientRect().top + window.scrollY),
  ]);
  expect(limitsTop).toBeLessThan(controlsTop);
  for (const control of security.controls) {
    await expect(page.locator(`[data-control="${control.id}"]`).getByRole("link", { name: control.source_label })).toHaveAttribute(
      "href",
      control.source_url,
    );
  }
});
