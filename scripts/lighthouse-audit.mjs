import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import { routes } from "../tests/support/site-contract.mjs";

const reportDir = path.resolve(".lighthouse");
const categoryBudgets = {
  performance: 0.9,
  accessibility: 0.95,
  "best-practices": 0.95,
  seo: 0.95
};
const metricBudgets = {
  "first-contentful-paint": 2000,
  "largest-contentful-paint": 2500,
  "cumulative-layout-shift": 0.1,
  "total-blocking-time": 200,
  "speed-index": 3400,
  "total-byte-weight": 2.5 * 1024 * 1024
};
const resourceBudgets = {
  script: 160 * 1024,
  font: 280 * 1024,
  image: 2.25 * 1024 * 1024
};

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => (port ? resolve(port) : reject(new Error("Could not allocate a port"))));
    });
  });
}

async function waitForServer(url, server, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Preview server exited early:\n${output.join("").slice(-4000)}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The preview process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function checkBudget(route, label, actual, expected, comparison, failures) {
  if (typeof actual !== "number" || !comparison(actual, expected)) {
    failures.push(`${route}: ${label} was ${actual ?? "missing"}, budget ${expected}`);
  }
}

await mkdir(reportDir, { recursive: true });
const serverPort = await freePort();
const baseUrl = `http://127.0.0.1:${serverPort}`;
const serverOutput = [];
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const server = spawn(
  npmCommand,
  ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(serverPort)],
  {
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  }
);
server.stdout.on("data", (chunk) => serverOutput.push(chunk.toString()));
server.stderr.on("data", (chunk) => serverOutput.push(chunk.toString()));

let chrome;
const failures = [];

try {
  await waitForServer(baseUrl, server, serverOutput);
  chrome = await launch({
    chromePath: process.env.CHROME_PATH,
    chromeFlags: [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  });

  for (const route of routes) {
    const result = await lighthouse(
      `${baseUrl}${route.path}`,
      {
        port: chrome.port,
        output: ["html", "json"],
        logLevel: "error",
        onlyCategories: Object.keys(categoryBudgets)
      }
    );
    if (!result) {
      failures.push(`${route.path}: Lighthouse returned no result`);
      continue;
    }

    const reports = Array.isArray(result.report) ? result.report : [result.report];
    const htmlReport = reports.find((report) => report.trimStart().startsWith("<!doctype"));
    const jsonReport = reports.find((report) => report.trimStart().startsWith("{"));
    if (htmlReport) await writeFile(path.join(reportDir, `${route.name}.html`), htmlReport);
    if (jsonReport) await writeFile(path.join(reportDir, `${route.name}.json`), jsonReport);

    for (const [category, minimum] of Object.entries(categoryBudgets)) {
      checkBudget(
        route.path,
        `${category} score`,
        result.lhr.categories[category]?.score,
        minimum,
        (actual, expected) => actual >= expected,
        failures
      );
    }

    for (const [audit, maximum] of Object.entries(metricBudgets)) {
      checkBudget(
        route.path,
        audit,
        result.lhr.audits[audit]?.numericValue,
        maximum,
        (actual, expected) => actual <= expected,
        failures
      );
    }

    const resources = result.lhr.audits["resource-summary"]?.details?.items ?? [];
    for (const [resourceType, maximum] of Object.entries(resourceBudgets)) {
      const resource = resources.find((item) => item.resourceType === resourceType);
      checkBudget(
        route.path,
        `${resourceType} transfer bytes`,
        resource?.transferSize ?? 0,
        maximum,
        (actual, expected) => actual <= expected,
        failures
      );
    }

    const scores = Object.keys(categoryBudgets)
      .map((category) => `${category} ${Math.round((result.lhr.categories[category]?.score ?? 0) * 100)}`)
      .join(", ");
    console.log(`${route.path}: ${scores}`);
  }
} catch (error) {
  failures.push(error.stack ?? error.message);
} finally {
  if (chrome) chrome.kill();
  if (server.exitCode === null) server.kill("SIGTERM");
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Lighthouse budgets passed. Reports: ${path.relative(process.cwd(), reportDir)}`);
}
