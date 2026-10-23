// What the site says about the product, held to the verification ledger (#98).
//
// The ledger is /compare's matrix (src/data/capabilities.json). This holds four things to it:
//
//   - Home's questions answer in the rows' own words, and the FAQPage publishes exactly them;
//   - an answer refuses a row not verified at the pinned release (it is a known limit, which
//     /compare lists apart), as `ledgerRow` does;
//   - a page's descriptions and structured data say nothing a `partial` or `no` row says does
//     not hold;
//   - a section of any hand-authored page that talks about a row's subject links its evidence,
//     the row or a file at the pinned release.
//
// Each rule is planted against and fails by name.

import assert from "node:assert/strict";
import test from "node:test";

import { capabilityMatrix } from "../src/data/capabilities.mjs";
import { answerText, homeQuestions, paragraphText } from "../src/data/faq.mjs";
import {
  faqParityProblems,
  headClaimProblems,
  pageClaimProblems,
  pinnedEvidencePrefixes,
  supportSentenceProblems
} from "../scripts/product-claims.mjs";

const matrix = capabilityMatrix();
const version = matrix.release.version;
const categories = [{ name: "Models", apps: 3 }];

test("Home's answers are the rows' own statements", () => {
  const questions = homeQuestions({ matrix, categories });
  const phone = questions.find((q) => q.id === "phone-home");
  const telemetry = matrix.rows.find((row) => row.id === "telemetry");
  assert.equal(paragraphText(phone.answer[0]), telemetry.statement);
  assert.ok(questions.length >= 5, "Home asks its questions");
  for (const question of questions) {
    assert.ok(answerText(question).length > 0, `${question.id} has an answer`);
    assert.doesNotMatch(answerText(question), /<\/?[a-z]/i, `${question.id}'s answer carries no markup`);
  }
});

test("an answer refuses a row not verified at the pinned release", () => {
  const stale = {
    ...matrix,
    rows: matrix.rows.map((row) =>
      row.id === "telemetry" ? { ...row, verifiedRelease: "v0.1.0", current: false } : row
    )
  };
  assert.throws(() => homeQuestions({ matrix: stale, categories }), /telemetry/);
});

const page = ({ head = "", main = "" }) =>
  `<!doctype html><html><head>${head}</head><body><main>${main}</main></body></html>`;
const graph = (nodes) => `<script type="application/ld+json">${JSON.stringify({ "@graph": nodes })}</script>`;

test("a description or structured data broader than a row fails, and the row's own words pass", () => {
  const telemetry = matrix.rows.find((row) => row.id === "telemetry");
  assert.ok(["partial", "no"].includes(telemetry.verdict), "the telemetry row is narrower than its claim");
  const wide = headClaimProblems(
    page({ head: `<meta name="description" content="PersonalClaw sends no telemetry at all.">` }),
    matrix.rows,
    { route: "/x" }
  );
  assert.ok(wide.some((p) => /\/x says "no telemetry" in its description/.test(p)), wide.join("\n"));

  const inGraph = headClaimProblems(
    page({ head: graph([{ "@type": "SoftwareApplication", description: "A local agent with no telemetry." }]) }),
    matrix.rows,
    { route: "/" }
  );
  assert.ok(inGraph.some((p) => /in its structured data \(description\)/.test(p)), inGraph.join("\n"));

  const ownWords = headClaimProblems(
    page({ head: graph([{ "@type": "Answer", text: telemetry.statement }]) }),
    matrix.rows,
    { route: "/" }
  );
  assert.deepEqual(ownWords, []);
});

test("a section that talks about a row's subject links its evidence, the row or the pinned file", () => {
  const evidence = pinnedEvidencePrefixes(matrix.release);
  const section = (links) =>
    page({ main: `<section><p>Webhooks reach programs on this machine.</p>${links}</section>` });
  const bare = pageClaimProblems(section(""), matrix.rows, { route: "/apps", evidence });
  assert.ok(bare.some((p) => /\/apps mentions "webhook" without citing \/compare#webhooks/.test(p)), bare.join("\n"));

  for (const link of [
    `<a href="/compare#webhooks">the row</a>`,
    `<a href="${matrix.release.repo}/blob/${version}/src/personalclaw/inbound/webhook.py">the code</a>`,
    `<a href="${matrix.release.repo}/blob/${matrix.release.commit}/src/personalclaw/inbound/webhook.py">the code</a>`
  ]) {
    assert.deepEqual(pageClaimProblems(section(link), matrix.rows, { route: "/apps", evidence }), [], link);
  }
  const branch = `<a href="${matrix.release.repo}/blob/main/src/personalclaw/inbound/webhook.py">the code</a>`;
  assert.notDeepEqual(
    pageClaimProblems(section(branch), matrix.rows, { route: "/apps", evidence }),
    [],
    "a link to a branch is no pinned evidence"
  );
});

test("an /apps card's words are evidenced by its own built sheet, and nothing else leans on a sheet", () => {
  const built = new Set(["/registry/web-hooks", "/registry/other-app"]);
  const sheets = { exists: (sheet) => built.has(sheet) };
  const card = (slug, href) =>
    `<article class="app-card" data-app-card="${slug}"><h2><a href="${href}">${slug}</a></h2>` +
    "<p>Webhooks reach programs on this machine.</p></article>";
  const apps = (main) => pageClaimProblems(page({ main }), matrix.rows, { route: "/apps", evidence: [], sheets });
  assert.deepEqual(apps(card("web-hooks", "/registry/web-hooks")), [], "its own sheet, built, is its evidence");
  assert.ok(apps(card("web-hooks", "/registry/other-app")).some((p) => /mentions "webhook"/.test(p)), "another app's sheet is not");
  assert.ok(apps(card("gone-app", "/registry/gone-app")).some((p) => /mentions "webhook"/.test(p)), "a sheet the build lacks is not");
  const hero = '<section class="apps-hero"><p>Webhooks reach programs on this machine.</p><a href="/registry/web-hooks">a sheet</a></section>';
  assert.ok(apps(hero).some((p) => /mentions "webhook"/.test(p)), "text outside the cards gets no sheet evidence");
  assert.ok(
    pageClaimProblems(page({ main: card("web-hooks", "/registry/web-hooks") }), matrix.rows, { route: "/apps", evidence: [] })
      .some((p) => /mentions "webhook"/.test(p)),
    "a page given no sheets has no sheet evidence"
  );
});

test("Home's FAQPage says exactly what its visible questions say", () => {
  const details = (name, text) =>
    `<details data-faq="q"><summary>${name}</summary><p data-faq-answer>${text}</p><p><a href="/compare#telemetry">row</a></p></details>`;
  const faq = (questions) => graph([
    {
      "@type": "FAQPage",
      mainEntity: questions.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } }))
    }
  ]);
  const same = page({ head: faq([["Does it phone home?", "It asks GitHub."]]), main: details("Does it phone home?", "It asks GitHub.") });
  assert.deepEqual(faqParityProblems(same), []);

  const drifted = page({ head: faq([["Does it phone home?", "Never."]]), main: details("Does it phone home?", "It asks GitHub.") });
  assert.match(faqParityProblems(drifted).join("\n"), /answers "Does it phone home\?" differently from its FAQPage/);

  const missing = page({ main: details("Does it phone home?", "It asks GitHub.") });
  assert.deepEqual(faqParityProblems(missing), ["/ shows questions but its structured data has no FAQPage"]);
});

test("a page may quote a claim to narrow it, but not state it", () => {
  const main = (body) => page({ main: `<section>${body}</section>` });
  const problems = (body) =>
    pageClaimProblems(main(body), matrix.rows, { route: "/security" }).filter((p) => / says "/.test(p));
  const stated = problems("<p>Zero telemetry.</p>");
  assert.match(stated.join("\n"), /\/security says "Zero telemetry\.", which \/compare row `telemetry`/);

  assert.deepEqual(problems("<p>“Zero telemetry.” Cut to what the release checks.</p>"), [], "quoted");
  assert.deepEqual(problems("<p><q>Zero telemetry.</q> Cut.</p>"), [], "in <q>");
  const card = (row, link) =>
    `<ul><li data-trust-row="${row}"><p>Zero telemetry. Narrower than it sounds.</p><p><a href="/compare#${link}">row</a></p></li></ul>`;
  assert.deepEqual(problems(card("telemetry", "telemetry")), [], "the card names its row and links it");
  assert.notDeepEqual(problems(card("telemetry", "webhooks")), [], "a card that links another row");
  assert.notDeepEqual(problems(card("webhooks", "telemetry")), [], "a card named for another row");
  const callout = (row, link) =>
    `<ul><li data-blog-claim="${row}"><a href="/compare#${link}">Zero telemetry.</a> <span>Narrower than it sounds</span></li></ul>`;
  assert.deepEqual(problems(callout("telemetry", "telemetry")), [], "a post's callout lists its row's claim");
  assert.notDeepEqual(problems(callout("telemetry", "webhooks")), [], "a callout entry that links another row");
});

test("a page carries one headline and one factual support sentence under it, one sentence long", () => {
  const hero = (support, extra = "") =>
    page({ main: `<section><h1>Bring the providers you choose.</h1>${support}</section>${extra}` });
  assert.deepEqual(
    supportSentenceProblems(hero("<p data-support>Models and search are apps you install.</p>"), { route: "/apps" }),
    []
  );
  assert.match(
    supportSentenceProblems(hero("<p data-support>Models are apps. Install what you need.</p>"), { route: "/apps" }).join(),
    /\/apps's support sentence is 2 sentences, not one/
  );
  assert.deepEqual(supportSentenceProblems(hero("<p>Models are apps.</p>"), { route: "/apps" }), [
    "/apps has 0 support sentences ([data-support]), not one"
  ]);
  assert.match(
    supportSentenceProblems(hero("", "<section><p data-support>Models are apps.</p></section>"), { route: "/apps" }).join(),
    /not in its headline's section/
  );
  assert.deepEqual(
    supportSentenceProblems(hero("<p data-support>One.</p>", "<h1>Two</h1>"), { route: "/apps" }),
    ["/apps has 2 h1 headlines, not one"]
  );
});
