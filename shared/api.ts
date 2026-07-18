/**
 * Shared contract types (client ↔ Keeper backend).
 * Mirrors the frozen backend contract in backend/src/contract/{api,events}.ts.
 * Field names are kept identical so the mock and http adapters are interchangeable.
 */

export interface DemoResponse {
  message: string;
}

export type Provenance = "human" | "keeper_decomposer" | "keeper_scanner";
export type IssueState = "open" | "closed" | "in_progress";
export type PhaseName = "planning" | "implementation" | "review";
export type PhaseStatus = "pending" | "active" | "passed" | "failed";

/** What the composer sends: POST /issues { title, body } -> { issue_id } */
export interface CreateIssueInput {
  title: string;
  body: string;
}

export interface Author {
  name: string;
  github_handle: string;
  avatar_url?: string;
}

export interface Issue {
  issue_id: string;
  title: string;
  body: string;
  state: IssueState;
  provenance: Provenance;
  author: Author;
  created_at: string; // ISO 8601
}

export interface PriorArt {
  issue_id: string;
  similarity: number;
  resolution: string;
}

export interface Assignee {
  person_id?: string;
  name: string;
  context_score: number;
  why?: string;
}

/** Zero.xyz discovered tool attached to a plan. */
export interface RecommendedTool {
  tool_name: string;
  why: string;
}

export interface Plan {
  plan_id: string;
  issue_id: string;
  version: number;
  revised_because?: string | null;
  prior_art?: PriorArt[]; // Nexla recall
  root_cause_hypothesis: string;
  file_boundary: string[]; // Nexla blame → Pomerium boundary
  blast_radius?: { call_sites: number; services_affected: number };
  legacy_checklist?: string[];
  test_strategy?: string;
  assignee: Assignee | null; // Nexla whoHasContext
  recommended_tool?: RecommendedTool; // Zero.xyz
}

/** The full payload the detail page renders. */
export interface IssueDetail {
  issue: Issue;
  plan: Plan | null;
  versions: number;
}

/** GET /issues -> IssueSummary[] (feed). */
export interface IssueSummary {
  issue_id: string;
  title: string;
  state: string;
  provenance: Provenance;
  parent_issue: string | null;
  assignee: { person_id: string; name: string; context_score: number } | null;
  plan_version: number;
  branch: string | null;
}

/** GET /issues/:id/phases -> the merge-gate state machine. */
export interface PhaseView {
  issue_id: string;
  phases: { phase: PhaseName; status: PhaseStatus; detail: string; updated_at: string }[];
  merge_blocked: boolean;
  blocking_reason: string | null;
}

/** GET /events -> the live bus stream the UI mirrors. */
export interface LoopEvent {
  event_id: string;
  ts: string;
  type: string;
  issue_id: string;
  provenance: "human" | "keeper" | null;
  payload: Record<string, unknown>;
}

/** GET /stats -> the autonomy counter. */
export interface Stats {
  human_filed: number;
  keeper_filed: number;
  plans_revised: number;
  branches_open: number;
}

/** GET /repo -> which real repo the loop is running on. */
export interface RepoMeta {
  mode: string; // "live-repo" | "seed" | "mock"
  target: string | null;
  html_url?: string;
  dominant_dir?: string;
  contributors?: number;
  commits?: number;
  files?: number;
  fetched_at?: string;
}

/** GET /repo/people -> real contributors with their Nexla context score. */
export interface RepoPerson {
  login: string;
  name: string;
  contributions: number;
  avatar_url: string;
  html_url: string;
  context_score: number;
  module: string;
}

/** GET /sponsors -> per-sponsor live/local status. */
export interface SponsorStatus {
  data_source: { mode: string; target?: string };
  sponsors: Record<string, { mode: string; data?: string; note?: string }>;
}
