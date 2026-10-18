import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:4321";

// scripts/run-visual.mjs sets PLAYWRIGHT_VISUAL=1 when it runs inside the pinned
// Playwright image (tests/browser/visual-image.json), and then only the visual specs run.
// Every other run is unchanged and still includes them: until the pinned image's linux
// baselines and their environment manifest are committed, today's comparison stays the
// gate.
const visual = process.env.PLAYWRIGHT_VISUAL === "1";
const VISUAL_SPEC = /(^|\/)visual\.spec\.ts$/;

export default defineConfig({
  testDir: "./tests/browser",
  ...(visual ? { testMatch: VISUAL_SPEC } : {}),
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
