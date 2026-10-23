// Home's questions (#88), as data: the page renders them and the structured data publishes
// them as a `FAQPage` (src/data/structured-data.ts, #98), from this one list, so the visible
// answers and the ones a search engine or an assistant reads cannot disagree.
//
// An answer that a /compare row covers is that row's statement, in its own words, through
// `ledgerRow`: it says no more than the row the matrix checked at the pin, and the build refuses
// a row not verified at the pinned release, or one that does not list Home among its surfaces.
//
// .mjs, not .ts: tests/faq.test.mjs imports it from a bare node process.

import { ledgerRow } from "./capabilities.mjs";

/**
 * @typedef {string | { code: string } | { kbd: string }} Segment
 * @typedef {{ id: string, question: string, answer: Segment[][], links: { href: string, label: string }[] }} Question
 */

/**
 * Home's questions and answers, from the /compare matrix (`capabilityMatrix()`) and the pinned
 * apps' categories (`releaseFacts.apps.categories`).
 *
 * @param {{ matrix: import("./capabilities.mjs").Matrix, categories: { name: string, apps: number }[] }} facts
 * @returns {Question[]}
 */
export function homeQuestions({ matrix, categories }) {
  const says = (id) => ledgerRow(id, "home", matrix).statement;
  const models = categories.find((category) => category.name === "Models");
  if (!models) throw new Error("src/data/faq.mjs: the pinned apps have no Models category");
  const modelsApps = models.apps;
  return [
    {
      id: "phone-home",
      question: "Does it phone home?",
      answer: [[says("telemetry")], [says("disable_update_check")]],
      links: [
        { href: "/compare#telemetry", label: "The telemetry row" },
        { href: "/compare#disable_update_check", label: "the update check row" }
      ]
    },
    {
      id: "local",
      question: "What runs locally?",
      answer: [
        [
          "The gateway, the dashboard and everything under ",
          { code: "~/.personalclaw" },
          `. ${says("local_models")}`
        ]
      ],
      links: [{ href: "/compare#local_models", label: "The local models row" }]
    },
    {
      id: "models",
      question: "Which models work?",
      answer: [
        [
          `Any model a Models app connects, hosted or on your own machine. ${modelsApps} Models apps ship at this release.`
        ]
      ],
      links: [{ href: "/apps?category=models", label: "The Models apps" }]
    },
    {
      id: "docker",
      question: "Do I need Docker?",
      answer: [
        [
          "No. The installer uses ",
          { code: "uv" },
          " and brings its own Python. Docker Compose is one of the other ways to run it."
        ]
      ],
      links: [{ href: "/docs/guides/getting-started", label: "The install guide" }]
    },
    {
      id: "breaks",
      question: "What can break between releases?",
      answer: [[says("data_stability")], [says("backup_export")]],
      links: [
        { href: "/compare#data_stability", label: "The data stability row" },
        { href: "/compare#backup_export", label: "the backup row" }
      ]
    },
    {
      id: "approvals",
      question: "How do approvals work?",
      answer: [
        [
          "A tool that needs your say waits for it: Allow or Deny on the approval, or ",
          { kbd: "Cmd" },
          " ",
          { kbd: "Enter" },
          " (",
          { kbd: "Ctrl" },
          " ",
          { kbd: "Enter" },
          " off a Mac) on the one that has keyboard focus, and the riskiest actions ask once more."
        ]
      ],
      links: [{ href: "/security", label: "The security model" }]
    }
  ];
}

/** A segment's text, as a reader sees it. */
export function segmentText(segment) {
  if (typeof segment === "string") return segment;
  return "code" in segment ? segment.code : segment.kbd;
}

/** One answer paragraph's text. */
export function paragraphText(paragraph) {
  return paragraph.map(segmentText).join("");
}

/** A question's whole answer as plain text, paragraph by paragraph: what the `FAQPage` says. */
export function answerText(question) {
  return question.answer.map(paragraphText).join(" ");
}
