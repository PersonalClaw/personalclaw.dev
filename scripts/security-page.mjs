// What /security must hold to: every control cites the file that enforces it, at the release tag;
// the boundary table has one row per boundary with its five columns; the known limits come before
// the controls and name the release they were verified against; and each limit points at the
// /compare row or the section of core's limitations page that states it in full.
//
// THE FAILURE THIS EXISTS TO CATCH. A security page reads as true whether or not it cites
// anything: a numbered grid of seven confident cards passed every gate here while it linked no
// file at all (docs/site-audit.md, S3), and one of its cards said more than the code does (S1).
// A citation is mechanically checkable, so the page carries one for every control and this
// refuses a control without one, or with one into a branch rather than the pinned tag, where a
// file can say what the released build does not.
//
// THE SECOND FAILURE. A limit is only a limit while its source still says so. A limit that
// points at a /compare row whose verdict became `yes` is a limit the page no longer has, and a
// limit whose row was renamed points nowhere; both are refused. Limits near the top (S2) is held
// by document order: the limits section comes before the controls.
//
// scripts/validate-security-render.mjs runs both checks after a build, on src/data/security.json
// read directly and the page the build wrote; tests/security-page.test.mjs plants each failure.
// Pure apart from parsing the page, so neither needs a build of its own.
//
// WHAT IT CANNOT CLOSE. Whether a cited file says what the row says. That is a human check with
// `git show <tag>:<path>`, which is why every row carries its link and the date it was read.

import { load } from "cheerio";

/** The columns of the boundary table, in order, as its header cells read. */
export const BOUNDARY_COLUMNS = ["Boundary", "Responsibility", "Enforcement", "Evidence", "Known limit"];

/** The verdicts a /compare row may have for a limit to point at it: it does not hold, or holds narrower. */
const LIMIT_VERDICTS = new Set(["partial", "no"]);

/** The in-site page whose sections a limit may point at instead of a /compare row. */
const LIMITATIONS_PATH = "/docs/security/limitations";

/** Where every source link must point: core's tree at the pinned tag. */
export function blobBase(repository, tag) {
  return `https://github.com/${repository}/blob/${tag}/`;
}

function pinned(url, base) {
  return typeof url === "string" && url.startsWith(base) && url.length > base.length;
}

/** What is wrong with what src/data/security.json declares. */
export function declaredSecurityProblems(data, { repository, tag, compareRows }) {
  const problems = [];
  const base = blobBase(repository, tag);
  const verdicts = new Map((compareRows ?? []).map((row) => [row.id, row.verdict]));
  if (data?.release !== tag) {
    problems.push(`src/data/security.json was read at ${data?.release}, but the site pins ${tag}: re-read every row at the tag`);
  }
  const controls = Array.isArray(data?.controls) ? data.controls : [];
  if (controls.length === 0) problems.push("src/data/security.json declares no controls");
  const seen = new Set();
  for (const [index, control] of controls.entries()) {
    const name = control?.id ?? `control ${index + 1}`;
    if (!control?.id) problems.push(`control ${index + 1} has no id`);
    else if (seen.has(control.id)) problems.push(`two controls share the id ${control.id}`);
    seen.add(control?.id);
    for (const field of ["name", "statement", "source_label", "retrieved"]) {
      if (!control?.[field]) problems.push(`control ${name} has no ${field}`);
    }
    if (!control?.source_url) problems.push(`control ${name} has no source link`);
    else if (!pinned(control.source_url, base)) {
      problems.push(`control ${name} cites ${control.source_url}, which is not under ${base}`);
    }
  }
  const boundaries = Array.isArray(data?.boundaries) ? data.boundaries : [];
  const views = new Set((data?.views ?? []).map((view) => view.id));
  for (const view of ["authority", "network"]) {
    if (!views.has(view)) problems.push(`src/data/security.json has no ${view} view`);
    const crossings = boundaries.filter((boundary) => boundary.view === view).length;
    if (crossings === 0) problems.push(`the ${view} view crosses no boundary`);
    const zones = (data?.views ?? []).find((candidate) => candidate.id === view)?.zones ?? [];
    // The map draws a zone, then each boundary it crosses into the next zone; a hub draws its one
    // zone, then each boundary between it and the others. Either way n crossings meet n + 1 zones.
    if (views.has(view) && zones.length !== crossings + 1) {
      problems.push(`the ${view} view has ${zones.length} zones for ${crossings} boundaries; a map of n crossings has n + 1 zones`);
    }
  }
  // THE NETWORK VIEW IS A HUB. Every network boundary is between the gateway and something outside
  // it. Drawn as a line, the guard between an app and the internet read as if an app's backend
  // traffic passed it, which it never does (the gateway-to-internet row's limit).
  const network = (data?.views ?? []).find((view) => view.id === "network");
  if (network && network.layout !== "hub") {
    problems.push("the network view is drawn as a line: each of its boundaries is between the gateway and one other zone, so it is a hub");
  }
  for (const view of data?.views ?? []) {
    if (view.layout === "hub" && !(view.zones ?? []).some((zone) => zone.id === view.hub)) {
      problems.push(`the ${view.id} view's hub ${view.hub} is none of its zones`);
    }
  }
  for (const [index, boundary] of boundaries.entries()) {
    const name = boundary?.id ?? `boundary ${index + 1}`;
    for (const field of ["name", "crossing", "responsibility", "status", "evidence_label", "limit", "limit_href"]) {
      if (!boundary?.[field]) problems.push(`boundary ${name} has no ${field}`);
    }
    if (!views.has(boundary?.view)) problems.push(`boundary ${name} names no view the page has`);
    if (!pinned(boundary?.evidence_url, base)) {
      problems.push(`boundary ${name} cites ${boundary?.evidence_url}, which is not under ${base}`);
    }
    problems.push(...limitHrefProblems(`boundary ${name}`, boundary?.limit_href, verdicts));
  }
  const limits = Array.isArray(data?.limits) ? data.limits : [];
  if (limits.length === 0) problems.push("src/data/security.json declares no known limits");
  for (const [index, limit] of limits.entries()) {
    const name = limit?.id ?? `limit ${index + 1}`;
    if (!limit?.statement) problems.push(`limit ${name} says nothing`);
    if (limit?.compare) {
      const verdict = verdicts.get(limit.compare);
      if (verdict === undefined) problems.push(`limit ${name} points at /compare#${limit.compare}, which is no row`);
      else if (!LIMIT_VERDICTS.has(verdict)) {
        problems.push(`limit ${name} points at /compare#${limit.compare}, whose verdict is ${verdict}: it is no longer a limit`);
      }
    } else problems.push(...limitHrefProblems(`limit ${name}`, limit?.href, verdicts));
  }
  return problems;
}

function limitHrefProblems(what, href, verdicts) {
  if (typeof href !== "string" || href === "") return [`${what} points at no source for its limit`];
  if (href.startsWith("/compare#")) {
    const id = href.slice("/compare#".length);
    const verdict = verdicts.get(id);
    if (verdict === undefined) return [`${what} points at ${href}, which is no row`];
    if (!LIMIT_VERDICTS.has(verdict)) return [`${what} points at ${href}, whose verdict is ${verdict}: it is no longer a limit`];
    return [];
  }
  if (href.startsWith(`${LIMITATIONS_PATH}#`)) return [];
  return [`${what} points at ${href}: a limit's source is a /compare row or a section of ${LIMITATIONS_PATH}`];
}

/** The fragments a limit points at on the limitations page, to check against that page's ids. */
export function limitationAnchors(data) {
  const hrefs = [
    ...(data?.boundaries ?? []).map((boundary) => boundary.limit_href),
    ...(data?.limits ?? []).filter((limit) => !limit.compare).map((limit) => limit.href),
  ];
  return [...new Set(hrefs.filter((href) => href?.startsWith(`${LIMITATIONS_PATH}#`)).map((href) => href.split("#")[1]))];
}

/** What is wrong with the page the build wrote, against the data it was rendered from. */
export function renderedSecurityProblems(html, data, { repository, tag, limitationIds }) {
  const problems = [];
  const $ = load(html);
  const base = blobBase(repository, tag);

  const controls = $("[data-control]");
  const declared = (data?.controls ?? []).map((control) => control.id);
  const rendered = controls.map((_, element) => $(element).attr("data-control")).get();
  if (rendered.length === 0) problems.push("/security renders no control rows");
  if (JSON.stringify(rendered) !== JSON.stringify(declared)) {
    problems.push(`/security renders the controls ${JSON.stringify(rendered)}, but the data declares ${JSON.stringify(declared)}`);
  }
  controls.each((_, element) => {
    const id = $(element).attr("data-control");
    const control = (data?.controls ?? []).find((candidate) => candidate.id === id);
    const links = $(element).find("a[href]").map((__, link) => $(link).attr("href")).get();
    if (links.length === 0) problems.push(`the control ${id} on /security links no file`);
    else if (!links.some((href) => pinned(href, base))) problems.push(`the control ${id} on /security links nothing under ${base}`);
    if (control && !links.includes(control.source_url)) problems.push(`the control ${id} on /security does not link ${control.source_url}`);
  });

  const table = $("table[data-boundaries]");
  if (table.length !== 1) problems.push(`/security has ${table.length} boundary tables, where it should have one`);
  const header = table.find("thead th").map((_, cell) => $(cell).text().trim()).get();
  if (JSON.stringify(header) !== JSON.stringify(BOUNDARY_COLUMNS)) {
    problems.push(`the boundary table's columns are ${JSON.stringify(header)}, not ${JSON.stringify(BOUNDARY_COLUMNS)}`);
  }
  const rows = table.find("tbody tr[data-boundary]");
  const boundaryIds = rows.map((_, row) => $(row).attr("data-boundary")).get();
  const declaredBoundaries = (data?.boundaries ?? []).map((boundary) => boundary.id);
  if (JSON.stringify(boundaryIds) !== JSON.stringify(declaredBoundaries)) {
    problems.push(`the boundary table's rows are ${JSON.stringify(boundaryIds)}, but the data declares ${JSON.stringify(declaredBoundaries)}`);
  }
  rows.each((_, row) => {
    const cells = $(row).children("th, td");
    const id = $(row).attr("data-boundary");
    if (cells.length !== BOUNDARY_COLUMNS.length) problems.push(`the boundary row ${id} has ${cells.length} cells`);
    const evidence = $(row).find("a[href]").map((__, link) => $(link).attr("href")).get();
    if (!evidence.some((href) => pinned(href, base))) problems.push(`the boundary row ${id} links no evidence under ${base}`);
  });

  const limits = $("#limits");
  const controlsSection = $("#controls");
  if (limits.length !== 1) problems.push("/security has no #limits section");
  if (controlsSection.length !== 1) problems.push("/security has no #controls section");
  if (limits.length === 1 && controlsSection.length === 1) {
    const order = $("#limits, #controls").map((_, element) => $(element).attr("id")).get();
    if (order[0] !== "limits") problems.push("/security puts its controls before its known limits");
    if (!limits.text().includes(tag)) problems.push(`the known limits on /security do not name the release they were verified against (${tag})`);
  }
  const limitRows = limits.find("[data-limit]").map((_, element) => $(element).attr("data-limit")).get();
  const declaredLimits = (data?.limits ?? []).map((limit) => limit.id);
  if (JSON.stringify(limitRows) !== JSON.stringify(declaredLimits)) {
    problems.push(`/security lists the limits ${JSON.stringify(limitRows)}, but the data declares ${JSON.stringify(declaredLimits)}`);
  }
  if (limitationIds) {
    for (const anchor of limitationAnchors(data)) {
      if (!limitationIds.has(anchor)) problems.push(`${LIMITATIONS_PATH}#${anchor} is no section of the limitations page`);
    }
  }

  const core = `https://github.com/${repository}/`;
  $("a[href]").each((_, link) => {
    const href = $(link).attr("href");
    if (href?.startsWith(`${core}blob/`) && !href.startsWith(base) && !/\/blob\/[0-9a-f]{40}\//.test(href)) {
      problems.push(`/security links ${href}, which is neither the pinned tag nor a commit`);
    }
  });
  return problems;
}
