import type { APIRoute } from "astro";
import { SITE_URL } from "../data/social-card";

const isPreview = import.meta.env.VERCEL_ENV === "preview";

export const GET: APIRoute = () => {
  const body = isPreview
    ? "User-agent: *\nDisallow: /\n"
    : [
        "User-agent: *",
        "Allow: /",
        "",
        `Sitemap: ${SITE_URL}/sitemap-index.xml`,
        "",
        // Not a robots.txt directive — robots.txt has no field for this, and inventing
        // one would be ignored by every crawler. It is a pointer, in the one file an
        // agent fetches before anything else, at the machine-readable documentation
        // this site already generates from the pinned core release
        // (scripts/sync-docs.mjs writes both from the same corpus as /docs).
        // scripts/validate-build.mjs asserts these two files ship, are non-trivial, and
        // that every URL inside llms.txt resolves to a real page.
        "# Machine-readable documentation for AI agents (llmstxt.org):",
        `#   ${SITE_URL}/llms.txt       index of every published document`,
        `#   ${SITE_URL}/llms-full.txt  the same corpus inlined as one file`,
        ""
      ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
};
