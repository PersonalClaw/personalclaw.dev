import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://personalclaw.dev",
  output: "static",
  trailingSlash: "never",
  integrations: [react(), sitemap()],
  image: {
    responsiveStyles: true
  }
});
