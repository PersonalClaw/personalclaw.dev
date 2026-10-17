// The CI contract: the runner properties every workflow job must hold, checked over the
// files as committed. It reads the workflows through tests/support/workflows.mjs, the
// reader the supply-chain check (tests/support/supply-chain.mjs) shares; the pin rules
// (action SHAs, image digests, packageManager and the Node pins) live there. `checkContract`
// returns one violation per broken property and never throws on bad input, so a
// malformed file reads as a failure rather than as a crash or a pass.
// tests/ci-contract.test.mjs runs it on the repository and plants one violation per row.
import { parseWorkflows, readWorkflowFiles, stepLabel } from "./workflows.mjs";

export const IDENTITY_STEP = "Record runner identity";
export const IDENTITY_VARIABLES = ["ImageOS", "ImageVersion", "RUNNER_ARCH"];

export function loadRepository(root) {
  return { workflows: readWorkflowFiles(root) };
}

export function checkContract({ workflows }) {
  const violations = [];
  const fail = (rule, where, message) => violations.push({ rule, where, message });

  for (const workflow of parseWorkflows(workflows ?? {})) {
    for (const problem of workflow.problems) fail("workflow-shape", problem.where, problem.message);

    for (const job of workflow.jobs) {
      const where = `${workflow.name} ${job.id}`;
      // A job that calls a reusable workflow runs no steps of its own here.
      if (job.uses) continue;

      if (!job.runsOn) {
        fail("runner-label", where, "job has no runs-on");
      } else if (/-latest\b/.test(job.runsOn) || job.runsOn.includes("${{")) {
        fail("runner-label", where, `runs-on must name a fixed image, found ${job.runsOn}`);
      }

      const first = job.steps[0];
      const identity = first?.name === IDENTITY_STEP ? (first.run ?? "") : null;
      if (identity === null) {
        fail("identity-step", where, `the first step must be "${IDENTITY_STEP}"`);
      } else {
        const missing = IDENTITY_VARIABLES.filter((name) => !identity.includes(`-z "\${${name}`));
        if (missing.length > 0 || !/\bexit 1\b/.test(identity)) {
          fail("identity-step", where, `"${IDENTITY_STEP}" must fail when ${IDENTITY_VARIABLES.join(", ")} is empty`);
        }
      }

      for (const step of job.steps) {
        if (!/^actions\/setup-node@/.test(step.uses?.reference ?? "")) continue;
        if (step.with["node-version-file"] !== ".node-version" || step.with["node-version"] !== undefined) {
          fail("setup-node-file", stepLabel(workflow, job, step), "setup-node must read node-version-file: .node-version");
        }
      }
    }
  }
  return violations;
}
