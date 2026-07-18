/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

/* ------------------------------------------------------------------ *
 * Keeper contract (subset)
 * Mirrors the frozen contract on `main` at src/contract/{api,models}.ts.
 * The frontend reads these shapes from GET/POST /api/v1/... — keeping the
 * field names identical means the mock and http adapters are interchangeable.
 * ------------------------------------------------------------------ */

export type Provenance = "human" | "keeper_decomposer" | "keeper_scanner";
export type IssueState = "open" | "closed" | "in_progress";

/** What the composer sends: POST /issues { title, body } -> { issue_id } */
export interface CreateIssueInput {
  title: string;
  body: string;
}

/** GET /issues/:id -> { issue } (plan/versions arrive later, async, from Keeper) */
export interface Issue {
  issue_id: string;
  title: string;
  body: string;
  state: IssueState;
  provenance: Provenance;
  author: { name: string; github_handle: string; avatar_url?: string };
  created_at: string; // ISO 8601
}

export interface Plan {
  plan_id: string;
  issue_id: string;
  version: number;
  root_cause_hypothesis: string;
  approach?: string; // the proposed change (PM spec)
  acceptance_criteria?: string[]; // "done when…"
  subtasks?: string[]; // the PM's breakdown
  blast_radius?: { call_sites: number; services_affected: number };
  test_strategy?: string;
  file_boundary: string[];
  assignee: { name: string; context_score: number; why: string } | null;
}

/** The full payload the detail page renders. */
export interface IssueDetail {
  issue: Issue;
  plan: Plan | null;
  versions: number;
}
