import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4321";
const outputDir = process.env.OUTPUT_DIR ?? "/tmp/personalclaw-visual-audit";

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 },
  { name: "wide", width: 1920, height: 1080 }
];

const routes = [
  { path: "/", name: "home", viewports: ["mobile", "tablet", "desktop", "wide"] },
  { path: "/product", name: "product", viewports: ["mobile", "desktop"] },
  { path: "/apps", name: "apps", viewports: ["mobile", "desktop"] },
  { path: "/security", name: "security", viewports: ["mobile", "desktop"] }
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();
const findings = [];

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference"
  });

  for (const route of routes.filter((item) => item.viewports.includes(viewport.name))) {
    const page = await context.newPage();
    const label = `${route.name}-${viewport.name}`;

    page.on("console", (message) => {
      if (message.type() === "error") {
        findings.push(`${label}: console error: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => findings.push(`${label}: page error: ${error.message}`));
    page.on("requestfailed", (request) => {
      findings.push(`${label}: request failed: ${request.url()} (${request.failure()?.errorText})`);
    });

    const response = await page.goto(`${baseUrl}${route.path}`, {
      waitUntil: "networkidle"
    });
    if (!response?.ok()) {
      findings.push(`${label}: HTTP ${response?.status() ?? "no response"}`);
    }

    const images = page.locator("img");
    for (let index = 0; index < (await images.count()); index += 1) {
      await images.nth(index).scrollIntoViewIfNeeded();
    }
    await page.evaluate(async () => {
      await Promise.all(
        [...document.images].map((image) =>
          image.decode().catch(() => undefined)
        )
      );
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState("networkidle");

    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const tooSmall = [...document.querySelectorAll("a, button, input")]
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            rect.width > 0 &&
            rect.height > 0 &&
            (rect.width < 44 || rect.height < 44)
          );
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return `${element.tagName.toLowerCase()} "${element.textContent?.trim().slice(0, 36) ?? ""}" ${Math.round(rect.width)}x${Math.round(rect.height)}`;
        });

      const brokenImages = [...document.images]
        .filter((image) => !image.complete || image.naturalWidth === 0 || image.naturalHeight === 0)
        .map((image) => image.alt || image.src);

      return {
        horizontalOverflow: root.scrollWidth - root.clientWidth,
        tooSmall,
        brokenImages
      };
    });

    if (layout.horizontalOverflow > 1) {
      findings.push(`${label}: horizontal overflow ${layout.horizontalOverflow}px`);
    }
    if (layout.tooSmall.length) {
      findings.push(`${label}: small targets: ${layout.tooSmall.join("; ")}`);
    }
    if (layout.brokenImages.length) {
      findings.push(`${label}: broken images: ${layout.brokenImages.join("; ")}`);
    }

    await page.screenshot({
      path: `${outputDir}/${label}.png`,
      fullPage: true,
      animations: "disabled"
    });

    if (route.name === "home") {
      await page.getByRole("tab", { name: "Loops" }).click();
      const selected = await page.getByRole("tab", { name: "Loops" }).getAttribute("aria-selected");
      if (selected !== "true") findings.push(`${label}: product tab did not select`);
    }

    if (route.name === "apps") {
      const input = page.getByRole("searchbox", { name: "Search first-party apps" });
      await input.fill("Ollama");
      await page.waitForTimeout(50);
      const count = await page.locator(".app-card").count();
      if (count !== 1) findings.push(`${label}: app search returned ${count}, expected 1`);
      if (!page.url().includes("q=Ollama")) findings.push(`${label}: app search state missing from URL`);
    }

    if (viewport.name === "mobile") {
      const menuButton = page.locator("[data-menu-button]");
      await menuButton.click();
      if ((await menuButton.getAttribute("aria-expanded")) !== "true") {
        findings.push(`${label}: mobile menu did not open`);
      }
    }

    await page.close();
  }

  await context.close();
}

await browser.close();

if (findings.length) {
  console.log(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Visual audit passed. Screenshots: ${outputDir}`);
}
