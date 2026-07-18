// FROZEN CONTRACT — the /api/v1 shapes the frontend reads. Do NOT change field names.
// Base path: /api/v1   ·   Port: 8787
//
// Endpoints (see docs for full list):
//   POST /repos/connect            { repo_url } -> { repo_id, status }
//   GET  /repos/:id/status         -> { status, progress, done }
//   POST /people                   { name, github_handle, email } -> { person_id }
//   POST /people/:id/resume        multipart -> { parsed }
//   POST /people/:id/github        { handle } -> { external }
//   GET  /people                   -> Person[]
//   GET  /people/:id               -> Person
//   GET  /issues       ?provenance=&state=   -> IssueSummary[]
//   GET  /issues/:id               -> { issue, plan, versions }
//   GET  /issues/:id/tree          -> { root, children }
//   GET  /plans/:id                -> Plan
//   GET  /stats                    -> Stats
//   GET  /events       ?since=<ts> -> LoopEvent[]   (frontend polls every 2s)
//   POST /issues                   { title, body } -> { issue_id }  (demo seed only)

import type { Provenance, PhaseName, PhaseStatus } from "./events";

export interface Person {
  person_id: string;
  name: string;
  github_handle: string;
  cold_start: boolean;
  context_scores: Record<string, number>; // path -> score
  resume_parsed: { skills: string[]; stacks: string[] };
  repo_commits: number;
}

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

export interface Plan {
  plan_id: string;
  issue_id: string;
  version: number;
  revised_because: string | null;
  prior_art: { issue_id: string; similarity: number; resolution: string }[];
  root_cause_hypothesis: string;
  file_boundary: string[];
  blast_radius: { call_sites: number; services_affected: number };
  legacy_checklist: string[];
  test_strategy: string;
  assignee: { person_id: string; name: string; context_score: number; why: string };
  recommended_tool?: { tool_name: string; why: string };
}

/** Projection of the phase state machine for one issue — GET /issues/:id/phases (Round 2). */
export interface PhaseView {
  issue_id: string;
  phases: { phase: PhaseName; status: PhaseStatus; detail: string; updated_at: string }[];
  merge_blocked: boolean;      // true unless all three phases are "passed"
  blocking_reason: string | null;
}

export interface LoopEvent {
  event_id: string;
  ts: string;
  type: string;
  issue_id: string;
  provenance: "human" | "keeper" | null;
  payload: Record<string, unknown>;
}

export interface Stats {
  human_filed: number;
  keeper_filed: number;
  plans_revised: number;
  branches_open: number;
}
