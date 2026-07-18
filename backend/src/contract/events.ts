// FROZEN CONTRACT — shared with frontend. Do NOT rename events or change payload shapes.
// These are the same names an EventBridge bus would use (maps 1:1).

export type Provenance = "human" | "keeper_decomposer" | "keeper_scanner";

/** Every event type that flows on the bus. Frontend renders the ones in the "rendered" set. */
export type EventType =
  | "issue.created"
  | "recall.hit"
  | "locate.done"
  | "plan.created"
  | "plan.too_large"
  | "plan.revised"
  | "route.assigned"
  | "branch.created"
  | "branch.merged"
  | "main.merged"
  | "push"
  | "ci.completed"
  | "ci.failed"
  | "boundary.violated"
  | "pomerium.authorized"
  | "pomerium.denied"
  | "scan.started"
  | "scan.found"
  | "gap.detected"
  | "repo.connected"
  | "person.added"
  | "index.ready"
  | "profile.ready"
  | "phase.updated"
  | "tool.discovered"
  | "commit";

/** The generic envelope every publish/subscribe uses. */
export interface BusEvent<T = Record<string, unknown>> {
  type: EventType;
  issue_id?: string;
  provenance?: "human" | "keeper" | null;
  payload: T;
}

// ---- Selected payload shapes (extend as needed, but never break existing fields) ----

export interface IssueCreatedPayload {
  issue_id: string;
  title: string;
  body: string;
  provenance: Provenance;
  parent_issue?: string | null;
}

export interface RecallHitPayload {
  issue_id: string;
  prior_art: { issue_id: string; similarity: number; resolution: string }[];
}

export interface LocateDonePayload {
  issue_id: string;
  file_boundary: string[];
  blame: { path: string; last_author: string }[];
}

export interface PlanCreatedPayload {
  issue_id: string;
  plan_id: string;
  version: number;
  too_large: boolean;
}

export interface RouteAssignedPayload {
  issue_id: string;
  assignee: { person_id: string; name: string; context_score: number; why: string };
}

/** Phase state machine — the projection over loop_events (Round 2, eng-a). */
export type PhaseName = "planning" | "implementation" | "review";
export type PhaseStatus = "pending" | "active" | "passed" | "failed";

export interface PhaseUpdatedPayload {
  issue_id: string;
  phase: PhaseName;
  status: PhaseStatus;
  detail: string;
}

/** Zero.xyz discovered a specialized tool while planning a fix (Round 2, eng-a). */
export interface ToolDiscoveredPayload {
  issue_id: string;
  plan_version: number;
  tool_name: string;
  why: string;
  signal: string;
}
