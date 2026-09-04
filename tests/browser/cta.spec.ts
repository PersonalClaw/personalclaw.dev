import { expect, test } from "@playwright/test";
import { openPage } from "./support";

// PRODUCT.md names the primary call to action: "Get PersonalClaw", linking to
// the repository and installation path. Any primary button pointing at the
// repository must carry that exact label — three different labels for the
// same destination read as three different products.
const pagesWithRepoCta = ["/", "/product"];

for (const path of pagesWithRepoCta) {
  test(`repository-bound primary CTA on ${path} carries the canonical label`, async ({
    page
  }) => {
    await openPage(page, path);
    const repoCtas = page.locator(
      '.button-primary[href*="github.com/PersonalClaw/PersonalClaw"]'
    );
    const count = await repoCtas.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(repoCtas.nth(i)).toContainText("Get PersonalClaw");
    }
  });
}
