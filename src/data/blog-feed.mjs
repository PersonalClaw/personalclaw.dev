// The /blog feed, as RSS 2.0, built from the blog collection: one item per post, every URL
// absolute. src/pages/blog/rss.xml.ts serves it, and scripts/blog-feed.mjs checks the file the
// build wrote. There is no newsletter and no tracking: a reader subscribes in their own reader.

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

/**
 * @param {Array<{ id: string, title: string, description: string, publishDate: Date, verifiedAgainst: string }>} posts
 * @param {URL | string} site  the site's origin, e.g. https://personalclaw.dev
 * @returns {string}
 */
export function blogFeed(posts, site) {
  const origin = new URL(site).origin;
  const items = [...posts]
    .sort((left, right) => right.publishDate.valueOf() - left.publishDate.valueOf())
    .map((post) => {
      const link = `${origin}/blog/${post.id}`;
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${post.publishDate.toUTCString()}</pubDate>`,
        `      <description>${escapeXml(`${post.description} Verified against ${post.verifiedAgainst}.`)}</description>`,
        "    </item>"
      ].join("\n");
    });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>PersonalClaw writing</title>",
    `    <link>${origin}/blog</link>`,
    `    <atom:link href="${origin}/blog/rss.xml" rel="self" type="application/rss+xml"/>`,
    "    <description>What PersonalClaw shipped, each post checked against a named release.</description>",
    "    <language>en</language>",
    ...items,
    "  </channel>",
    "</rss>",
    ""
  ].join("\n");
}
