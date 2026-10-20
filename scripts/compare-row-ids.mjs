// The ids of the /compare rows, which make each row a link target: /compare#telemetry.
//
// A row's id is its capability key, the `id` it has in src/data/capabilities.json, never its
// position. Home's trust rows and FAQ link rows by key, so a row that moves to another group,
// or a row added above it, must not move the link. Two rows with one id, or a row whose id
// another element on the page also holds, send the link to whichever comes first, and nothing
// else in the build notices: the fragment still resolves.
//
// scripts/validate-compare-render.mjs runs both checks after a build, against the data file
// read directly and the page the build wrote; tests/compare-row-ids.test.mjs plants each
// failure. Pure apart from parsing the page, so neither needs a build of its own.

import { load } from "cheerio";

/** A capability key that works as an HTML id and as a fragment typed into a URL. */
export const ROW_ID = /^[a-z][a-z0-9_-]*$/;

/** What is wrong with the ids the data declares: one per row, usable as a fragment, unique. */
export function declaredRowIdProblems(rows) {
  const problems = [];
  const seen = new Map();
  rows.forEach((row, index) => {
    const id = row?.id;
    if (typeof id !== "string" || id === "") {
      problems.push(`row ${index + 1} in src/data/capabilities.json has no id to link it by`);
      return;
    }
    if (!ROW_ID.test(id)) {
      problems.push(
        `row id "${id}" is not a usable link target: a capability key is lower case, ` +
          `starting with a letter, with digits, "_" and "-" after it`
      );
    }
    seen.set(id, (seen.get(id) ?? 0) + 1);
  });
  for (const [id, count] of seen) {
    if (count > 1) {
      problems.push(
        `${count} rows in src/data/capabilities.json share the id "${id}", so /compare#${id} ` +
          `can only reach the first of them`
      );
    }
  }
  return problems;
}

/**
 * What is wrong with the ids on the /compare page the build wrote: every row carries its key
 * as its id, each declared row's id is on that row and on nothing else, and no id on the page
 * is repeated.
 */
export function renderedRowIdProblems(html, rows) {
  const page = load(html);
  const problems = [];
  const holders = new Map();
  for (const element of page("[id]").toArray()) {
    const id = page(element).attr("id");
    holders.set(id, [...(holders.get(id) ?? []), element]);
  }

  for (const element of page("[data-capability-row]").toArray()) {
    const key = page(element).attr("data-capability-row");
    const id = page(element).attr("id");
    if (id === undefined || id === "") {
      problems.push(`/compare renders row ${key} with no id, so /compare#${key} lands nowhere`);
    } else if (id !== key) {
      problems.push(
        `/compare renders row ${key} with the id "${id}": a row's id is its capability key, ` +
          `so a link to /compare#${key} keeps reaching it when rows move`
      );
    }
  }

  for (const row of rows) {
    const id = row?.id;
    if (typeof id !== "string" || id === "") continue;
    const found = holders.get(id) ?? [];
    if (found.length === 1 && page(found[0]).attr("data-capability-row") !== id) {
      problems.push(
        `the id "${id}" on /compare is on a <${found[0].tagName}>, not on the row ${id}`
      );
    }
  }

  for (const [id, found] of holders) {
    if (found.length > 1) {
      problems.push(
        `${found.length} elements on /compare have the id "${id}", so /compare#${id} ` +
          `lands on the first of them`
      );
    }
  }
  return problems;
}
