import type { APIRoute } from "astro";

const isPreview = import.meta.env.VERCEL_ENV === "preview";

export const GET: APIRoute = () => {
  const body = isPreview
    ? "User-agent: *\nDisallow: /\n"
    : [
        "User-agent: *",
        "Allow: /",
        "Sitemap: https://personalclaw.dev/sitemap-index.xml",
        ""
      ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
};
