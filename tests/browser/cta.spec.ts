import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { openPage, tabTo } from "./support";

// PRODUCT.md names the primary call to action. On Home it is "Install PersonalClaw", which opens
// the install panel: the download step, then what to check (the checksum, the signature, the
// platforms, the Python, a pasteable check and what to do when it fails) and the script itself, then
// the run step (SITE-REDESIGN.md, section 5.3).
// Escape closes it and puts focus back on the button that opened it.
const installer = readFileSync(path.join(process.cwd(), "dist", "install"));
const digest = createHash("sha256").update(installer).digest("hex");

test("Install PersonalClaw on / opens the install panel, and Escape closes it", async ({ page }) => {
  await openPage(page, "/");
  const install = page.locator(".home-hero").getByRole("button", { name: "Install PersonalClaw" });
  await tabTo(page, install);
  await page.keyboard.press("Enter");

  const panel = page.getByRole("dialog", { name: "Install PersonalClaw" });
  await expect(panel).toBeVisible();
  // Focus moves into the panel, onto its heading, so a screen reader announces where it is.
  await expect(panel.getByRole("heading", { name: "Install PersonalClaw" })).toBeFocused();
  await expect(panel.getByLabel("Download command", { exact: true })).toHaveText(/curl -fsSLO https:\/\/personalclaw\.dev\/install/);
  await expect(panel.getByRole("button", { name: "Copy download command" })).toBeVisible();
  await expect(panel.locator("[data-install-sha256]")).toHaveText(digest);
  await expect(panel.getByLabel("Check command", { exact: true })).toContainText(`${digest}  install`);
  await expect(panel).toContainText("If it prints FAILED, delete the file and don't run it.");
  await expect(panel).toContainText("Not signed yet");
  await expect(panel).toContainText("macOS and Linux");

  await panel.getByText("Read the script").click();
  const script = panel.locator("[data-install-script]");
  await expect(script).toBeVisible();
  expect(await script.textContent()).toBe(installer.toString("utf8"));
  await expect(panel.getByLabel("Run command", { exact: true })).toHaveText(/sh install/);

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(install).toBeFocused();
});

test("the closing call to action opens the same panel", async ({ page }) => {
  await openPage(page, "/");
  await page.locator(".closing").getByRole("button", { name: "Install PersonalClaw" }).click();
  await expect(page.getByRole("dialog", { name: "Install PersonalClaw" })).toBeVisible();
});

// Where a page has no install panel yet, its primary action goes to the repository, and every
// such button carries the one label: three labels for one destination read as three products.
test("repository-bound primary CTA on /product carries the canonical label", async ({ page }) => {
  await openPage(page, "/product");
  const repoCtas = page.locator('.button-primary[href*="github.com/PersonalClaw/PersonalClaw"]');
  const count = await repoCtas.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(repoCtas.nth(i)).toContainText("Get PersonalClaw");
  }
});
