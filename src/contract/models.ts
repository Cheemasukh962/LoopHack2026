// FROZEN CONTRACT — the internal store records. Mirrors PRD section 5.
// (DynamoDB in the real architecture; an in-memory map here.)

import type { Provenance } from "./events";

export interface PersonRecord {
  person_id: string;
  name: string;
  github_handle: string;
  email: string;
  resume_s3_key?: string;
  resume_parsed: { skills: string[]; stacks: string[]; years_per_stack?: Record<string, number> };
  external_github?: { langs: string[]; repo_count: number; top_stacks: string[] };
  repo_commits: number;
  context_scores: Record<string, number>;
  cold_start: boolean;
}

export interface IssueRecord {
  issue_id: string;
  title: string;
  body: string;
  state: "open" | "closed" | "in_progress";
  provenance: Provenance;
  parent_issue: string | null;
  children: string[];
  branch: string | null;
  created_at: string;
}

export interface PlanRecord {
  plan_id: string;
  issue_id: string;
  version: number;
  revised_because: null | string; // e.g. "ci_failure:run_8871" | "main_merge:sha_a3f9"
  prior_art: { issue_id: string; similarity: number; resolution: string }[];
  root_cause_hypothesis: string;
  file_boundary: string[];
  blast_radius: { call_sites: number; services_affected: number };
  legacy_checklist: string[];
  test_strategy: string;
  assignee: { person_id: string; context_score: number; why: string };
  created_at: string;
}

export interface LoopEventRecord {
  event_id: string;
  ts: string;
  type: string;
  issue_id: string;
  provenance: "human" | "keeper" | null;
  payload: Record<string, unknown>;
}

export interface BranchRecord {
  branch_name: string;
  issue_id: string;
  plan_version: number;
  file_boundary: string[];
  state: "open" | "merged" | "stale";
  base_sha: string;
  opened_at: string;
}
