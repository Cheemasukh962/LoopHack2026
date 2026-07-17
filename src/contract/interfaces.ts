// FROZEN CONTRACT — the seams between the three agents' code.
// Code against THESE interfaces so you are never blocked waiting on another agent.
// Teammate A implements EventBus + Store. Teammate C implements LlmClient + PomeriumGuard + ToolDiscovery.
// Teammate B implements NexlaContext.

import type { BusEvent, EventType } from "./events";
import type {
  PersonRecord, IssueRecord, PlanRecord, LoopEventRecord, BranchRecord,
} from "./models";

/** In-memory event bus (Teammate A). Same semantics as EventBridge rules. */
export interface EventBus {
  publish(event: BusEvent): void;
  subscribe(type: EventType, handler: (event: BusEvent) => void | Promise<void>): void;
}

/** In-memory data store (Teammate A). Every service reads/writes through this. */
export interface Store {
  // people
  getPeople(): PersonRecord[];
  getPerson(id: string): PersonRecord | undefined;
  upsertPerson(p: PersonRecord): void;
  // issues
  getIssues(filter?: { provenance?: string; state?: string }): IssueRecord[];
  getIssue(id: string): IssueRecord | undefined;
  upsertIssue(i: IssueRecord): void;
  // plans (never overwrite — always a new version)
  getPlans(issueId: string): PlanRecord[];
  latestPlan(issueId: string): PlanRecord | undefined;
  insertPlan(p: PlanRecord): void;
  // branches
  getBranches(): BranchRecord[];
  upsertBranch(b: BranchRecord): void;
  // loop_events — the demo lives here. Call on EVERY action.
  appendEvent(e: Omit<LoopEventRecord, "event_id" | "ts">): LoopEventRecord;
  getEvents(sinceTs?: string): LoopEventRecord[];
}

/** Claude access, unblocked by Zero.xyz (Teammate C). */
export interface LlmClient {
  complete(prompt: string, opts?: { system?: string; model?: string }): Promise<string>;
  completeJson<T>(prompt: string, opts?: { system?: string; model?: string }): Promise<T>;
}

/** Pomerium guardrail (Teammate C). Wrap EVERY write with this. */
export interface PomeriumGuard {
  /** Physically blocks writes outside file_boundary and over the ≤5/hr filing cap.
   *  Emits pomerium.authorized / pomerium.denied loop_events. Returns false => do NOT execute. */
  authorizeWrite(req: {
    action: "file_issue" | "comment" | "branch" | "assign";
    identity: string;         // "keeper" or a person_id
    scope: string[];          // paths this write touches
    reason: string;
    issue_id?: string;
  }): Promise<boolean>;
}

/** Zero.xyz mid-loop tool discovery (Teammate C). The scanner calls this when it hits
 *  something it wasn't pre-wired for (Terraform, a CVE bump, an unknown language). */
export interface ToolDiscovery {
  discoverTool(context: { signal: string; hint?: string }): Promise<{
    tool_name: string;
    why: string;
    run: (input: string) => Promise<{ findings: string[] }>;
  }>;
}

/** Nexla ownership + history layer (Teammate B). REST or MCP behind the same shape. */
export interface NexlaContext {
  whoHasContext(path: string): Promise<{ person_id: string; score: number; why: string }[]>;
  priorArt(query: string): Promise<{ issue_id: string; similarity: number; resolution: string }[]>;
}
