// Teammate B — Nexla ownership + history layer.
//
// Answers the two Nexla questions that make recall feel real on stage:
//   1. "Who actually has context on src/http/retry.ts?"  -> whoHasContext(path)
//   2. "Have we seen this before?"                        -> priorArt(query)
//
// The frozen contract only requires `NexlaContext` (whoHasContext, priorArt).
// We implement that PLUS a few extra read helpers (blameFor, locateFiles) that the
// `locate` service uses. Data is modelled as **Nexsets** — Nexla's typed, discoverable
// data products — so the architecture is identical whether the rows come from the Nexla
// MCP/REST API or from this local fallback. Per the role brief: try Nexla, fall back to a
// local module serving the same Nexset shape. This file is the fallback.
//
// Scoring we defend on stage (PRD §4):
//   context_score = 0.5*recency_weighted_blame + 0.3*pr_authorship + 0.2*review_participation
//   if repo_commits < 5:  context_score = 0.7*resume_prior + 0.3*external_github_prior  // cold-start
// The point: git blame outranks the résumé. A résumé claim must never beat real blame.

import type { NexlaContext } from "../contract";
import { NexlaClient } from "./client.js";

// ---- Nexset row shapes (the "same shape" a Nexla Nexset would hand back) ----------------

/** One row of the ownership Nexset: a person's measured context on a path. */
export interface OwnershipRow {
  person_id: string;
  name: string;
  path: string; // module or file prefix this row scores, e.g. "src/http"
  // measured-from-git signals, each already normalised to 0..1
  recency_weighted_blame: number;
  pr_authorship: number;
  review_participation: number;
  repo_commits: number;
  // cold-start-only signals (used when repo_commits < 5)
  resume_prior: number;
  external_github_prior: number;
}

/** One row of the blame Nexset: who last touched a concrete file. */
export interface BlameRow {
  path: string;
  last_author: string; // person_id
  recent_authors: string[]; // person_ids, most-recent first
}

/** One row of the history Nexset: a resolved past issue, for prior-art recall. */
export interface HistoryRow {
  issue_id: string;
  title: string;
  body: string;
  resolution: string;
  linked_files: string[];
  keywords: string[];
}

const COLD_START_COMMITS = 5;

// ---- The local Nexsets (staged history; the loop over it is real) -----------------------

const OWNERSHIP: OwnershipRow[] = [
  // Marco truly owns src/http — heavy recent blame on retry.ts. This is the TRUE owner.
  { person_id: "p_marco", name: "Marco Reyes", path: "src/http",
    recency_weighted_blame: 0.92, pr_authorship: 0.85, review_participation: 0.60,
    repo_commits: 47, resume_prior: 0.30, external_github_prior: 0.40 },
  // Lee reviews http PRs but rarely authors — should sit below Marco.
  { person_id: "p_lee", name: "Lee Zhou", path: "src/http",
    recency_weighted_blame: 0.18, pr_authorship: 0.12, review_participation: 0.70,
    repo_commits: 12, resume_prior: 0.20, external_github_prior: 0.30 },
  // Sam is the RÉSUMÉ CLAIMANT: CV screams "HTTP/reliability expert" but 0 commits in src/http.
  // Cold-start (repo_commits < 5) so scored on résumé — and must still LOSE to Marco's blame.
  { person_id: "p_sam", name: "Sam Delgado", path: "src/http",
    recency_weighted_blame: 0.00, pr_authorship: 0.00, review_participation: 0.00,
    repo_commits: 1, resume_prior: 0.85, external_github_prior: 0.60 },

  // Dana owns auth.
  { person_id: "p_dana", name: "Dana Okafor", path: "src/auth",
    recency_weighted_blame: 0.90, pr_authorship: 0.80, review_participation: 0.55,
    repo_commits: 33, resume_prior: 0.40, external_github_prior: 0.45 },
  // Priya owns infra/terraform.
  { person_id: "p_priya", name: "Priya Nair", path: "infra",
    recency_weighted_blame: 0.88, pr_authorship: 0.72, review_participation: 0.45,
    repo_commits: 21, resume_prior: 0.35, external_github_prior: 0.50 },
];

const BLAME: BlameRow[] = [
  { path: "src/http/retry.ts", last_author: "p_marco", recent_authors: ["p_marco", "p_lee"] },
  { path: "src/http/client.ts", last_author: "p_marco", recent_authors: ["p_marco"] },
  { path: "src/auth/session.ts", last_author: "p_dana", recent_authors: ["p_dana"] },
  { path: "infra/main.tf", last_author: "p_priya", recent_authors: ["p_priya"] },
];

const HISTORY: HistoryRow[] = [
  { issue_id: "#412", title: "Intermittent 500s under load at checkout",
    body: "Retries without a timeout hammered the upstream during checkout traffic spikes, producing intermittent 500s.",
    resolution: "Added a per-attempt timeout + jittered backoff in src/http/retry.ts.",
    linked_files: ["src/http/retry.ts"],
    keywords: ["intermittent", "500", "retry", "timeout", "checkout", "upstream", "backoff", "load"] },
  { issue_id: "#388", title: "Checkout latency spikes under concurrency",
    body: "Connection pool exhaustion caused latency spikes on the checkout path.",
    resolution: "Tuned the HTTP connection pool in src/http/client.ts.",
    linked_files: ["src/http/client.ts"],
    keywords: ["checkout", "latency", "pool", "http", "concurrency", "spikes"] },
  { issue_id: "#299", title: "Retry storm on upstream 503s",
    body: "A burst of 503s triggered a retry storm with no circuit breaker.",
    resolution: "Added a circuit breaker around retries in src/http/retry.ts.",
    linked_files: ["src/http/retry.ts"],
    keywords: ["retry", "storm", "503", "circuit", "breaker", "upstream"] },
  { issue_id: "#401", title: "Session token expires mid-checkout",
    body: "Auth session tokens expired during long checkouts, logging users out.",
    resolution: "Added a refresh flow in src/auth/session.ts.",
    linked_files: ["src/auth/session.ts"],
    keywords: ["session", "token", "expiry", "auth", "checkout", "refresh"] },
  { issue_id: "#350", title: "Terraform apply drops the ALB idle timeout",
    body: "An infra change reset the ALB idle timeout, closing long connections early.",
    resolution: "Pinned the ALB idle timeout in infra/main.tf.",
    linked_files: ["infra/main.tf"],
    keywords: ["terraform", "alb", "timeout", "infra", "idle", "connection"] },
  { issue_id: "#420", title: "Flaky checkout integration tests",
    body: "Checkout integration tests flaked because of unmocked network retries.",
    resolution: "Stubbed the HTTP client and made retries deterministic in tests.",
    linked_files: ["src/http/retry.ts", "src/http/client.ts"],
    keywords: ["flaky", "test", "checkout", "retry", "http", "mock"] },
];

// ---- Helpers ---------------------------------------------------------------------------

const STOP = new Set([
  "the", "a", "an", "on", "in", "at", "of", "to", "for", "and", "or", "is", "are",
  "with", "under", "our", "we", "it", "its", "this", "that", "from", "by", "as",
]);

/** Light stemmer so trivial variants match: 500s->500, retries->retry, intermittently->intermittent. */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ly")) w = w.slice(0, -2);
  if (w.length > 4 && w.endsWith("ing")) w = w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.length > 3 && w.endsWith("es")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  return w;
}

/** Lower-case, stop-words removed, length >= 2, lightly stemmed. */
function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w) => w.length >= 2 && !STOP.has(w))
    .map(stem);
}

/** Jaccard-ish similarity of a query against a history row's searchable text. */
function similarity(queryTokens: Set<string>, row: HistoryRow): number {
  const rowTokens = new Set([
    ...tokenize(row.title),
    ...tokenize(row.body),
    ...row.keywords.map((k) => stem(k.toLowerCase())),
  ]);
  let overlap = 0;
  for (const t of queryTokens) if (rowTokens.has(t)) overlap++;
  const union = queryTokens.size + rowTokens.size - overlap;
  return union === 0 ? 0 : overlap / union;
}

/** The scoring we defend on stage. Blame path when the person has real commits; résumé path only cold-start. */
function contextScore(row: OwnershipRow): { score: number; basis: "blame" | "cold_start" } {
  if (row.repo_commits < COLD_START_COMMITS) {
    return {
      score: 0.7 * row.resume_prior + 0.3 * row.external_github_prior,
      basis: "cold_start",
    };
  }
  return {
    score:
      0.5 * row.recency_weighted_blame +
      0.3 * row.pr_authorship +
      0.2 * row.review_participation,
    basis: "blame",
  };
}

/** Does an ownership row for `path` cover the queried path? (module prefix match, either direction) */
function pathMatches(rowPath: string, query: string): boolean {
  return query === rowPath || query.startsWith(rowPath + "/") || rowPath.startsWith(query + "/");
}

// ---- The Nexla context layer -----------------------------------------------------------

/**
 * Local implementation of the frozen `NexlaContext`, plus blame/locate read helpers used by
 * the `locate` service. Swap the private lookups for Nexla MCP/REST calls and every consumer
 * keeps working unchanged — the Nexset shapes are identical.
 */
export class LocalNexla implements NexlaContext {
  constructor(
    private readonly ownership: OwnershipRow[] = OWNERSHIP,
    private readonly blame: BlameRow[] = BLAME,
    private readonly history: HistoryRow[] = HISTORY,
  ) {}

  /** Ranked people with real context on `path`. Blame outranks the résumé, by construction. */
  async whoHasContext(
    path: string,
  ): Promise<{ person_id: string; score: number; why: string }[]> {
    const ranked = this.ownership
      .filter((r) => pathMatches(r.path, path))
      .map((r) => {
        const { score, basis } = contextScore(r);
        return { row: r, score, basis };
      })
      .sort((a, b) => b.score - a.score);

    return ranked.map(({ row, score, basis }, i) => {
      const s = score.toFixed(2);
      const why =
        basis === "blame"
          ? `${row.name}: ${s} on ${row.path} — recency-weighted git blame (${row.repo_commits} commits, ${(row.recency_weighted_blame * 100) | 0}% recent blame), not a résumé claim.`
          : `${row.name}: ${s} on ${row.path} — cold-start résumé/external-GitHub prior only (${row.repo_commits} commit${row.repo_commits === 1 ? "" : "s"} here). Ranked #${i + 1}; deferred to real blame above it.`;
      return { person_id: row.person_id, score: Number(score.toFixed(4)), why };
    });
  }

  /** Prior resolved issues similar to `query`, most-similar first. */
  async priorArt(
    query: string,
  ): Promise<{ issue_id: string; similarity: number; resolution: string }[]> {
    const q = new Set(tokenize(query));
    return this.history
      .map((row) => ({
        issue_id: row.issue_id,
        similarity: Number(similarity(q, row).toFixed(4)),
        resolution: row.resolution,
      }))
      .filter((r) => r.similarity > 0.05)
      .sort((a, b) => b.similarity - a.similarity);
  }

  // ---- Extra read helpers (beyond the frozen interface) used by locate ----

  /** Blame for a concrete file path, or undefined if we have no row. */
  async blameFor(path: string): Promise<BlameRow | undefined> {
    return this.blame.find((b) => b.path === path);
  }

  /** Full prior-art rows (with linked files) for locate to derive a file_boundary. */
  async priorArtRows(query: string): Promise<{ row: HistoryRow; similarity: number }[]> {
    const q = new Set(tokenize(query));
    return this.history
      .map((row) => ({ row, similarity: similarity(q, row) }))
      .filter((r) => r.similarity > 0.05)
      .sort((a, b) => b.similarity - a.similarity);
  }

  /** All files we hold blame for (used as a fallback candidate set). */
  async knownFiles(): Promise<string[]> {
    return this.blame.map((b) => b.path);
  }

  /** Union of files linked to the given prior-art issue ids, preserving the input order. */
  async linkedFilesForIssues(issueIds: string[]): Promise<string[]> {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of issueIds) {
      const row = this.history.find((h) => h.issue_id === id);
      if (!row) continue;
      for (const f of row.linked_files) {
        if (!seen.has(f)) {
          seen.add(f);
          out.push(f);
        }
      }
    }
    return out;
  }
}

/**
 * Build the Nexla context layer. When NEXLA_API_KEY is set we authenticate against the real
 * Nexla API with the service key (proving the sponsor integration is live), then serve the
 * ownership/history data from the identical-shape local Nexsets. Once the account's Nexset ids
 * are provided (NEXLA_OWNERSHIP_NEXSET etc.), swap client.queryNexset() in per method — nothing
 * downstream changes because the shapes match. Auth is non-blocking so boot is never delayed,
 * and any failure degrades cleanly to the local Nexsets.
 */
export async function createNexla(): Promise<LocalNexla> {
  const local = new LocalNexla();
  const apiKey = process.env.NEXLA_API_KEY;
  if (apiKey) {
    const client = new NexlaClient({ apiKey, apiUrl: process.env.NEXLA_API_URL });
    void client.authenticate().then((auth) => {
      console.info(
        auth.ok
          ? "[nexla] service key authenticated (live) — serving Nexsets locally until Nexset ids are configured"
          : `[nexla] live auth unavailable (${auth.detail}) — using local Nexsets`,
      );
    });
  } else {
    console.info("[nexla] no NEXLA_API_KEY — using local Nexsets");
  }
  return local;
}
