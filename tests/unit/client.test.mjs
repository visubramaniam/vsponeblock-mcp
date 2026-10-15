// Unit tests for the HTTP client, against undici's MockAgent: nothing reaches the network.
// Run with `npm test` (builds first), or `node --test tests/unit/` after `npm run build`.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockAgent } from "undici";
import { Spec } from "../../dist/spec.js";
import { VspOneBlockClient, loadConfig, apiRoot, pageUrls } from "../../dist/client.js";

const BASE = "https://vsp.test";
const ROOT = "/ConfigurationManager";
const spec = new Spec(new URL("../../spec/vsponeblock-10.5.4.yaml", import.meta.url).pathname);
const op = (id) => spec.operations.get(id);

let dir, mock, pool, client, tokenRequests, sessionBodies;

function makeClient(extra = {}) {
  const c = new VspOneBlockClient(loadConfig({ VSPONEBLOCK_URL: BASE, VSPONEBLOCK_USER: "admin", VSPONEBLOCK_PASSWORD: "pw", VSPONEBLOCK_DOWNLOAD_DIR: join(dir, "downloads"), ...extra }));
  c.agent = mock; // private in TypeScript, reachable from tests
  return c;
}

const BASIC = `Basic ${Buffer.from("admin:pw").toString("base64")}`;

/** Answers session requests made with the configured Basic credentials, counting them. */
function tokens(times = 10) {
  pool.intercept({ path: `${ROOT}/v1/objects/sessions`, method: "POST", headers: { authorization: BASIC } }).reply((opts) => {
    tokenRequests++;
    sessionBodies.push(JSON.parse(opts.body));
    return { statusCode: 200, data: JSON.stringify({ token: `t${tokenRequests}`, sessionId: tokenRequests }), responseOptions: { headers: { "content-type": "application/json" } } };
  }).times(times);
}

const CAPACITY = `${ROOT}/v1/objects/total-capacities/instance`;
const USERS = `${ROOT}/v1/objects/users`;

const json = (data, headers = {}) => ({ headers: { "content-type": "application/json", ...headers } });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "vsponeblock-client-"));
  mock = new MockAgent();
  mock.disableNetConnect();
  pool = mock.get(BASE);
  tokenRequests = 0;
  sessionBodies = [];
  client = makeClient();
});
afterEach(async () => {
  await mock.close();
  rmSync(dir, { recursive: true, force: true });
});

test("concurrent first calls share one session", async () => {
  tokens();
  pool.intercept({ path: CAPACITY, method: "GET" }).reply(200, "{}", json()).times(5);
  const results = await Promise.all(Array.from({ length: 5 }, () => client.call(op("getTotalCapacity"), {})));
  assert.ok(results.every((r) => r.ok));
  assert.equal(tokenRequests, 1);
  assert.deepEqual(sessionBodies, [{ aliveTime: 300 }]);
});

test("API calls carry the session token; Basic-only and unauthenticated operations do not open a session", async () => {
  tokens();
  pool.intercept({ path: CAPACITY, method: "GET", headers: { authorization: "Session t1" } }).reply(200, "{}", json());
  assert.ok((await client.call(op("getTotalCapacity"), {})).ok);
  pool.intercept({ path: `${ROOT}/v1/objects/dkc-power-states/instance`, method: "GET", headers: { authorization: BASIC } }).reply(200, "{}", json());
  assert.ok((await client.call(op("dkcPowerStatesInstanceGet"), {})).ok);
  pool.intercept({ path: `${ROOT}/configuration/version`, method: "GET", headers: (h) => !h.authorization }).reply(200, "{}", json());
  assert.ok((await client.call(op("getVersion"), {})).ok);
  assert.equal(tokenRequests, 1);
});

test("a session idle for nearly its alive time is replaced before use", async () => {
  client = makeClient({ VSPONEBLOCK_SESSION_ALIVE_TIME: "60" });
  tokens();
  pool.intercept({ path: CAPACITY, method: "GET" }).reply(200, "{}", json()).times(2);
  await client.call(op("getTotalCapacity"), {});
  client.session.lastUsed -= 31_000; // 60 s alive time, renewed 30 s early
  await client.call(op("getTotalCapacity"), {});
  assert.equal(tokenRequests, 2);
  assert.deepEqual(sessionBodies, [{ aliveTime: 60 }, { aliveTime: 60 }]);
});

test("close discards the session", async () => {
  tokens();
  pool.intercept({ path: CAPACITY, method: "GET" }).reply(200, "{}", json());
  await client.call(op("getTotalCapacity"), {});
  let deleted = false;
  pool.intercept({ path: `${ROOT}/v1/objects/sessions/1`, method: "DELETE", headers: { authorization: "Session t1" } }).reply(() => { deleted = true; return { statusCode: 200, data: "{}" }; });
  await client.close();
  assert.ok(deleted);
  await client.close(); // nothing left to discard: no request
});

test("a full session table (HTTP 503) is reported clearly", async () => {
  pool.intercept({ path: `${ROOT}/v1/objects/sessions`, method: "POST" }).reply(503, "{}");
  await assert.rejects(client.call(op("getTotalCapacity"), {}), /maximum of 64 sessions/);
});

test("settings: the URL gets the API root, and the alive time is checked", () => {
  assert.equal(apiRoot("https://array/"), "https://array/ConfigurationManager");
  assert.equal(apiRoot("https://array:8443/ConfigurationManager/"), "https://array:8443/ConfigurationManager");
  assert.throws(() => loadConfig({ VSPONEBLOCK_URL: BASE }), /VSPONEBLOCK_USER, VSPONEBLOCK_PASSWORD/);
  assert.throws(() => loadConfig({ VSPONEBLOCK_URL: BASE, VSPONEBLOCK_USER: "a", VSPONEBLOCK_PASSWORD: "b", VSPONEBLOCK_SESSION_ALIVE_TIME: "301" }), /1-300/);
});

test("a 401 opens a new session once and retries", async () => {
  tokens();
  pool.intercept({ path: CAPACITY, method: "GET" }).reply(200, "{}", json());
  await client.call(op("getTotalCapacity"), {});
  pool.intercept({ path: CAPACITY, method: "GET" }).reply(401, "expired");
  pool.intercept({ path: CAPACITY, method: "GET" }).reply(200, '{"totalPoolCapacity":1}', json());
  const r = await client.call(op("getTotalCapacity"), {});
  assert.ok(r.ok, r.text);
  assert.match(r.text, /totalPoolCapacity/);
  assert.equal(tokenRequests, 2);
});

test("URL building: required and unknown parameters, path parameters, path rewrites", async () => {
  tokens();
  const unknown = await client.call(op("getTotalCapacity"), { params: { nope: 1 } });
  assert.equal(unknown.ok, false);
  assert.match(unknown.text, /Unknown parameter\(s\).*nope/);

  const missing = await client.call(op("getJob"), { params: {} });
  assert.equal(missing.ok, false);
  assert.match(missing.text, /Missing required path parameter "jobId"/);

  pool.intercept({ path: `${ROOT}/v1/objects/jobs/42`, method: "GET" }).reply(200, '{"jobId":42,"state":"Succeeded"}', json());
  assert.match((await client.call(op("getJob"), { params: { jobId: 42 } })).text, /Succeeded/);

  client = makeClient({ VSPONEBLOCK_PATH_REWRITES: "/v1/objects/jobs=/gw/jobs" });
  pool.intercept({ path: `${ROOT}/gw/jobs/1`, method: "GET" }).reply(200, "{}", json());
  assert.ok((await client.call(op("getJob"), { params: { jobId: 1 } })).ok, "paths are rewritten");
});

function pages(n, { badPage } = {}) {
  for (let i = 0; i < n; i++) {
    const next = i < n - 1 ? { link: `<${BASE}${USERS}?offset=${(i + 1) * 2}>; rel="next"` } : {};
    const path = i === 0 ? USERS : `${USERS}?offset=${i * 2}`;
    if (i === badPage) pool.intercept({ path, method: "GET" }).reply(200, "<html>gateway error</html>", { headers: { "content-type": "text/html", ...next } });
    else pool.intercept({ path, method: "GET" }).reply(200, JSON.stringify([{ id: i * 2 }, { id: i * 2 + 1 }]), json(null, next));
  }
}

test("all_pages follows next links and concatenates", async () => {
  tokens();
  pages(3);
  const r = await client.call(op("getUserList"), { all_pages: true });
  assert.ok(r.ok);
  assert.match(r.text, /^6 items from 3 page\(s\)/);
});

test("all_pages stops at max_pages with a note", async () => {
  tokens();
  pages(3);
  const r = await client.call(op("getUserList"), { all_pages: true, max_pages: 2 });
  assert.match(r.text, /^4 items from 2 page\(s\)/);
  assert.match(r.text, /Stopped after 2 pages \(max_pages\)/);
});

test("all_pages keeps earlier pages when a later page is not JSON", async () => {
  tokens();
  pages(3, { badPage: 1 });
  const r = await client.call(op("getUserList"), { all_pages: true });
  assert.ok(r.ok);
  assert.match(r.text, /^2 items from 1 page\(s\)/);
  assert.match(r.text, /Stopped at page 2: the response was not a JSON array \(text\/html\)/);
});

/** Pages that link to `next` and `last` (offset/limit), each reply delayed so parallel fetching is measurable. */
function linkedPages(n, { delay = 0, badPage } = {}) {
  const at = (i) => `${BASE}${USERS}?limit=2&offset=${i * 2}`;
  for (let i = 0; i < n; i++) {
    const link = [i < n - 1 ? `<${at(i + 1)}>; rel="next"` : null, `<${at(n - 1)}>; rel="last"`].filter(Boolean).join(", ");
    const path = i === 0 ? USERS : `${USERS}?limit=2&offset=${i * 2}`;
    const reply = i === badPage
      ? pool.intercept({ path, method: "GET" }).reply(200, "<html>gateway error</html>", { headers: { "content-type": "text/html", link } })
      : pool.intercept({ path, method: "GET" }).reply(200, JSON.stringify([{ id: i * 2 }, { id: i * 2 + 1 }]), json(null, { link }));
    if (delay) reply.delay(delay);
  }
}

test("page URLs are worked out from next and last when they differ only in offset", () => {
  const u = (q) => `${BASE}/x?${q}`;
  assert.deepEqual(pageUrls(u("limit=2"), u("limit=2&offset=2"), u("limit=2&offset=6"), 10), [u("limit=2&offset=2"), u("limit=2&offset=4"), u("limit=2&offset=6")]);
  assert.deepEqual(pageUrls(u("offset=0"), u("offset=5"), u("offset=15"), 10), [u("offset=5"), u("offset=10"), u("offset=15")], "step taken from the offsets");
  assert.deepEqual(pageUrls(u("limit=2"), u("limit=2&offset=2"), u("limit=2&offset=6"), 2), [u("limit=2&offset=2"), u("limit=2&offset=4")], "capped by the page budget");
  assert.deepEqual(pageUrls(u("limit=2"), u("limit=2&offset=2"), u("limit=3&offset=6"), 10), [], "other parameters differ");
  assert.deepEqual(pageUrls(u("limit=2"), u("limit=2&offset=2"), u("limit=2&offset=5"), 10), [], "last is not on a page boundary");
  assert.deepEqual(pageUrls(u("limit=2"), u("limit=2&offset=2"), undefined, 10), [], "no last link");
  assert.deepEqual(pageUrls(u("limit=2"), u("cursor=abc"), u("cursor=xyz"), 10), [], "not offset-based");
});

test("all_pages fetches pages in parallel when next and last are known, keeping their order", async () => {
  tokens();
  linkedPages(5, { delay: 150 });
  const started = performance.now();
  const r = await client.call(op("getUserList"), { all_pages: true });
  const elapsed = performance.now() - started;
  assert.ok(r.ok, r.text);
  assert.match(r.text, /^10 items from 5 page\(s\)/);
  const ids = JSON.parse(r.text.split("\n")[1]).map((x) => x.id);
  assert.deepEqual(ids, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // One page, then four at once: about two delays, where one page at a time would take five.
  assert.ok(elapsed < 600, `took ${elapsed.toFixed(0)} ms`);
});

test("parallel all_pages respects max_pages and keeps pages before a non-JSON one", async () => {
  tokens();
  linkedPages(5);
  const capped = await client.call(op("getUserList"), { all_pages: true, max_pages: 3 });
  assert.match(capped.text, /^6 items from 3 page\(s\)/);
  assert.match(capped.text, /Stopped after 3 pages \(max_pages\)/);

  linkedPages(4, { badPage: 2 });
  const bad = await client.call(op("getUserList"), { all_pages: true });
  assert.ok(bad.ok);
  assert.match(bad.text, /^4 items from 2 page\(s\)/);
  assert.match(bad.text, /Stopped at page 3: the response was not a JSON array/);
});

test("JSON responses are returned compact", async () => {
  tokens();
  pool.intercept({ path: CAPACITY, method: "GET" }).reply(200, '{\n  "version": "1.4",\n  "build": [1, 2]\n}', json());
  const r = await client.call(op("getTotalCapacity"), {});
  assert.ok(r.text.endsWith('{"version":"1.4","build":[1,2]}'), r.text);
});

test("all_pages with save_to writes every item to the file", async () => {
  tokens();
  pages(2);
  const r = await client.call(op("getUserList"), { all_pages: true, save_to: "users.json" });
  assert.ok(r.ok, r.text);
  const file = join(dir, "downloads", "users.json");
  assert.match(r.text, /Saved \d+ bytes \(application\/json\)/);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).length, 4);
});

test("save_to is confined to the download folder and never overwrites", async () => {
  tokens();
  pool.intercept({ path: CAPACITY, method: "GET" }).reply(200, "{}", json()).times(4);
  const outside = await client.call(op("getTotalCapacity"), { save_to: join(dir, "elsewhere.json") });
  assert.equal(outside.ok, false);
  assert.match(outside.text, /outside the download folder/);
  const escape = await client.call(op("getTotalCapacity"), { save_to: "../escape.json" });
  assert.equal(escape.ok, false);
  const ok = await client.call(op("getTotalCapacity"), { save_to: "sub/about.json" });
  assert.ok(ok.ok, ok.text);
  assert.ok(existsSync(join(dir, "downloads", "sub", "about.json")));
  const again = await client.call(op("getTotalCapacity"), { save_to: "sub/about.json" });
  assert.equal(again.ok, false);
  assert.match(again.text, /already exists/);
});

test("VSPONEBLOCK_SAVE_ANYWHERE lifts the folder restriction", async () => {
  client = makeClient({ VSPONEBLOCK_SAVE_ANYWHERE: "true" });
  tokens();
  pool.intercept({ path: CAPACITY, method: "GET" }).reply(200, "{}", json());
  const r = await client.call(op("getTotalCapacity"), { save_to: join(dir, "elsewhere.json") });
  assert.ok(r.ok, r.text);
  assert.ok(existsSync(join(dir, "elsewhere.json")));
});

test("binary downloads are streamed to disk; a malformed file name falls back to a generated one", async () => {
  tokens();
  const body = Buffer.alloc(256 * 1024, 7);
  const download = (id) => `${ROOT}/v1/objects/configuration-reports/${id}/actions/download/invoke`;
  pool.intercept({ path: download("r1"), method: "POST" }).reply(200, body, { headers: { "content-type": "application/gzip", "content-disposition": "attachment; filename*=UTF-8''bad%E0%A4%A.tar.gz" } });
  pool.intercept({ path: download("r2"), method: "POST" }).reply(200, body, { headers: { "content-type": "application/gzip", "content-disposition": 'attachment; filename="bundle.tar.gz"' } }).times(2);
  const id = "configurationReportsReportIdActionsDownloadInvokePost";
  const bad = await client.call(op(id), { params: { reportId: "r1" } });
  assert.ok(bad.ok, bad.text);
  assert.match(bad.text, new RegExp(`Saved ${body.length} bytes`));
  assert.match(bad.text, new RegExp(`${id}-.*\\.tar\\.gz`));
  const first = await client.call(op(id), { params: { reportId: "r2" } });
  const second = await client.call(op(id), { params: { reportId: "r2" } });
  assert.match(first.text, /bundle\.tar\.gz/);
  assert.match(second.text, /bundle-1\.tar\.gz/, "a second download with the same name gets a new name");
  assert.deepEqual(readdirSync(join(dir, "downloads")).length, 3);
});

test("uploads refuse hidden paths, and paths outside VSPONEBLOCK_UPLOAD_DIR when it is set", async () => {
  const hidden = join(dir, ".secret");
  mkdirSync(hidden);
  writeFileSync(join(hidden, "server.crt"), "a,b\n");
  const r = await client.call(op("postKmsCertificate"), { body: { fileType: "ServerCertificate" }, files: { file: join(hidden, "server.crt") } });
  assert.equal(r.ok, false);
  assert.match(r.text, /hidden file or inside a hidden folder/);

  const uploads = join(dir, "uploads");
  mkdirSync(uploads);
  writeFileSync(join(dir, "server.crt"), "a,b\n");
  client = makeClient({ VSPONEBLOCK_UPLOAD_DIR: uploads });
  const outside = await client.call(op("postKmsCertificate"), { body: { fileType: "ServerCertificate" }, files: { file: join(dir, "server.crt") } });
  assert.equal(outside.ok, false);
  assert.match(outside.text, /outside VSPONEBLOCK_UPLOAD_DIR/);

  writeFileSync(join(uploads, "server.crt"), "a,b\n");
  tokens();
  pool.intercept({ path: `${ROOT}/v1/objects/kms-certificates`, method: "POST" }).reply(202, '{"jobId":7}', json());
  const inside = await client.call(op("postKmsCertificate"), { body: { fileType: "ServerCertificate" }, files: { file: join(uploads, "server.crt") } });
  assert.ok(inside.ok, inside.text);
});
