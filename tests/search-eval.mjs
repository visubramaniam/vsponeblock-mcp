// Offline evaluation of operation search. Run after `npm run build`:  node tests/search-eval.mjs
// Scores the tuning and held-out request sets, and exits with an error if any score falls below its regression
// threshold (set to the scores when the threshold was last raised).
//   EXAMPLES=0  measure plain BM25 without the example questions (thresholds not checked)
import { readFileSync } from "node:fs";
import { Spec } from "../dist/spec.js";
import { OperationIndex } from "../dist/search.js";
import { CASES, HELD_OUT } from "./cases.mjs";

// Minimum scores. Raise them when search improves; never lower them to make a change pass.
const THRESHOLDS = {
  "Tuning set": { top1: 46, top3: 48 },
  "Held-out set": { top1: 14, top3: 17 },
};

const spec = new Spec(new URL("../spec/vsponeblock-10.5.4.yaml", import.meta.url).pathname);
const ops = [...spec.operations.values()];
for (const [, want] of [...CASES, ...HELD_OUT]) for (const id of want) if (!spec.operations.has(id)) throw new Error(`Unknown expected id ${id}`);
const examples = JSON.parse(readFileSync(new URL("../spec/examples.json", import.meta.url), "utf8"));
for (const id of Object.keys(examples)) if (!id.startsWith("_") && !spec.operations.has(id)) throw new Error(`Unknown example id ${id}`);
const missing = ops.filter((op) => !examples[op.operationId]).map((op) => op.operationId);
if (missing.length) console.log(`${missing.length} of ${ops.length} operations have no example questions.`);
const index = new OperationIndex(ops, process.env.EXAMPLES === "0" ? {} : examples);
const checking = process.env.EXAMPLES !== "0";
const failures = [];

function evaluate(label, cases) {
  const rankOf = (list, want) => { const i = list.findIndex((id) => want.includes(id)); return i < 0 ? Infinity : i + 1; };
  const s = { top1: 0, top3: 0, mrr: 0, empty: 0 };
  const byConf = { high: [0, 0], medium: [0, 0], low: [0, 0] };
  const rows = [];
  for (const [q, want] of cases) {
    const r = index.search(q, { limit: 10 });
    const rank = rankOf(r.hits.map((h) => h.op.operationId), want);
    if (rank === 1) s.top1++; if (rank <= 3) s.top3++; if (rank < Infinity) s.mrr += 1 / rank; if (!r.hits.length) s.empty++;
    byConf[r.confidence][0]++; if (rank === 1) byConf[r.confidence][1]++;
    rows.push([q, rank, r.confidence, r.hits[0]?.op.operationId]);
  }
  const n = cases.length;
  console.log(`\n=== ${label}: ${n} requests\n`);
  console.log("method  top-1    top-3    MRR    no results");
  console.log(`BM25    ${String(s.top1).padStart(2)}/${n}    ${String(s.top3).padStart(2)}/${n}    ${(s.mrr / n).toFixed(2)}   ${s.empty}`);
  console.log("\nConfidence calibration (top-1 correct / cases):");
  for (const [c, [k, ok]] of Object.entries(byConf)) console.log(`  ${c.padEnd(6)} ${ok}/${k}${k ? `  (${Math.round((100 * ok) / k)}%)` : ""}`);
  console.log("\nMisses (top-1 wrong):");
  for (const [q, rank, c, top] of rows) if (rank !== 1) console.log(`  [${c}] "${q}" → rank ${rank === Infinity ? "–" : rank}; top was ${top}`);
  const t = THRESHOLDS[label];
  if (checking && t) for (const k of ["top1", "top3"]) if (s[k] < t[k]) failures.push(`${label} ${k} ${s[k]}/${n} is below ${t[k]}`);
}
evaluate("Tuning set", CASES);
evaluate("Held-out set", HELD_OUT);
if (checking) {
  if (failures.length) {
    console.error(`\nSEARCH REGRESSION:\n  ${failures.join("\n  ")}`);
    process.exitCode = 1;
  } else console.log("\nAll scores meet their regression thresholds.");
}
