import { expect, test } from "@playwright/test";
import { openPage } from "./support";

// Structured data is a published claim like any other copy on this site: it must
// parse, it must trace to release facts, and it must never invent a label. These
// rails pin the route-aware graph BaseLayout emits — a SoftwareApplication node on
// the home page only, an Article node on posts, and breadcrumbs that mirror the
// visible nav names.

type JsonLdNode = Record<string, unknown> & { "@type": string };

async function readGraph(page: import("@playwright/test").Page): Promise<JsonLdNode[]> {
  const raw = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(raw, "the ld+json script must be present and non-empty").toBeTruthy();
  const parsed = JSON.parse(raw!);
  expect(parsed["@context"]).toBe("https://schema.org");
  expect(Array.isArray(parsed["@graph"]), "the payload is a @graph").toBe(true);
  return parsed["@graph"] as JsonLdNode[];
}

const nodeOfType = (graph: JsonLdNode[], type: string) =>
  graph.filter((node) => node["@type"] === type);

test("home page publishes one SoftwareApplication node sourced from release facts", async ({
  page
}) => {
  await openPage(page, "/");
  const graph = await readGraph(page);

  expect(nodeOfType(graph, "WebSite")).toHaveLength(1);
  expect(nodeOfType(graph, "Organization")).toHaveLength(1);

  const apps = nodeOfType(graph, "SoftwareApplication");
  expect(apps).toHaveLength(1);
  const app = apps[0];
  expect(app.name).toBe("PersonalClaw");
  // The version must be a concrete release fact, never a placeholder.
  expect(String(app.softwareVersion)).toMatch(/^\d+\.\d+/);
  expect(app.isAccessibleForFree).toBe(true);
  expect((app.offers as { price: string }).price).toBe("0");
  expect(app.license).toContain("mit");
  expect(String(app.downloadUrl)).toContain("github.com/PersonalClaw/PersonalClaw");
  // The graph claims no platform support because the site's pages claim none.
  expect(app.operatingSystem, "operatingSystem must stay absent until the site claims platforms").toBeUndefined();

  // Home is the app's canonical page — no breadcrumb trail on the root.
  expect(nodeOfType(graph, "BreadcrumbList")).toHaveLength(0);
});

test("a section page carries a breadcrumb trail matching the visible nav", async ({
  page
}) => {
  await openPage(page, "/product");
  const graph = await readGraph(page);

  // SoftwareApplication is scoped to the home page only.
  expect(nodeOfType(graph, "SoftwareApplication")).toHaveLength(0);

  const trails = nodeOfType(graph, "BreadcrumbList");
  expect(trails).toHaveLength(1);
  const items = trails[0].itemListElement as { position: number; name: string }[];
  expect(items.map((item) => item.name)).toEqual(["Home", "Product"]);
  expect(items.map((item) => item.position)).toEqual([1, 2]);
});

test("a blog post publishes an Article node and a three-deep breadcrumb trail", async ({
  page
}) => {
  await openPage(page, "/blog/launch");
  const graph = await readGraph(page);

  const articles = nodeOfType(graph, "Article");
  expect(articles).toHaveLength(1);
  const article = articles[0];
  expect(String(article.headline).length).toBeGreaterThan(0);
  expect(String(article.datePublished)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(article.mainEntityOfPage).toBeTruthy();

  const trails = nodeOfType(graph, "BreadcrumbList");
  expect(trails).toHaveLength(1);
  const names = (trails[0].itemListElement as { name: string }[]).map((item) => item.name);
  expect(names[0]).toBe("Home");
  expect(names[1]).toBe("Writing");
  expect(names).toHaveLength(3);
});
