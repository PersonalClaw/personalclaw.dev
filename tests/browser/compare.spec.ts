import { expect, test, type Page } from "@playwright/test";
import { capabilityMatrix } from "../../src/data/capabilities.mjs";
import { monitorRuntime, openPage, tabTo } from "./support";

const matrix = capabilityMatrix();
const groupIds = matrix.groups.map((group) => group.id);

const filter = (page: Page) => page.getByRole("group", { name: "Show rows about" });
const groupButton = (page: Page, name: string) =>
  filter(page).getByRole("button", { name, exact: true });

async function expectOnly(page: Page, shown: string | null) {
  for (const id of groupIds) {
    const section = page.locator(`[data-capability-group="${id}"]`);
    if (shown === null || shown === id) await expect(section).toBeVisible();
    else await expect(section).toBeHidden();
  }
}

test("each filter shows only its group's rows, every visible row keeps its source", async ({
  page,
  baseURL
}) => {
  const runtime = monitorRuntime(page, baseURL!);
  await openPage(page, "/compare");
  await expect(groupButton(page, "All")).toHaveAttribute("aria-pressed", "true");
  await expectOnly(page, null);

  for (const group of matrix.groups) {
    await groupButton(page, group.short).click();
    await expect(groupButton(page, group.short)).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(new RegExp(`\\?group=${group.id}$`));
    await expectOnly(page, group.id);

    const rows = page.locator("[data-capability-row]:visible");
    await expect(rows).toHaveCount(group.rows.length);
    for (const row of await rows.all()) {
      await expect(row.locator("[data-capability-source]")).toHaveAttribute(
        "href",
        new RegExp(`/blob/${matrix.pin.tag}/`)
      );
    }
  }
  runtime.assertClean();
});

test("the filter survives reload, Back and Forward, and an unknown group shows everything", async ({
  page,
  baseURL
}) => {
  const runtime = monitorRuntime(page, baseURL!);
  const [first, second] = matrix.groups;
  await openPage(page, `/compare?group=${first.id}`);
  await expectOnly(page, first.id);

  await groupButton(page, second.short).click();
  await expectOnly(page, second.id);
  await page.reload();
  await expectOnly(page, second.id);
  await expect(groupButton(page, second.short)).toHaveAttribute("aria-pressed", "true");

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`\\?group=${first.id}$`));
  await expectOnly(page, first.id);
  await page.goForward();
  await expectOnly(page, second.id);

  await openPage(page, "/compare?group=nonsense");
  await expectOnly(page, null);
  await expect(groupButton(page, "All")).toHaveAttribute("aria-pressed", "true");
  runtime.assertClean();
});

test("the filter works by keyboard", async ({ page }) => {
  await openPage(page, "/compare");
  const network = groupButton(page, matrix.groups[1].short);
  await tabTo(page, network);
  await page.keyboard.press("Enter");
  await expect(network).toHaveAttribute("aria-pressed", "true");
  await expectOnly(page, matrix.groups[1].id);
});

test("a row's anchor lands on that row", async ({ page }) => {
  await openPage(page, "/compare#telemetry");
  const row = page.locator("#telemetry");
  await expect(row).toHaveAttribute("data-capability-row", "telemetry");
  await expect(row).toBeInViewport();
});

test("without JavaScript the page is whole and the filter is not offered", async ({
  browser,
  baseURL
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto("/compare");
  await expect(page.locator("[data-compare-filter]")).toBeHidden();
  await expect(page.locator("[data-capability-row]")).toHaveCount(matrix.current.length);
  await context.close();
});
