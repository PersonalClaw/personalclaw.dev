// The rule behind safe installation (SITE-REDESIGN.md section 5.3): no page offers a command that runs
// a download without saving it first, where nobody can read or check it. scripts/validate-build.mjs
// applies it to every copy block, code block and copy button the build emits; the site's own path is
// two steps, `curl -fsSLO https://personalclaw.dev/install` and then `sh install`.
//
// "Runs a download unseen" covers each way a shell can do that in one line:
// - a pipe into a shell or an interpreter: `curl … | sh`, `wget -qO- … | sudo bash -s --`, `| python3`;
// - process substitution: `sh <(curl …)`, `bash <(wget …)`, `source <(curl …)`, `. <(curl …)`;
// - command substitution handed to a shell or eval: `bash -c "$(curl …)"`, `eval "$(wget …)"`, and
//   the backtick spelling;
// - a download chained to a run in the same line: `curl -fsSLO … && sh install`, which skips the step
//   where the file is checked.

const DOWNLOAD = String.raw`\b(?:curl|wget)\b`;
// A shell or interpreter, optionally behind sudo (with its flags) or env assignments.
const RUNNER = String.raw`(?:sudo(?:\s+-\S+)*\s+)?(?:env\s+(?:\S+=\S*\s+)*)?(?:(?:ba|z|da|k|fi|c|tc)?sh|python[0-9.]*|perl|ruby|node|deno|bun)\b`;

const RULES = [
  { form: "a pipe into a shell", pattern: new RegExp(String.raw`${DOWNLOAD}[^|\n]*\|\s*${RUNNER}`) },
  {
    form: "process substitution",
    pattern: new RegExp(String.raw`(?:${RUNNER}|\bsource\b|(?:^|[\s;&|(])\.)(?:\s+-\S+)*\s*<\(\s*${DOWNLOAD}`)
  },
  {
    form: "command substitution",
    pattern: new RegExp(String.raw`(?:${RUNNER}(?:\s+-\S+)*\s+-c|\beval)\s+["']?(?:\$\(|\x60)\s*${DOWNLOAD}`)
  },
  { form: "a download chained to a run", pattern: new RegExp(String.raw`${DOWNLOAD}[^\n]*?(?:&&|\|\||;)\s*${RUNNER}`) }
];

/**
 * How a command runs a download unseen, or null when it doesn't.
 *
 * @param {string} text
 * @returns {string | null}
 */
export function runsDownloadUnseen(text) {
  for (const line of text.split("\n")) {
    for (const { form, pattern } of RULES) {
      if (pattern.test(line)) return form;
    }
  }
  return null;
}
