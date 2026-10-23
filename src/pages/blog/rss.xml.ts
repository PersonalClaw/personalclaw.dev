import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { blogFeed } from "../../data/blog-feed.mjs";

// The feed /blog links: every post, newest first, with absolute URLs (src/data/blog-feed.mjs).
export const GET: APIRoute = async ({ site }) => {
  const posts = (await getCollection("blog")).map((post) => ({ id: post.id, ...post.data }));
  return new Response(blogFeed(posts, site!), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" }
  });
};
