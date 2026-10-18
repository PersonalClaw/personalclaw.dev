import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:4321";

// The visual specs compare pixels, so they run only inside the pinned Playwright image
// (tests/browser/visual-image.json), started by scripts/run-visual.mjs, which sets
// PLAYWRIGHT_VISUAL=1. Every other run leaves them out: a host's browser, renderer and
// fonts are not the ones the one linux baseline set was made with.
const visual = process.env.PLAYWRIGHT_VISUAL === "1";
const VISUAL_SPEC = /(^|\/)visual\.spec\.ts$/;

export default defineConfig({
  testDir: "./tests/browser",
  ...(visual ? { testMatch: VISUAL_SPEC } : { testIgnore: VISUAL_SPEC }),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 3 : undefined,
  timeout: 30_000,
  expect: {
    timeout: 7_500,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.005,
      scale: "css"
    }
  },
  reporter: [
    ["list"],
    ["html", { open: "never" }]
  ],
  // `{platform}` is always linux inside the image. It stays in the path so a visual run
  // anywhere else finds no baseline and fails, rather than comparing other pixels.
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}",
  use: {
    baseURL,
    colorScheme: "dark",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  // The preview server is started and stopped by these two hooks rather than by
  // Playwright's `webServer`, which aborts the run when the process it spawned exits.
  // `astro preview` returns immediately after handing off to a detached daemon, so
  // `webServer` reported `exited early` against a server that was live and answering.
  // Setup also asserts the server is serving the build currently on disk. See issue #25.
  globalSetup: "./tests/global-setup.mjs",
  globalTeardown: "./tests/global-teardown.mjs",
  projects: [
    {
      name: "desktop",
      use: {
        viewport: { width: 1440, height: 1000 }
      }
    },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true
      }
    },
    {
      name: "reduced-motion",
      use: {
        viewport: { width: 1440, height: 1000 },
        contextOptions: {
          reducedMotion: "reduce"
        }
      }
    }
  ]
});
