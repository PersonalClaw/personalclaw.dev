import { expect, test } from "@playwright/test";
import { qualityRoutes } from "../support/site-contract.mjs";
import {
  assertImageIntegrity,
  assertLayoutIntegrity,
  assertReducedMotion,
  monitorRuntime,
  openPage
} from "./support";

for (const route of qualityRoutes) {
  test(`${route.name} satisfies the runtime quality contract`, async ({
    page,
    baseURL
  }, testInfo) => {
    const runtime = monitorRuntime(page, baseURL!);
    await openPage(page, route.path);

    await expect(page).toHaveTitle(route.title);
    await expect(page.locator("h1")).toHaveCount(1);
    await assertImageIntegrity(page);
    await assertLayoutIntegrity(page);
    if (testInfo.project.name === "reduced-motion") {
      await assertReducedMotion(page);
    }
    runtime.assertClean();
  });
}
