// The /blog feed's contract, over the file the build wrote (dist/blog/rss.xml), the way
// scripts/validate-build.mjs contracts robots.txt and the llms.txt pair: it exists, it parses
// as RSS, it holds one item per post, and every URL in it is absolute, on the site, and names a
// published post. scripts/validate-blog-render.mjs runs it after a build; tests/blog-feed.test.mjs
// plants each failure.

import { load } from "cheerio";

/**
 * @param {string | null} xml  the built feed, or null when the build wrote none
 * @param {string[]} postIds  the posts on disk
 * @param {string} site  the site's origin
 * @returns {string[]}
 */
export function feedProblems(xml, postIds, site) {
  if (xml == null) return ["/blog/rss.xml was not published: the blog has no feed"];
  const origin = new URL(site).origin;
  const $ = load(xml, { xml: true });
  if ($("rss > channel").length !== 1) return ["/blog/rss.xml does not parse as an RSS channel"];

  const problems = [];
  const items = $("rss > channel > item").toArray();
  if (items.length !== postIds.length) {
    problems.push(`/blog/rss.xml holds ${items.length} item(s) for ${postIds.length} post(s)`);
  }
  const linked = [];
  for (const item of items) {
    const link = $(item).children("link").text().trim();
    const guid = $(item).children("guid").text().trim();
    const title = $(item).children("title").text().trim();
    if (title === "") problems.push("/blog/rss.xml has an item with no title");
    if (Number.isNaN(Date.parse($(item).children("pubDate").text()))) {
      problems.push(`/blog/rss.xml item ${link || "(no link)"} has no readable pubDate`);
    }
    for (const [field, url] of [["link", link], ["guid", guid]]) {
      let parsed = null;
      try {
        parsed = new URL(url);
      } catch {
        problems.push(`/blog/rss.xml item ${field} "${url}" is not an absolute URL`);
        continue;
      }
      if (parsed.origin !== origin) {
        problems.push(`/blog/rss.xml item ${field} ${url} is not on ${origin}`);
      }
    }
    linked.push(link.replace(`${origin}/blog/`, ""));
  }
  for (const id of postIds) {
    if (!linked.includes(id)) problems.push(`/blog/rss.xml has no item for /blog/${id}`);
  }
  const channelLink = $("rss > channel > link").first().text().trim();
  if (channelLink !== `${origin}/blog`) {
    problems.push(`/blog/rss.xml's channel links ${channelLink || "nothing"}, not ${origin}/blog`);
  }
  return problems;
}
