// The one reader of .github/workflows/*.yml, shared by the CI contract
// (tests/support/ci-contract.mjs) and the supply-chain check
// (tests/support/supply-chain.mjs). It is built on the `yaml` parser, so a workflow is
// read the way a YAML parser reads it rather than line by line. It never throws: a file
// the parser rejects, or a shape the rules cannot judge (an anchor or alias, a
// permissions value that is neither a map nor read-all/write-all), comes back in
// `problems`, and both checks report each one as a `workflow-shape` violation.
import fs from "node:fs";
import path from "node:path";
import { isMap, isScalar, isSeq, parseDocument, visit } from "yaml";

export function readWorkflowFiles(root) {
  const directory = path.join(root, ".github", "workflows");
  const workflows = {};
  for (const name of fs.readdirSync(directory).sort()) {
    if (/\.ya?ml$/.test(name)) workflows[name] = fs.readFileSync(path.join(directory, name), "utf8");
  }
  return workflows;
}

// The comment written after a scalar on its own line: the release tag after an action
// SHA, the architecture after an image digest.
function trailingComment(text, node) {
  if (!isScalar(node) || !Array.isArray(node.range)) return "";
  const end = node.range[1];
  const lineEnd = text.indexOf("\n", end);
  const rest = text.slice(end, lineEnd === -1 ? undefined : lineEnd);
  return /^\s*#\s*(.*?)\s*$/.exec(rest)?.[1] ?? "";
}

function plain(doc, node) {
  if (node === undefined || node === null) return undefined;
  return typeof node.toJS === "function" ? node.toJS(doc) : node;
}

function mapping(doc, node) {
  const value = plain(doc, node);
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

// A permissions value: a map of scope to level, or GitHub's read-all / write-all.
function readPermissions(doc, node, where, problems) {
  if (node === undefined) return null;
  if (isMap(node)) {
    const scopes = mapping(doc, node);
    for (const [scope, level] of Object.entries(scopes)) {
      if (!["read", "write", "none"].includes(level)) {
        problems.push({ where, message: `permission ${scope} must be read, write or none, found ${JSON.stringify(level)}` });
      }
    }
    return { kind: "map", scopes };
  }
  const value = plain(doc, node);
  if (value === "read-all" || value === "write-all") return { kind: value, scopes: {} };
  problems.push({ where, message: `permissions must be a map, read-all or write-all, found ${JSON.stringify(value)}` });
  return { kind: "unreadable", scopes: {} };
}

function reference(text, doc, node) {
  if (node === undefined) return null;
  return { reference: String(plain(doc, node)), comment: trailingComment(text, node) };
}

function readImage(text, doc, node, where, images) {
  if (node === undefined) return;
  const image = isMap(node) ? node.get("image", true) : node;
  if (image !== undefined) images.push({ where, ...reference(text, doc, image) });
}

export function parseWorkflow(name, text) {
  const problems = [];
  const images = [];
  const workflow = { name, file: `.github/workflows/${name}`, problems, images, permissions: null, env: {}, jobs: [] };
  const doc = parseDocument(text, { uniqueKeys: true, merge: false, prettyErrors: false });
  for (const error of doc.errors) problems.push({ where: name, message: `YAML: ${error.message.split("\n")[0]}` });
  if (doc.errors.length > 0) return workflow;

  let shared = false;
  visit(doc, {
    Alias() {
      shared = true;
      return visit.BREAK;
    },
    Node(_, node) {
      if (node.anchor) {
        shared = true;
        return visit.BREAK;
      }
      return undefined;
    },
  });
  if (shared) problems.push({ where: name, message: "anchors and aliases are not read by the CI checks; write each value out" });

  const top = doc.contents;
  if (!isMap(top)) {
    problems.push({ where: name, message: "a workflow must be a mapping" });
    return workflow;
  }
  workflow.permissions = readPermissions(doc, top.get("permissions", true), `${name} permissions`, problems);
  workflow.env = mapping(doc, top.get("env", true));

  const jobs = top.get("jobs", true);
  if (!isMap(jobs) || jobs.items.length === 0) {
    problems.push({ where: name, message: "no jobs found" });
    return workflow;
  }
  for (const pair of jobs.items) {
    const id = String(plain(doc, pair.key));
    const where = `${name} ${id}`;
    const node = pair.value;
    if (!isMap(node)) {
      problems.push({ where, message: "a job must be a mapping" });
      continue;
    }
    const runsOn = plain(doc, node.get("runs-on", true));
    const needs = plain(doc, node.get("needs", true));
    const condition = plain(doc, node.get("if", true));
    const timeout = plain(doc, node.get("timeout-minutes", true));
    const job = {
      id,
      name: plain(doc, node.get("name", true)) ?? null,
      runsOn: runsOn === undefined ? null : typeof runsOn === "string" ? runsOn : JSON.stringify(runsOn),
      needs: needs === undefined ? [] : (Array.isArray(needs) ? needs : [needs]).map(String),
      if: condition === undefined ? null : String(condition),
      timeoutMinutes: timeout === undefined ? null : timeout,
      permissions: readPermissions(doc, node.get("permissions", true), `${where} permissions`, problems),
      env: mapping(doc, node.get("env", true)),
      uses: reference(text, doc, node.get("uses", true)),
      workingDirectory: plain(doc, node.getIn(["defaults", "run", "working-directory"], true)) ?? null,
      steps: [],
    };
    readImage(text, doc, node.get("container", true), where, images);
    const services = node.get("services", true);
    if (isMap(services)) {
      for (const service of services.items) readImage(text, doc, service.value, `${where} services`, images);
    }

    const steps = node.get("steps", true);
    if (steps !== undefined && !isSeq(steps)) problems.push({ where, message: "steps must be a list" });
    for (const [index, stepNode] of (isSeq(steps) ? steps.items : []).entries()) {
      if (!isMap(stepNode)) {
        problems.push({ where, message: `step ${index + 1} must be a mapping` });
        continue;
      }
      const run = plain(doc, stepNode.get("run", true));
      const stepCondition = plain(doc, stepNode.get("if", true));
      job.steps.push({
        index,
        id: plain(doc, stepNode.get("id", true)) ?? null,
        name: plain(doc, stepNode.get("name", true)) ?? null,
        if: stepCondition === undefined ? null : String(stepCondition),
        uses: reference(text, doc, stepNode.get("uses", true)),
        with: mapping(doc, stepNode.get("with", true)),
        env: mapping(doc, stepNode.get("env", true)),
        run: typeof run === "string" ? run : null,
        workingDirectory: plain(doc, stepNode.get("working-directory", true)) ?? job.workingDirectory,
      });
    }
    workflow.jobs.push(job);
  }
  return workflow;
}

export function parseWorkflows(workflows) {
  return Object.entries(workflows).map(([name, text]) => parseWorkflow(name, text));
}

export const stepName = (step) => step.name ?? `step ${step.index + 1}`;
export const stepLabel = (workflow, job, step) => `${workflow.name} ${job.id} "${stepName(step)}"`;
