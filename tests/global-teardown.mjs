import { stopPreview } from "./support/preview-server.mjs";

// Runs after the suite whether it passed or failed. A setup that throws cleans up after
// itself, because Playwright does not call teardown in that case.
export default async function globalTeardown() {
  await stopPreview();
}
