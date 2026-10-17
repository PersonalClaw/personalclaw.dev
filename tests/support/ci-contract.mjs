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

// The one-build shape of Website CI (see "Required checks" in README.md). The `build`
// job builds the site once and uploads it; each required job tests that build, runs
// even when `build` did not succeed (a job skipped behind a failed dependency reports
// success, so a required check would pass a broken build), and fails first, naming
// why, when it did not. The required job names are branch protection's check names,
// so they are pinned here: renaming one would leave protection waiting on a check that
// never reports.
export const SHARED_BUILD = {
  workflow: "ci.yml",
  job: "build",
  artifact: "site-build",
  gateStep: "Require the shared build",
  gateMessage: "build failed, nothing checked",
  // A cancelled build still fails the check (green or skipped would pass a run that
  // tested nothing); this message keeps the red honest about why.
  cancelledMessage: "the build was cancelled, nothing checked",
  verifyCommand: "scripts/build-record.mjs verify",
  recordCommand: "scripts/build-record.mjs write",
  required: {
    "static-contract": "Static build and publication contract",
    browser: "Browser, accessibility, privacy, and visual regression",
    performance: "Lighthouse performance budgets",
  },
};
// What a required job must not run: each one rebuilds the site, or re-syncs the data
// the build was made from.
const REBUILDS = /\bnpm run (?:build|build:site|build:preview|build:preview:site|sync|sync:[a-z]+|check|test:browser|test:lighthouse|test:visual:update|test:ci)(?=\s|$|;|&|\|)|\bastro (?:build|check)\b/;

const usesAction = (step, action) => new RegExp(`^${action}@`).test(step.uses?.reference ?? "");
const runs = (step, pattern) => pattern.test(step.run ?? "");

function checkSharedBuild(workflow, fail) {
  const where = (job) => `${workflow.name} ${job}`;
  const jobs = new Map(workflow.jobs.map((job) => [job.id, job]));
  const build = jobs.get(SHARED_BUILD.job);
  if (!build) {
    fail("shared-build", where(SHARED_BUILD.job), `${workflow.name} must have a "${SHARED_BUILD.job}" job that builds the site once for every check`);
  } else {
    if (build.needs.length > 0) fail("shared-build", where(build.id), "the build job must not wait on another job");
    if (typeof build.timeoutMinutes !== "number") fail("shared-build", where(build.id), "the build job must set timeout-minutes");
    if (!build.steps.some((step) => runs(step, /\bnpm run build(?=\s|$)/))) fail("shared-build", where(build.id), "the build job must run npm run build");
    if (!build.steps.some((step) => runs(step, new RegExp(SHARED_BUILD.recordCommand.replace(/[.]/g, "\\.")) ) || runs(step, /\bnpm run build:record\b/))) {
      fail("shared-build", where(build.id), `the build job must write the build record (${SHARED_BUILD.recordCommand})`);
    }
    const upload = build.steps.find((step) => usesAction(step, "actions/upload-artifact") && step.with.name === SHARED_BUILD.artifact);
    if (!upload) {
      fail("shared-build", where(build.id), `the build job must upload the "${SHARED_BUILD.artifact}" artifact`);
    } else if (upload.with["include-hidden-files"] !== true && upload.with["include-hidden-files"] !== "true") {
      fail("shared-build", where(build.id), "the build upload must set include-hidden-files: true, or .generated/ and .preview-dist/ are dropped from it");
    }
  }

  for (const [id, name] of Object.entries(SHARED_BUILD.required)) {
    const job = jobs.get(id);
    if (!job) {
      fail("shared-build", where(id), `required job "${id}" is missing`);
      continue;
    }
    const at = where(id);
    if (job.name !== name) fail("shared-build", at, `required job "${id}" must be named "${name}", its branch-protection check name; found ${JSON.stringify(job.name)}`);
    if (!job.needs.includes(SHARED_BUILD.job)) fail("shared-build", at, `required job "${id}" must declare needs: ${SHARED_BUILD.job}`);
    if (!/^\$\{\{\s*always\(\)\s*\}\}$|^always\(\)$/.test(job.if ?? "")) {
      fail("shared-build", at, `required job "${id}" must run with if: \${{ always() }}, or a failed build skips it and the skipped check passes`);
    }
    const gate = job.steps[1];
    const gateText = `${gate?.run ?? ""}\n${Object.values(gate?.env ?? {}).join("\n")}`;
    if (gate?.name !== SHARED_BUILD.gateStep) {
      fail("shared-build", at, `the step after "${IDENTITY_STEP}" must be "${SHARED_BUILD.gateStep}"`);
    } else if (!/needs\.build\.result/.test(gateText) || !gateText.includes(SHARED_BUILD.gateMessage) || !/\bexit 1\b/.test(gateText)) {
      fail("shared-build", at, `"${SHARED_BUILD.gateStep}" must read needs.build.result and fail with "${SHARED_BUILD.gateMessage}"`);
    } else if (!/=\s*"cancelled"/.test(gateText) || !gateText.includes(SHARED_BUILD.cancelledMessage)) {
      fail("shared-build", at, `"${SHARED_BUILD.gateStep}" must fail a cancelled build with "${SHARED_BUILD.cancelledMessage}"`);
    }
    if (!job.steps.some((step) => usesAction(step, "actions/download-artifact") && step.with.name === SHARED_BUILD.artifact)) {
      fail("shared-build", at, `required job "${id}" must download the "${SHARED_BUILD.artifact}" artifact`);
    }
    if (!job.steps.some((step) => (step.run ?? "").includes(SHARED_BUILD.verifyCommand))) {
      fail("shared-build", at, `required job "${id}" must verify the build record (${SHARED_BUILD.verifyCommand}) before testing the build`);
    }
    for (const step of job.steps) {
      if (runs(step, REBUILDS)) fail("shared-build", stepLabel(workflow, job, step), `required job "${id}" must test the shared build, not make its own: ${(step.run ?? "").trim().split("\n")[0]}`);
    }
  }
}

export function loadRepository(root) {
  return { workflows: readWorkflowFiles(root) };
}

export function checkContract({ workflows }) {
  const violations = [];
  const fail = (rule, where, message) => violations.push({ rule, where, message });

  for (const workflow of parseWorkflows(workflows ?? {})) {
    for (const problem of workflow.problems) fail("workflow-shape", problem.where, problem.message);
    if (workflow.name === SHARED_BUILD.workflow && workflow.problems.length === 0) checkSharedBuild(workflow, fail);

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
