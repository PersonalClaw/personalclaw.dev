// The site's one social card, stated once.
//
// This module is deliberately DEPENDENCY-FREE. It is imported by astro.config.mjs (to
// restate the card for the Starlight /docs tier, which does not render BaseLayout), and
// anything the config imports is evaluated at config-load time — before `npm run sync`
// has necessarily produced `.generated/release-facts.json`. Importing
// src/data/structured-data.ts there instead would drag that JSON into the config's
// dependency graph and make `astro check` fail on a clean checkout. Keep this file
// free of imports.
//
// The width and height are the PNG's REAL size (`file public/brand/social-preview.png`
// → 1200 x 600). scripts/validate-build.mjs re-measures the file and fails if the
// declared dimensions stop matching it: a card that lies about its aspect ratio is
// cropped by the consumer, and nothing else on the site would notice.

export const SITE_URL = "https://personalclaw.dev";
export const SOCIAL_IMAGE_PATH = "/brand/social-preview.png";
export const SOCIAL_IMAGE_WIDTH = "1200";
export const SOCIAL_IMAGE_HEIGHT = "600";
// Alt text DESCRIBES the card, it does not re-state a slogan. The previous value
// ("One agentic OS. Your machine. Your rules.") was a tagline that does not appear on
// the image, so a reader who could not see the card was told something different from
// what everyone else was shown.
export const SOCIAL_IMAGE_ALT =
  "The PersonalClaw mark and wordmark on coral, with the line " +
  "“Your self-hosted personal AI agent”.";
