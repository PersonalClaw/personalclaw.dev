import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  site: "https://personalclaw.dev",
  integrations: [react()],
  image: {
    responsiveStyles: true
  }
});
