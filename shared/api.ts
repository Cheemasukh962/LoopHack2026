/**
 * Shared code between client and server.
 * Types here are the wire contract for the frontend-wiring endpoints. Keeping them in one
 * place means the Express handlers and the React pages can never drift apart.
 */

/** Example response type for /api/demo (kept from the starter). */
export interface DemoResponse {
  message: string;
}

// ---- /api/me ----
export interface User {
  handle: string;
  avatar: string;
  githubConnected: boolean;
  resumeUploaded: boolean;
}

// ---- /api/feed ----
export interface FeedActor {
  name: string;
  avatar: string;
  verified: boolean;
}

export interface FeedItem {
  id: string; // issue id, used for /issue/:id
  actor: FeedActor;
  action: string; // e.g. "planning"
  issueRef: { id: string; title: string };
  createdAtMs: number; // client renders relative time from this
  status: string; // e.g. "In progress"
  headline: string;
  excerpt: string;
  reactions: number;
  comments: number;
}

// ---- /api/issues/:id ----
export interface Activity {
  author: string;
  action: string;
  commitLabel?: string;
  commitHash?: string;
}

export interface PlanStep {
  title: string;
  tagline: string;
}

export interface PlanSectionDTO {
  title: string; // "Planning" | "Implementation" | "Review"
  assigned: string[];
  text?: string;
  steps?: PlanStep[];
}

export interface Plan {
  author: string; // e.g. "agent"
  action: string;
  sections: PlanSectionDTO[];
}

export type CheckState = "success" | "pending";

export interface Check {
  label: string;
  provider: "planning" | "implementation" | "vercel" | "review";
  required: boolean;
  state: CheckState;
}

export interface MergeStatus {
  phasesAwaiting: number;
  summary: string;
  pending: Check[];
  successful: Check[];
}

export interface IssueKickoff {
  author: string;
  action: string;
  heading: string;
  checklist: string[];
  sections: { heading: string; body: string }[];
}

export interface IssueDetail {
  id: string;
  title: string;
  author: string;
  createdAtMs: number;
  kickoff: IssueKickoff;
  activities: Activity[];
  plan: Plan;
  merge: MergeStatus;
}
