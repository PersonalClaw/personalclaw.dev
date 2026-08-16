import { startPreview } from "./support/preview-server.mjs";

export default async function globalSetup() {
  await startPreview();
}
