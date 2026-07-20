import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";
import {
  canonicalUrl,
  routeOutputPath,
  routes,
  siteOrigin
} from "../tests/support/site-contract.mjs";

const root = process.cwd();
const distDir = path.resolve(root, process.env.DIST_DIR ?? "dist");
const expectNoIndex = process.env.EXPECT_NOINDEX === "1";
const failures = [];

const fail = (message) => failures.push(message);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function localOutputPath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  if (decoded === "/") return path.join(distDir, "index.html");
  if (path.extname(decoded)) return path.join(distDir, decoded.slice(1));
  return path.join(distDir, decoded.slice(1), "index.html");
}

async function readHtml(routePath) {
  const filePath = path.join(distDir, routeOutputPath(routePath));
  return load(await readFile(filePath, "utf8"));
}

async function collectFiles(directory, predicate, collected = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(entryPath, predicate, collected);
    } else if (predicate(entry.name)) {
      collected.push(entryPath);
    }
  }
  return collected;
}

function metaContent($, selector) {
  return $(selector).attr("content")?.trim() ?? "";
}

async function validateInternalUrl(rawUrl, currentRoute, context, checkHash = false) {
  if (
    rawUrl.startsWith("data:") ||
    rawUrl.startsWith("mailto:") ||
    rawUrl.startsWith("tel:")
  ) {
    return;
  }

  let parsed;
  try {
    parsed = new URL(rawUrl, new URL(currentRoute, siteOrigin));
  } catch {
    fail(`${currentRoute}: invalid ${context} URL "${rawUrl}"`);
    return;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    fail(`${currentRoute}: unsupported ${context} protocol in "${rawUrl}"`);
    return;
  }

  if (parsed.origin !== siteOrigin) {
    if (parsed.protocol !== "https:") {
      fail(`${currentRoute}: external ${context} URL must use HTTPS: "${rawUrl}"`);
    }
    return;
  }

  const outputPath = localOutputPath(parsed.pathname);
  if (!(await exists(outputPath))) {
    fail(`${currentRoute}: broken internal ${context} URL "${rawUrl}"`);
    return;
  }

  if (checkHash && parsed.hash) {
    const targetRoute = parsed.pathname || currentRoute;
    const target$ = await readHtml(targetRoute);
    const id = decodeURIComponent(parsed.hash.slice(1));
    const found = target$("[id]").toArray().some((element) => target$(element).attr("id") === id);
    if (!found) {
      fail(`${currentRoute}: missing fragment target "${rawUrl}"`);
    }
  }
}

const generatedHtml = new Set(
  (await collectFiles(distDir, (fileName) => fileName.endsWith(".html"))).map((filePath) =>
    path.relative(distDir, filePath)
  )
);
const contractedHtml = new Set(routes.map((route) => routeOutputPath(route.path)));
for (const filePath of generatedHtml) {
  if (!contractedHtml.has(filePath)) fail(`generated route ${filePath} is missing from the route contract`);
}
for (const filePath of contractedHtml) {
  if (!generatedHtml.has(filePath)) fail(`route contract references missing generated page ${filePath}`);
}

for (const route of routes) {
  const filePath = path.join(distDir, routeOutputPath(route.path));
  if (!(await exists(filePath))) {
    fail(`${route.path}: missing generated page ${filePath}`);
    continue;
  }

  const $ = load(await readFile(filePath, "utf8"));
  const canonical = canonicalUrl(route.path);
  const robots = expectNoIndex ? "noindex, nofollow" : "index, follow";

  if ($("html").attr("lang") !== "en") fail(`${route.path}: html lang must be "en"`);
  if ($("title").text().trim() !== route.title) fail(`${route.path}: title does not match route contract`);
  if (metaContent($, 'meta[name="description"]') !== route.description) {
    fail(`${route.path}: description does not match route contract`);
  }
  if (metaContent($, 'meta[name="robots"]') !== robots) {
    fail(`${route.path}: robots meta must be "${robots}"`);
  }
  if ($('link[rel="canonical"]').attr("href") !== canonical) {
    fail(`${route.path}: canonical must be ${canonical}`);
  }
  if ($("h1").length !== 1) fail(`${route.path}: expected exactly one h1`);

  const expectedMetadata = [
    ['meta[property="og:type"]', "website"],
    ['meta[property="og:site_name"]', "PersonalClaw"],
    ['meta[property="og:title"]', route.title],
    ['meta[property="og:description"]', route.description],
    ['meta[property="og:url"]', canonical],
    ['meta[property="og:image"]', `${siteOrigin}/brand/social-preview.png`],
    ['meta[name="twitter:card"]', "summary_large_image"],
    ['meta[name="twitter:title"]', route.title],
    ['meta[name="twitter:description"]', route.description],
    ['meta[name="twitter:image"]', `${siteOrigin}/brand/social-preview.png`]
  ];
  for (const [selector, expected] of expectedMetadata) {
    if (metaContent($, selector) !== expected) {
      fail(`${route.path}: ${selector} must equal "${expected}"`);
    }
  }

  const jsonLdScripts = $('script[type="application/ld+json"]');
  if (jsonLdScripts.length !== 1) {
    fail(`${route.path}: expected exactly one JSON-LD document`);
  } else {
    try {
      const jsonLd = JSON.parse(jsonLdScripts.text());
      if (jsonLd["@type"] !== "WebPage") fail(`${route.path}: JSON-LD type must be WebPage`);
      if (jsonLd.url !== canonical) fail(`${route.path}: JSON-LD URL must match canonical`);
      if (jsonLd.isPartOf?.url !== `${siteOrigin}/`) {
        fail(`${route.path}: JSON-LD website URL must be ${siteOrigin}/`);
      }
    } catch (error) {
      fail(`${route.path}: invalid JSON-LD (${error.message})`);
    }
  }

  for (const image of $("img").toArray()) {
    const width = Number($(image).attr("width"));
    const height = Number($(image).attr("height"));
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      fail(`${route.path}: image "${$(image).attr("src")}" needs explicit dimensions`);
    }
  }

  for (const anchor of $("a[href]").toArray()) {
    const href = $(anchor).attr("href");
    if (!href) continue;
    await validateInternalUrl(href, route.path, "link", true);
    if ($(anchor).attr("target") === "_blank") {
      const rel = new Set(($(anchor).attr("rel") ?? "").split(/\s+/));
      if (!rel.has("noreferrer") && !rel.has("noopener")) {
        fail(`${route.path}: target="_blank" link must prevent opener access: "${href}"`);
      }
    }
  }

  const resources = [
    ...$("script[src]").toArray().map((element) => $(element).attr("src")),
    ...$("img[src]").toArray().map((element) => $(element).attr("src")),
    ...$('link[rel="icon"], link[rel="stylesheet"], link[rel="preload"], link[rel="modulepreload"]')
      .toArray()
      .map((element) => $(element).attr("href"))
  ].filter(Boolean);
  for (const resource of resources) {
    await validateInternalUrl(resource, route.path, "resource");
  }

  const srcsetValues = [
    ...$("img[srcset]").toArray().map((element) => $(element).attr("srcset")),
    ...$("source[srcset]").toArray().map((element) => $(element).attr("srcset"))
  ].filter(Boolean);
  for (const srcset of srcsetValues) {
    for (const candidate of srcset.split(",").map((item) => item.trim().split(/\s+/)[0])) {
      await validateInternalUrl(candidate, route.path, "srcset resource");
    }
  }
}

const sitemapIndexPath = path.join(distDir, "sitemap-index.xml");
if (!(await exists(sitemapIndexPath))) {
  fail("missing sitemap-index.xml");
} else {
  const sitemapIndex$ = load(await readFile(sitemapIndexPath, "utf8"), { xmlMode: true });
  const sitemapUrls = sitemapIndex$("loc")
    .toArray()
    .map((element) => sitemapIndex$(element).text().trim());
  if (sitemapUrls.length === 0) fail("sitemap index contains no child sitemaps");

  const publishedUrls = new Set();
  for (const sitemapUrl of sitemapUrls) {
    const parsed = new URL(sitemapUrl);
    const sitemapPath = path.join(distDir, parsed.pathname.slice(1));
    if (!(await exists(sitemapPath))) {
      fail(`sitemap index references missing file ${parsed.pathname}`);
      continue;
    }
    const sitemap$ = load(await readFile(sitemapPath, "utf8"), { xmlMode: true });
    for (const element of sitemap$("url > loc").toArray()) {
      publishedUrls.add(sitemap$(element).text().trim().replace(/\/$/, "") || siteOrigin);
    }
  }

  const expectedUrls = new Set(
    routes.map((route) => canonicalUrl(route.path).replace(/\/$/, "") || siteOrigin)
  );
  if (
    publishedUrls.size !== expectedUrls.size ||
    [...expectedUrls].some((url) => !publishedUrls.has(url))
  ) {
    fail(`sitemap routes differ: expected ${[...expectedUrls].join(", ")}, got ${[...publishedUrls].join(", ")}`);
  }
}

const robotsPath = path.join(distDir, "robots.txt");
if (!(await exists(robotsPath))) {
  fail("missing robots.txt");
} else {
  const robots = await readFile(robotsPath, "utf8");
  if (expectNoIndex) {
    if (!/^Disallow: \/$/m.test(robots)) fail("preview robots.txt must disallow all crawling");
  } else {
    if (!/^Allow: \/$/m.test(robots)) fail("production robots.txt must allow crawling");
    if (!robots.includes(`Sitemap: ${siteOrigin}/sitemap-index.xml`)) {
      fail("production robots.txt must name the canonical sitemap");
    }
  }
}

const trackerPatterns = [
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /plausible\.io/i,
  /cdn\.segment\.com/i,
  /api\.segment\.io/i,
  /posthog/i,
  /mixpanel/i,
  /hotjar/i,
  /clarity\.ms/i,
  /connect\.facebook\.net/i
];

async function scanTextFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scanTextFiles(entryPath);
      continue;
    }
    if (!/\.(?:css|html|js|json|txt|xml)$/.test(entry.name)) continue;
    const content = await readFile(entryPath, "utf8");
    for (const pattern of trackerPatterns) {
      if (pattern.test(content)) {
        fail(`tracker signature ${pattern} found in ${path.relative(root, entryPath)}`);
      }
    }
  }
}

await scanTextFiles(distDir);

const vercel = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8"));
if (vercel.framework !== "astro") fail('vercel.json framework must be "astro"');
if (vercel.buildCommand !== "npm run build") fail('vercel.json must use "npm run build"');
if (vercel.outputDirectory !== "dist") fail('vercel.json outputDirectory must be "dist"');
const securityHeaders = new Set(
  (vercel.headers ?? []).flatMap((rule) => (rule.headers ?? []).map((header) => header.key))
);
for (const header of [
  "Cross-Origin-Opener-Policy",
  "Permissions-Policy",
  "Referrer-Policy",
  "X-Content-Type-Options",
  "X-Frame-Options"
]) {
  if (!securityHeaders.has(header)) fail(`vercel.json is missing ${header}`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${routes.length} routes in ${path.relative(root, distDir)} (${expectNoIndex ? "preview" : "production"} policy).`
  );
}
