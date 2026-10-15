// Unit tests for loading and indexing the OpenAPI spec.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Spec, SPEC_CACHE, parseYaml, toolParamName } from "../../dist/spec.js";

const SPEC_FILE = new URL("../../spec/vsponeblock-10.5.4.yaml", import.meta.url).pathname;
const spec = new Spec(SPEC_FILE);

test("indexes 425 operations and hides the session endpoints the server manages itself", () => {
  assert.equal(spec.operations.size, 425);
  assert.ok(!spec.operations.has("postSession"));
  assert.ok(!spec.operations.has("deleteSession"));
  assert.ok(spec.operations.has("getSessionList"));
  assert.equal([...spec.operations.values()].filter((o) => o.secret).length, 0);
});

test("each operation's authentication follows its security requirement", () => {
  const by = (auth) => [...spec.operations.values()].filter((o) => o.auth === auth).map((o) => o.operationId).sort();
  assert.deepEqual(by("none"), ["getStorageList", "getVersion", "guiSettingsGet"]);
  assert.deepEqual(by("basic"), ["dkcPowerStatesInstanceGet", "dkcPowerStatesInstancePatch"]);
  assert.equal(by("session").length, 420);
});

test("read-only operations are GETs plus the listed query/validate POSTs", () => {
  for (const op of spec.operations.values()) {
    if (op.method === "GET") assert.ok(op.readOnly, op.operationId);
    if (["PUT", "PATCH", "DELETE"].includes(op.method)) assert.ok(!op.readOnly, op.operationId);
  }
  const readOnlyPosts = [...spec.operations.values()].filter((o) => o.method === "POST" && o.readOnly).map((o) => o.operationId).sort();
  assert.deepEqual(readOnlyPosts, ["configurationReportsReportIdActionsDownloadInvokePost"]);
});

test("every operation has a response schema available after the document is released", () => {
  for (const op of spec.operations.values()) assert.notEqual(spec.responseSchema(op), undefined, op.operationId);
});

test("tool-safe parameter names are valid and do not collide", () => {
  const reserved = new Set(["body", "files", "all_pages", "max_pages", "save_to"]);
  for (const op of spec.operations.values()) {
    const names = op.params.map((p) => toolParamName(p.name));
    for (const n of names) {
      assert.match(n, /^[A-Za-z0-9_.-]{1,64}$/, `${op.operationId}: ${n}`);
      assert.ok(!reserved.has(n), `${op.operationId}: ${n} collides with a call argument`);
    }
    assert.equal(new Set(names).size, names.length, `${op.operationId}: duplicate parameter names`);
  }
  assert.equal(toolParamName("match[]"), "match");
});

test("$ref resolution cuts off recursion and turns nullable into a type union", () => {
  const dir = mkdtempSync(join(tmpdir(), "vsponeblock-spec-"));
  const file = join(dir, "mini.yaml");
  writeFileSync(file, `
openapi: 3.0.3
info: { title: t, version: "1" }
tags: [{ name: Things, description: "Things that you can list here. More text." }]
paths:
  /things:
    get:
      operationId: listThings
      tags: [Things]
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Node" }
components:
  schemas:
    Node:
      type: object
      properties:
        name: { type: string, nullable: true, example: x }
        child: { $ref: "#/components/schemas/Node" }
`);
  try {
    const s = new Spec(file);
    const schema = s.responseSchema(s.operations.get("listThings")).schema;
    assert.deepEqual(schema.properties.name.type, ["string", "null"]);
    assert.equal(schema.properties.name.example, undefined, "examples are dropped");
    assert.match(schema.properties.child.description, /Node \(nested; see describe_operation\)/);
    assert.equal(s.tags[0].description, "Things that you can list here.", "tag descriptions keep their first sentence");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the build-time cache is the bundled YAML, parsed", () => {
  const cache = JSON.parse(readFileSync(SPEC_CACHE, "utf8"));
  assert.deepEqual(cache.doc, parseYaml(readFileSync(SPEC_FILE, "utf8")));
});

test("a changed YAML spec is parsed afresh rather than taken from the cache", () => {
  const dir = mkdtempSync(join(tmpdir(), "vsponeblock-spec-"));
  const file = join(dir, "changed.yaml");
  const yaml = readFileSync(SPEC_FILE, "utf8");
  const summary = spec.operations.get("getAlertList").summary;
  writeFileSync(file, yaml.replace(`summary: ${summary}`, "summary: Changed summary"));
  try {
    assert.equal(new Spec(file).operations.get("getAlertList").summary, "Changed summary");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a JSON spec loads like the YAML one", () => {
  const dir = mkdtempSync(join(tmpdir(), "vsponeblock-spec-"));
  const file = join(dir, "spec.json");
  writeFileSync(file, JSON.stringify(parseYaml(readFileSync(SPEC_FILE, "utf8"))));
  try {
    const s = new Spec(file);
    assert.deepEqual([...s.operations.keys()], [...spec.operations.keys()]);
    assert.deepEqual(s.responseSchema(s.operations.get("getAlertList")), spec.responseSchema(spec.operations.get("getAlertList")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
