// BM25 ranking over the operation catalogue, with a confidence signal so the
// model knows when to call straight away and when to describe candidates first.
import type { Operation } from "./spec.js";

// Field weights: a term in the operationId or summary says more than one in a
// long description. Implemented by repeating tokens (BM25F-lite).
const FIELD_WEIGHTS = { operationId: 3, summary: 4, tag: 2, path: 2, description: 0.5, examples: 3 } as const;

const K1 = 1.2;
const B = 0.75;

const STOPWORDS = new Set(
  "a an and are as at be by can do does for from get give how i in is it list me my of on or show tell the this to what when where which who why with all any vsp one block hitachi api".split(" "),
);

// Storage vocabulary people use vs. the words in the spec.
const SYNONYMS: Record<string, string[]> = {
  volume: ["ldev"], volumes: ["ldev"], lun: ["ldev", "lun"], luns: ["ldev", "lun"], disk: ["ldev", "drive"], ldev: ["volume"],
  array: ["storage"], system: ["storage"], box: ["storage"],
  server: ["host"], servers: ["host"], host: ["server", "host group"], hosts: ["server", "host group"],
  initiator: ["wwn", "iscsi", "host"], wwn: ["wwn", "host"], iqn: ["iscsi"],
  snapshot: ["snapshot", "thin image"], snapshots: ["snapshot", "thin image"], clone: ["snapshot", "shadow image"],
  replication: ["pair", "copy"], gad: ["global active device", "pair"], truecopy: ["remote copy", "pair"], mirror: ["pair", "copy"],
  latency: ["response", "performance"], performance: ["performance", "monitor"], iops: ["performance", "monitor"], throughput: ["performance"],
  capacity: ["pool", "usage"], free: ["capacity", "pool"], usage: ["capacity"],
  dedupe: ["deduplication", "saving"], compression: ["saving"],
  login: ["session"], user: ["user", "account"], users: ["user", "account"], role: ["user group"],
  alert: ["alert", "sim"], alerts: ["alert", "sim"], alarm: ["alert", "sim"], error: ["sim", "health"], errors: ["sim", "health"],
  health: ["health status"], healthy: ["health status"], status: ["health status"],
  firmware: ["version", "microcode"], microcode: ["version"], version: ["version"],
  cert: ["certificate"], tls: ["certificate"], ssl: ["certificate"],
  encryption: ["encryption key"], kms: ["key management"],
  qos: ["qos", "quality"], limit: ["qos", "upper"], zone: ["host group"], mapping: ["lun", "path"],
  remove: ["delete"], unmap: ["delete", "lun"], map: ["lun", "path"], attach: ["lun", "connection"], detach: ["delete", "connection"],
  expand: ["expand"], grow: ["expand"], resize: ["expand"], shrink: ["shrink"],
};

// Verbs that reveal whether the caller wants to read or to change something.
const READ_VERBS = new Set("list show get view display which what whats how status current is are see find check count".split(" "));
const WRITE_VERBS = new Set("create add delete remove start stop pause resume register unregister rotate send silence expand allocate attach detach install uninstall upload update modify set assign grant revoke enable disable reset generate validate refresh migrate".split(" "));

/** Lower-cased alphanumeric words of a request, in order (no stemming or stopword removal). */
export function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function intentOf(query: string): "read" | "write" | null {
  const w = words(query);
  if (w.some((x) => WRITE_VERBS.has(x))) return "write";
  if (w.some((x) => READ_VERBS.has(x))) return "read";
  return null;
}

function tokenize(text: string): string[] {
  return text
    .replace(/\b([A-Z]{2,})s\b/g, (_, a: string) => `${a.toLowerCase()}s`) // WWNs → wwns, not "WW Ns"
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase → camel Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

// Very light stemming: enough to fold plurals and -ing/-ed forms together.
function stem(t: string): string {
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 4 && t.endsWith("ing")) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith("ed")) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("es") && !t.endsWith("ses")) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

function expandQuery(query: string): { terms: string[]; original: Set<string> } {
  const base = tokenize(query);
  const original = new Set(base);
  const terms = [...base];
  for (const raw of words(query)) {
    for (const syn of SYNONYMS[raw] ?? []) for (const t of tokenize(syn)) if (!terms.includes(t)) terms.push(t);
  }
  return { terms, original };
}

export type Confidence = "high" | "medium" | "low";

interface SearchHit {
  op: Operation;
  score: number;
  matched: string[];
}

export interface SearchResult {
  hits: SearchHit[];
  confidence: Confidence;
  reason: string;
  /** Raw signals behind the confidence rating, for logging. lead is null when there is one hit or none. */
  lead: number | null;
  coverage: number;
  intent: "read" | "write" | null;
}

export class OperationIndex {
  private docs: { op: Operation; tf: Map<string, number>; len: number }[] = [];
  private df = new Map<string, number>();
  private avgLen = 0;

  /** `examples` maps operationIds to sample user questions, indexed as an extra field. */
  constructor(ops: Iterable<Operation>, examples: Record<string, string[]> = {}) {
    for (const op of ops) {
      const tf = new Map<string, number>();
      const add = (text: string, weight: number) => {
        for (const t of tokenize(text)) tf.set(t, (tf.get(t) ?? 0) + weight);
      };
      add(op.operationId, FIELD_WEIGHTS.operationId);
      add(op.summary, FIELD_WEIGHTS.summary);
      add(op.tag, FIELD_WEIGHTS.tag);
      add(op.path.replace(/\{[^}]+\}/g, " "), FIELD_WEIGHTS.path);
      add(op.description.slice(0, 1500), FIELD_WEIGHTS.description);
      for (const q of examples[op.operationId] ?? []) add(q, FIELD_WEIGHTS.examples);
      const len = [...tf.values()].reduce((a, b) => a + b, 0);
      this.docs.push({ op, tf, len });
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    this.avgLen = this.docs.reduce((a, d) => a + d.len, 0) / Math.max(1, this.docs.length);
  }

  private idf(t: string): number {
    const n = this.docs.length, df = this.df.get(t) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  search(query: string, opts: { tag?: string; limit: number }): SearchResult {
    const { terms, original } = expandQuery(query);
    const tag = opts.tag?.toLowerCase();
    const intent = intentOf(query);
    // A request naming a specific object ("device 123", "by id") may want an {id} endpoint.
    const wantsOne = /\b(by id|id|this|that|specific|one|single|a single)\b/.test(query.toLowerCase());
    const hits: SearchHit[] = [];
    for (const d of this.docs) {
      if (tag && d.op.tag.toLowerCase() !== tag) continue;
      let score = 0;
      const matched: string[] = [];
      for (const t of terms) {
        const f = d.tf.get(t);
        if (!f) continue;
        // Synonym expansions count for half, so the user's own words dominate.
        const w = original.has(t) ? 1 : 0.5;
        score += w * this.idf(t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / this.avgLen)));
        matched.push(t);
      }
      if (score <= 0) continue;
      // Priors: match the verb's intent, and prefer collections for list-style reads.
      const isRead = d.op.method === "GET" || d.op.readOnly;
      if (intent === "read") score *= isRead ? 1.25 : 0.7;
      if (intent === "write") score *= d.op.method === "GET" ? 0.75 : 1.2;
      if (intent !== "write" && !wantsOne && /\{[^}]+\}/.test(d.op.path)) score *= 0.8;
      hits.push({ op: d.op, score, matched });
    }
    hits.sort((a, b) => b.score - a.score);
    const limited = hits.slice(0, opts.limit);
    return { hits: limited, intent, ...this.confidence(hits, original) };
  }

  /**
   * Confidence from two signals: how far the top hit leads the runner-up, and
   * how much of the user's own wording (not synonym expansions) it covers.
   */
  private confidence(hits: SearchHit[], original: Set<string>): { confidence: Confidence; reason: string; lead: number | null; coverage: number } {
    if (!hits.length) return { confidence: "low", reason: "no operation matched any query term", lead: null, coverage: 0 };
    const [top, second] = hits;
    const coverage = original.size ? top.matched.filter((t) => original.has(t)).length / original.size : 0;
    const lead = second ? top.score / second.score : Infinity;
    const pct = Math.round(coverage * 100);
    const leadText = lead === Infinity ? "it is the only match" : `it leads the next by ${lead.toFixed(2)}×`;
    const signals = { lead: lead === Infinity ? null : +lead.toFixed(3), coverage: +coverage.toFixed(3) };
    if (lead >= 1.3 && coverage >= 0.6) return { confidence: "high", reason: `${leadText} and covers ${pct}% of the query terms`, ...signals };
    if ((lead >= 1.1 && coverage >= 0.5) || coverage >= 0.75) return { confidence: "medium", reason: `${leadText} and covers ${pct}% of the query terms`, ...signals };
    return { confidence: "low", reason: `${leadText}, covering ${pct}% of the query terms`, ...signals };
  }
}
