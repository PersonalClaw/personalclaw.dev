// The /blog feed (#93): RSS 2.0 with one item per post and every URL absolute, contracted the
// way robots.txt and the llms.txt pair are.

import assert from "node:assert/strict";
import { test } from "node:test";
import { blogFeed } from "../src/data/blog-feed.mjs";
import { feedProblems } from "../scripts/blog-feed.mjs";

const SITE = "https://personalclaw.dev";
const posts = [
  {
    id: "launch",
    title: "A personal agent you can audit",
    description: "Every claim names the file that proves it.",
    publishDate: new Date("2026-08-26T00:00:00Z"),
    verifiedAgainst: "v0.1.3"
  },
  {
    id: "second",
    title: "Second & <later>",
    description: "Escaped, not broken.",
    publishDate: new Date("2026-09-01T00:00:00Z"),
    verifiedAgainst: "v0.2.0"
  }
];
const ids = posts.map((post) => post.id);

test("the feed the site builds meets its contract", () => {
  assert.deepEqual(feedProblems(blogFeed(posts, SITE), ids, SITE), []);
});

test("newest first, absolute links, and the title escaped", () => {
  const xml = blogFeed(posts, SITE);
  assert.ok(xml.indexOf("/blog/second") < xml.indexOf("/blog/launch"));
  assert.match(xml, /<link>https:\/\/personalclaw\.dev\/blog\/launch<\/link>/);
  assert.match(xml, /Second &amp; &lt;later&gt;/);
});

test("no feed fails, as the site had none", () => {
  assert.deepEqual(feedProblems(null, ids, SITE), ["/blog/rss.xml was not published: the blog has no feed"]);
});

test("a feed that misses a post, links relatively or leaves the site fails", () => {
  assert.match(feedProblems(blogFeed(posts.slice(0, 1), SITE), ids, SITE).join("\n"), /no item for \/blog\/second/);
  const relative = blogFeed(posts, SITE).replace(`<link>${SITE}/blog/launch</link>`, "<link>/blog/launch</link>");
  assert.match(feedProblems(relative, ids, SITE).join("\n"), /"\/blog\/launch" is not an absolute URL/);
  assert.match(feedProblems(blogFeed(posts, "https://elsewhere.example"), ids, SITE).join("\n"), /is not on https:\/\/personalclaw\.dev/);
  assert.match(feedProblems("<html></html>", ids, SITE).join("\n"), /does not parse as an RSS channel/);
});
