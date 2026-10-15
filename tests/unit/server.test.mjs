// End-to-end tests of the MCP server over stdio. The server is pointed at an address that does not exist, so
// any call that got past the server's own checks would fail with a network error rather than reach a system.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Spec, isMultipart } from "../../dist/spec.js";

const SERVER = new URL("../../dist/index.js", import.meta.url).pathname;
const spec = new Spec(new URL("../../spec/vsponeblock-10.5.4.yaml", import.meta.url).pathname);
const version = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
const open = [];

async function server(env = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { PATH: process.env.PATH, VSPONEBLOCK_URL: "https://vsponeblock.invalid", VSPONEBLOCK_USER: "x", VSPONEBLOCK_PASSWORD: "x", ...env },
    stderr: "ignore",
  });
  const client = new Client({ name: "unit-test", version: "1" });
  await client.connect(transport);
  open.push(client);
  return client;
}
after(async () => { for (const c of open) await c.close(); });

const textOf = (r) => r.content.map((c) => c.text).join("\n");

test("reports the package version", async () => {
  const c = await server();
  assert.equal(c.getServerVersion().version, version);
});

test("read-only mode refuses every write operation before any request is made", async () => {
  const c = await server();
  const writes = [...spec.operations.values()].filter((o) => !o.readOnly);
  assert.equal(writes.length, 253);
  for (const op of writes) {
    const r = await c.callTool({ name: "vsponeblock_call_operation", arguments: { operationId: op.operationId } });
    assert.ok(r.isError, op.operationId);
    assert.match(textOf(r), /server is running read-only/, op.operationId);
  }
});

test("uploads are write operations, so read-only mode refuses them too", async () => {
  const c = await server();
  const uploads = [...spec.operations.values()].filter(isMultipart);
  assert.equal(uploads.length, 4);
  for (const op of uploads) {
    assert.ok(!op.readOnly, op.operationId);
    const r = await c.callTool({ name: "vsponeblock_call_operation", arguments: { operationId: op.operationId, files: { file: SERVER } } });
    assert.match(textOf(r), /server is running read-only/, op.operationId);
  }
});

test("the session endpoints are not exposed; the server manages its own session", async () => {
  const c = await server();
  for (const id of ["postSession", "deleteSession"]) {
    const r = await c.callTool({ name: "vsponeblock_describe_operation", arguments: { operationId: id } });
    assert.match(textOf(r), /Unknown operationId/, id);
  }
  assert.match(textOf(await c.callTool({ name: "vsponeblock_describe_operation", arguments: { operationId: "getSessionList" } })), /"access":"read"/);
});

test("a HIGH-confidence search lists the top result's parameters, unless that operation is blocked", async () => {
  const c = await server();
  const search = async (query) => textOf(await c.callTool({ name: "vsponeblock_list_operations", arguments: { query } }));
  const pairs = await search("list gad truecopy and universal replicator pairs");
  assert.match(pairs, /^Confidence: HIGH/);
  assert.match(pairs, /Parameters of getRemoteCopypairList:\n- replicationType \(query, required\): string/);
  const create = await search("create a qos group");
  assert.match(create, /^Confidence: HIGH/);
  assert.doesNotMatch(create, /Parameters of/, "a write blocked in read-only mode gets no parameters");
  assert.doesNotMatch(await search("list alerts"), /Parameters of/, "only HIGH confidence");
});

test("describe returns compact JSON", async () => {
  const c = await server();
  const d = textOf(await c.callTool({ name: "vsponeblock_describe_operation", arguments: { operationId: "getTotalCapacity" } }));
  assert.ok(!d.includes("\n  "), "no indentation");
  assert.equal(JSON.parse(d).operationId, "getTotalCapacity");
});

test("direct tools exclude writes in read-only mode, and all names are valid", async () => {
  const c = await server({ VSPONEBLOCK_TOOLSETS: "all" });
  const { tools } = await c.listTools();
  const direct = tools.filter((t) => !t.name.startsWith("vsponeblock_"));
  const readable = [...spec.operations.values()].filter((o) => o.readOnly);
  assert.equal(direct.length, readable.length);
  assert.ok(direct.some((t) => t.name === "getLdevList"));
  for (const t of tools) {
    assert.match(t.name, /^[A-Za-z0-9_.-]{1,64}$/);
    for (const p of Object.keys(t.inputSchema.properties ?? {})) assert.match(p, /^[A-Za-z0-9_.-]{1,64}$/, `${t.name}.${p}`);
  }
  const call = await c.callTool({ name: "postLdev", arguments: {} });
  assert.match(textOf(call), /Unknown tool/);
});

test("with writes allowed, every operation is a direct tool", async () => {
  const c = await server({ VSPONEBLOCK_TOOLSETS: "all", VSPONEBLOCK_ALLOW_WRITES: "true" });
  const { tools } = await c.listTools();
  assert.equal(tools.length, 3 + 425);
});

test("arguments of the wrong type return a result, not a crash", async () => {
  const c = await server();
  const r1 = await c.callTool({ name: "vsponeblock_list_operations", arguments: { tag: 123 } });
  assert.match(textOf(r1), /No operations in that area/);
  const r2 = await c.callTool({ name: "vsponeblock_list_operations", arguments: { query: "alerts", limit: "abc" } });
  assert.match(textOf(r2), /^Confidence:/);
  const r3 = await c.callTool({ name: "vsponeblock_describe_operation", arguments: { operationId: { x: 1 } } });
  assert.ok(r3.isError);
  assert.match(textOf(r3), /Unknown operationId/);
});
