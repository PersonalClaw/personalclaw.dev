import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { loadingOnScreen } from "../../scripts/capture-guard.mjs";

// The capture step refuses a view still loading (scripts/capture-guard.mjs). The Store shot once
// shipped its catalog's skeleton, three grey rows and no apps, because a fixed settle time ran out
// before a slow first fetch did.
//
// 1. The check, in a real page: a skeleton, a busy region and "Loading…" each count; the same
//    marks hidden or off screen, a spinner alone, a running-state pulse and finished text do not.
// 2. The shot itself, scripts/capture-app-shots.mjs run against a planted page: a skeleton that
//    never clears fails the shot and writes no PNG, one that clears is shot, and a Store whose
//    catalog never arrives (no loading mark, no listing) is refused by the shot's ready mark.
//    So is a Store whose top bar says "Chat provider not answering".

test("the loading check finds a skeleton, a busy region and Loading…, and nothing else", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "a DOM check, the same in every project");
  const marks = async (body: string) => {
    await page.setContent(`<!doctype html><html><body>${body}</body></html>`);
    return page.evaluate(loadingOnScreen);
  };
  expect(await marks('<div class="h-4 animate-pulse rounded" style="width:200px;height:16px"></div>')).toEqual(["skeleton div"]);
  expect(await marks('<div class="store-skeleton-row" style="height:40px"></div>')).toEqual(["skeleton div"]);
  expect(await marks('<div class="skeletonized" style="height:40px"></div>')).toEqual([]);
  expect(await marks('<div role="status" aria-busy="true" style="height:40px">rows</div>')).toEqual(["busy div[role=status]"]);
  expect(await marks("<p>Loading…</p>")).toEqual(['"Loading…"']);
  expect(await marks("<p>Reconnecting...</p>")).toEqual(['"Reconnecting..."']);
  expect(await marks("<footer>Connecting to gateway…</footer>")).toEqual(['"Connecting to gateway…"']);

  expect(await marks('<div class="animate-pulse" style="display:none;width:200px;height:16px"></div>')).toEqual([]);
  expect(await marks('<div class="skeleton" style="position:absolute;top:4000px;width:200px;height:16px"></div>')).toEqual([]);
  expect(await marks('<svg class="animate-spin" width="16" height="16"></svg><p>Needs your OK: edit_file</p>')).toEqual([]);
  expect(await marks('<span class="motion-safe:animate-pulse" style="display:inline-block;width:10px;height:10px"></span>')).toEqual([]);
  expect(await marks('<input class="placeholder:text-gray-400" placeholder="Search the Store">')).toEqual([]);
  expect(await marks("<p>65 apps from one source</p>")).toEqual([]);
  expect(await marks("<footer>Gateway connected</footer>")).toEqual([]);
});

/** A Store as the shot sees it: listings with an Install button, and optionally a skeleton. */
const store = ({
  skeleton,
  clearsAfter,
  listings = true,
  providerDown = false
}: {
  skeleton: boolean;
  clearsAfter?: number;
  listings?: boolean;
  providerDown?: boolean;
}) =>
  `<!doctype html><html><body style="background:#121416;color:#eee">
  ${providerDown ? '<header><button type="button">Chat provider not answering</button></header>' : ""}
  <h1>Store</h1>
  ${listings ? '<div><h3>DuckDuckGo</h3><button type="button">Install</button></div>' : "<p>Couldn't load your Store catalog</p>"}
  ${skeleton ? '<div id="rows" role="status" aria-busy="true"><div class="animate-pulse" style="width:600px;height:60px;background:#2a2c2e"></div></div>' : ""}
  ${clearsAfter ? `<script>setTimeout(() => document.getElementById("rows").remove(), ${clearsAfter});</script>` : ""}
  </body></html>`;

const pages: Record<string, string> = {
  "/stuck/": store({ skeleton: true }),
  "/settles/": store({ skeleton: true, clearsAfter: 700 }),
  "/no-catalog/": store({ skeleton: false, listings: false }),
  "/provider-down/": store({ skeleton: false, providerDown: true })
};

let server: Server;
let origin = "";

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const body = pages[new URL(request.url ?? "/", "http://planted").pathname];
    response.writeHead(body ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    response.end(body ?? "not planted");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** The shot script, run for the Store shot against a planted page, into a scratch folder. */
function shoot(path: string, out: string) {
  const env = { ...process.env };
  delete env.PERSONALCLAW_TOKEN;
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(
      process.execPath,
      [
        join(process.cwd(), "scripts", "capture-app-shots.mjs"),
        "--base",
        `${origin}${path}`.replace(/\/$/, ""),
        "--only",
        "apps",
        "--out",
        out,
        "--settle",
        "50",
        "--loading-wait",
        "2000"
      ],
      { env }
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ code, output }));
  });
}

test("a planted skeleton fails the shot, a view that settles is shot, and a missing catalog or a provider not answering is refused", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "it runs the capture script, which opens its own browser");
  test.setTimeout(90_000);
  const out = mkdtempSync(join(tmpdir(), "capture-guard-"));
  try {
    const stuck = await shoot("/stuck/", out);
    expect(stuck.code, stuck.output).toBe(1);
    expect(stuck.output).toMatch(/refused\s+apps .*still loading after 2000 ms: busy div\[role=status\], skeleton div/);
    expect(existsSync(join(out, "apps.png")), "a refused shot writes no PNG").toBe(false);

    const missing = await shoot("/no-catalog/", out);
    expect(missing.code, missing.output).toBe(1);
    expect(missing.output).toMatch(/refused\s+apps .*its data never showed/);
    expect(existsSync(join(out, "apps.png"))).toBe(false);

    const down = await shoot("/provider-down/", out);
    expect(down.code, down.output).toBe(1);
    expect(down.output).toMatch(/refused\s+apps .*the top bar says the chat provider is not answering/);
    expect(existsSync(join(out, "apps.png"))).toBe(false);

    const settles = await shoot("/settles/", out);
    expect(settles.code, settles.output).toBe(0);
    expect(settles.output).toMatch(/captured apps/);
    expect(existsSync(join(out, "apps.png"))).toBe(true);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
