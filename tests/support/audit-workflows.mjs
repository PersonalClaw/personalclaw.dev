// The shape of the dependency audit's two workflows, checked over the files as committed
// through the shared reader (tests/support/workflows.mjs). Website CI's `audit` job runs
// the audit on every pull request and main run; audit.yml runs it nightly on main and
// reports it through one issue. `checkAuditWorkflows` returns one violation per broken
// property (rule `dependency-audit`, or `workflow-shape` for a file the reader rejects)
// and never throws. tests/audit-lock.test.mjs runs it on the repository and plants one
// violation per row.
import { parseWorkflows, stepLabel } from "./workflows.mjs";

export const AUDIT = {
  command: "npm run audit:lock",
  ci: { workflow: "ci.yml", job: "audit", events: ["pull_request", "push"] },
  nightly: { workflow: "audit.yml", job: "audit", report: "report" },
};

// A shell form that throws the audit's exit status away.
const MASKED = /\|\|\s*(?:true|:|exit 0)\b|;\s*(?:true|exit 0)\s*$|\bset \+e\b/m;

const writes = (permissions) =>
  permissions?.kind === "write-all" ? ["write-all"] : Object.entries(permissions?.scopes ?? {}).filter(([, level]) => level === "write").map(([scope]) => scope);

function checkAuditJob(workflow, id, fail) {
  const where = `${workflow.name} ${id}`;
  const job = workflow.jobs.find((each) => each.id === id);
  if (!job) return fail(where, `${workflow.name} must have an "${id}" job that runs ${AUDIT.command}`);
  if (job.needs.length > 0) fail(where, "the audit job must not wait on another job, or a failure there skips it and the skip passes");
  if (job.if !== null) fail(where, `the audit job must run on every run, found if: ${job.if}`);
  if (typeof job.timeoutMinutes !== "number") fail(where, "the audit job must set timeout-minutes");
  if (job.continueOnError !== null && job.continueOnError !== false) fail(where, "the audit job must not set continue-on-error: its red is the point");
  const effective = job.permissions ?? workflow.permissions;
  if (writes(effective).length > 0) fail(where, `the audit job must hold no write permission, found ${writes(effective).join(", ")}`);
  const steps = job.steps.filter((step) => (step.run ?? "").includes(AUDIT.command));
  if (steps.length === 0) fail(where, `the audit job must run ${AUDIT.command}`);
  for (const step of steps) {
    const label = stepLabel(workflow, job, step);
    if (step.if !== null) fail(label, `the audit step must always run, found if: ${step.if}`);
    if (step.continueOnError !== null && step.continueOnError !== false) fail(label, "the audit step must not set continue-on-error");
    if (MASKED.test(step.run)) fail(label, `the audit step throws its exit status away: ${step.run.trim().split("\n")[0]}`);
  }
  return job;
}

export function checkAuditWorkflows({ workflows }) {
  const violations = [];
  const fail = (where, message) => violations.push({ rule: "dependency-audit", where, message });
  const parsed = new Map(parseWorkflows(workflows ?? {}).map((workflow) => [workflow.name, workflow]));

  for (const name of [AUDIT.ci.workflow, AUDIT.nightly.workflow]) {
    const workflow = parsed.get(name);
    if (!workflow) {
      fail(name, `${name} is missing`);
      continue;
    }
    if (workflow.problems.length > 0) {
      for (const problem of workflow.problems) violations.push({ rule: "workflow-shape", where: problem.where, message: problem.message });
      continue;
    }
    if (name === AUDIT.ci.workflow) {
      const missing = AUDIT.ci.events.filter((event) => !workflow.events.includes(event));
      if (missing.length > 0) fail(name, `${name} must run on ${missing.join(" and ")}, so every pull request and main run is audited`);
      checkAuditJob(workflow, AUDIT.ci.job, fail);
      continue;
    }

    // audit.yml: nightly on main, never a pull request's verdict, and one job that writes.
    if (workflow.crons.length === 0) fail(name, `${name} must run on a schedule`);
    if (!workflow.events.includes("workflow_dispatch")) fail(name, `${name} must also run on workflow_dispatch`);
    const other = workflow.events.filter((event) => !["schedule", "workflow_dispatch"].includes(event));
    if (other.length > 0) fail(name, `${name} runs on main only, found ${other.join(", ")}`);
    if (writes(workflow.permissions).length > 0) fail(`${name} permissions`, "the top of the workflow must grant no write permission; the report job holds its own");
    checkAuditJob(workflow, AUDIT.nightly.job, fail);

    const report = workflow.jobs.find((each) => each.id === AUDIT.nightly.report);
    const where = `${name} ${AUDIT.nightly.report}`;
    if (!report) {
      fail(where, `${name} must have a "${AUDIT.nightly.report}" job that opens, updates or closes the audit issue`);
    } else {
      if (!report.needs.includes(AUDIT.nightly.job)) fail(where, `the report job must declare needs: ${AUDIT.nightly.job}`);
      if (!/^\$\{\{\s*!cancelled\(\)\s*\}\}$|^!cancelled\(\)$|^\$\{\{\s*always\(\)\s*\}\}$|^always\(\)$/.test(report.if ?? "")) {
        fail(where, "the report job must run after a red audit (if: ${{ !cancelled() }}), or a red never opens the issue");
      }
      const held = writes(report.permissions);
      if (report.permissions === null || held.join(",") !== "issues") fail(where, `the report job must hold issues: write and nothing else, found ${held.join(", ") || "none"}`);
      const runsOn = (expression, verb) =>
        report.steps.some((step) => (step.if ?? "").replace(/\s+/g, "").includes(expression) && new RegExp(`\\bgh issue (?:${verb})\\b`).test(step.run ?? ""));
      if (!runsOn(`needs.${AUDIT.nightly.job}.result!='success'`, "create|comment")) fail(where, "a step must open or comment on the issue when the audit is not a success");
      if (!runsOn(`needs.${AUDIT.nightly.job}.result=='success'`, "close")) fail(where, "a step must close the issue when the audit is a success");
    }
    for (const job of workflow.jobs) {
      if (job.id === AUDIT.nightly.report) continue;
      const held = writes(job.permissions ?? workflow.permissions);
      if (held.length > 0) fail(`${name} ${job.id}`, `only the report job may write, found ${held.join(", ")}`);
    }
  }
  return violations;
}
