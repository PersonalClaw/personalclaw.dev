// The site's SHARED head machinery: the social-card facts and the one JSON-LD graph
// builder every route renders through.
//
// Why this module exists. The graph used to be assembled inline in BaseLayout.astro,
// which meant it only ever reached the routes BaseLayout renders — the nine
// hand-authored marketing/registry/blog/compare pages. The 33 generated /docs pages are
// rendered by Starlight, which does not use BaseLayout, so they shipped with NO
// structured data at all: three quarters of the indexable site was invisible to a
// consumer reading schema.org. Two renderers needing the same graph is exactly one
// builder's job, so the logic lives here and both call it (src/layouts/BaseLayout.astro
// and src/components/DocsHead.astro). Do not re-derive a node shape in either caller.
//
// Every claim here traces to a source the visible pages already read (README →
// "Content And Release Truth"): the version comes from the generated release facts, the
// repository URL from src/data/site.ts, and the license from the claim the home page
// makes ("MIT licensed"). No `operatingSystem` node on purpose — the site publishes no
// platform claims, so neither does the graph.

import { GITHUB_URL } from "./site";
import { releaseFacts } from "./release";
import { SOCIAL_IMAGE_PATH } from "./social-card";

export {
  SOCIAL_IMAGE_ALT,
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_PATH,
  SOCIAL_IMAGE_WIDTH
} from "./social-card";

/**
 * Marketing sections that own a real landing page, mapped to the label the header nav
 * and page kickers already use. A crumb is only emitted for a section in this map, so
 * the trail can never invent a label or point at a route that does not exist.
 */
const SECTION_NAMES: Record<string, string> = {
  product: "Product",
  compare: "Compare",
  apps: "Apps",
  security: "Security",
  release: "Release",
  registry: "Registry",
  blog: "Writing"
};

/**
 * Doc trees that publish a section INDEX, mapped to their sidebar label.
 *
 * Only `research` is here, and that is a fact about the corpus rather than an omission:
 * `/docs` itself is not a route (Starlight's catch-all derives URLs from the collection
 * and nothing writes an index there), and guides/reference/architecture/security have
 * no landing page either — the header nav deep-links straight to
 * `/docs/guides/getting-started`. Only the research corpus ships a website-authored
 * index (scripts/sync-docs.mjs `preface`), so only it can carry a middle crumb whose
 * `item` resolves.
 *
 * The harmful direction is gated, not trusted: scripts/validate-build.mjs resolves every
 * BreadcrumbList `item` URL against the built output, so a crumb that starts pointing at
 * a page which does not exist reds the build. The benign direction — a new section index
 * landing without being listed here — simply omits an optional crumb.
 */
const DOCS_SECTION_INDEXES: Record<string, string> = {
  research: "Research"
};

export type ArticleFacts = {
  title: string;
  description: string;
  publishDate: Date;
};

export type StructuredDataInput = {
  /** The site origin, from `Astro.site`. */
  site: URL;
  /** `Astro.url.pathname`, trailing slash already stripped ("/" for the root). */
  pathname: string;
  /** The page's `<title>`, verbatim. */
  title: string;
  /** The page's `<meta name="description">`, verbatim. */
  description: string;
  /** Set by blog post pages: emits an Article node in the graph. */
  article?: ArticleFacts;
};

type Node = Record<string, unknown>;

/**
 * Build the schema.org `@graph` for one route.
 *
 * Shape, uniform across every tier so one contract can check all of them:
 * `WebSite` + `Organization` + `WebPage`, plus `SoftwareApplication` on the home page
 * only, `BreadcrumbList` on every non-root route that has a trail worth publishing, and
 * `Article` on a blog post.
 */
export function buildStructuredData({
  site,
  pathname,
  title,
  description,
  article
}: StructuredDataInput): { "@context": string; "@graph": Node[] } {
  const siteUrl = site.toString();
  const canonical = new URL(pathname, site).toString();
  const absolute = (path: string) => new URL(path, site).toString();

  const websiteId = absolute("/#website");
  const orgId = absolute("/#org");

  const graph: Node[] = [
    {
      "@type": "WebSite",
      "@id": websiteId,
      name: "PersonalClaw",
      url: siteUrl,
      publisher: { "@id": orgId }
    },
    {
      "@type": "Organization",
      "@id": orgId,
      name: "PersonalClaw",
      url: siteUrl,
      logo: absolute("/brand/personalclaw-mark.svg"),
      sameAs: [GITHUB_URL]
    },
    {
      "@type": "WebPage",
      "@id": canonical,
      name: title,
      // Omitted rather than emitted empty: Starlight's generated 404 page carries no
      // description, and `"description": ""` is a published claim that the page has no
      // summary instead of the absence of one.
      ...(description ? { description } : {}),
      url: canonical,
      inLanguage: "en",
      isPartOf: { "@id": websiteId }
    }
  ];

  if (pathname === "/") {
    graph.push({
      "@type": "SoftwareApplication",
      "@id": absolute("/#app"),
      name: "PersonalClaw",
      description,
      url: siteUrl,
      applicationCategory: "DeveloperApplication",
      softwareVersion: releaseFacts.core.version,
      license: "https://opensource.org/license/mit",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      downloadUrl: GITHUB_URL,
      sameAs: [GITHUB_URL],
      publisher: { "@id": orgId }
    });
  }

  // Breadcrumbs mirror the VISIBLE route structure: Home → section (→ page). Names come
  // from the header nav / sidebar labels, and a section crumb is emitted only when that
  // section has a page to point at — see SECTION_NAMES / DOCS_SECTION_INDEXES.
  if (pathname !== "/") {
    const segments = pathname.split("/").filter(Boolean);
    const crumbs: Array<{ name: string; item: string }> = [
      { name: "Home", item: siteUrl }
    ];

    if (segments[0] === "docs") {
      const sectionLabel = segments[1] ? DOCS_SECTION_INDEXES[segments[1]] : undefined;
      // Only when the reader is BELOW the index: on /docs/research itself the section
      // and the page are the same URL, and a trail must not repeat a crumb.
      if (sectionLabel && segments.length > 2) {
        crumbs.push({ name: sectionLabel, item: absolute(`/docs/${segments[1]}`) });
      }
      // The doc's own H1, which is core's heading — the title carries the site suffix,
      // so the crumb takes the heading the sync wrote it from.
      crumbs.push({ name: docsCrumbName(title), item: canonical });
    } else {
      const section = segments[0] ? SECTION_NAMES[segments[0]] : undefined;
      if (section) {
        crumbs.push({ name: section, item: absolute(`/${segments[0]}`) });
      }
      if (article && segments.length > 1) {
        crumbs.push({ name: article.title, item: canonical });
      }
    }

    // A one-item trail is noise, not navigation.
    if (crumbs.length > 1) {
      graph.push({
        "@type": "BreadcrumbList",
        itemListElement: crumbs.map((crumb, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: crumb.name,
          item: crumb.item
        }))
      });
    }
  }

  if (article) {
    graph.push({
      "@type": "Article",
      "@id": `${canonical}#article`,
      headline: article.title,
      description: article.description,
      datePublished: article.publishDate.toISOString().slice(0, 10),
      inLanguage: "en",
      mainEntityOfPage: { "@id": canonical },
      image: absolute(SOCIAL_IMAGE_PATH),
      author: { "@id": orgId },
      publisher: { "@id": orgId }
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

/**
 * Strip the site suffix Starlight appends to a docs `<title>` ("Getting started |
 * PersonalClaw docs" → "Getting started"), so the crumb reads as the page's own name.
 * Splits on the LAST delimiter: core's headings contain pipes of their own
 * ("Config reference — operator knobs (~/.personalclaw/config.json)" does not, but
 * assuming none would be a guess, and the last segment is the suffix either way).
 */
function docsCrumbName(title: string): string {
  const index = title.lastIndexOf(" | ");
  return index === -1 ? title : title.slice(0, index);
}
