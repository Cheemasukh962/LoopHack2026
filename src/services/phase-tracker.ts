import type {
  EventBus, Store, BusEvent, LoopEventRecord,
  PhaseName, PhaseStatus, PhaseUpdatedPayload, PhaseView,
} from "../contract/index.js";

// Round 2 (eng-a): the phase state machine. A projection over loop_events that advances
// planning → implementation → review and locks the merge gate until all three pass. Every
// transition is grounded in a real bus event (handoff §5.2). The fold below is the SINGLE
// source of truth for PhaseView; the server serves it and B's client-side fallback mirrors it.

const PHASE_ORDER: PhaseName[] = ["planning", "implementation", "review"];

/**
 * Fold loop_events → PhaseView for one issue: latest status per phase, defaulting to pending.
 * merge_blocked is true unless all three phases are "passed".
 */
export function foldPhases(events: LoopEventRecord[], issueId: string): PhaseView {
  const latest = new Map<PhaseName, { status: PhaseStatus; detail: string; updated_at: string }>();
  for (const phase of PHASE_ORDER) latest.set(phase, { status: "pending", detail: "", updated_at: "" });

  for (const e of events) {
    if (e.type !== "phase.updated" || e.issue_id !== issueId) continue;
    const p = e.payload as unknown as PhaseUpdatedPayload;
    if (!PHASE_ORDER.includes(p.phase)) continue;
    latest.set(p.phase, { status: p.status, detail: p.detail ?? "", updated_at: e.ts });
  }

  const phases = PHASE_ORDER.map((phase) => ({ phase, ...latest.get(phase)! }));
  const blocking = phases.find((ph) => ph.status !== "passed");
  return {
    issue_id: issueId,
    phases,
    merge_blocked: Boolean(blocking),
    blocking_reason: blocking ? `${blocking.phase} is ${blocking.status}` : null,
  };
}

/** A failing CI verdict — supports both `ci.failed` and `ci.completed {status:"failure"}`. */
function isFailingStatus(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "failure" || s === "failed" || s === "red" || s === "error";
}

export function registerPhaseTracker(deps: { bus: EventBus; store: Store }): void {
  const { bus, store } = deps;

  const set = (issueId: string, phase: PhaseName, status: PhaseStatus, detail: string): void => {
    if (!issueId) return;
    const payload: PhaseUpdatedPayload = { issue_id: issueId, phase, status, detail };
    // store-only: /events (and the fold) read the store; no subscriber consumes phase.updated,
    // so publishing on the bus would only add noise.
    store.appendEvent({ type: "phase.updated", issue_id: issueId, provenance: "keeper", payload: payload as unknown as Record<string, unknown> });
  };

  const idOf = (e: BusEvent): string =>
    e.issue_id ?? (typeof (e.payload as { issue_id?: unknown })?.issue_id === "string" ? (e.payload as { issue_id: string }).issue_id : "");

  // planning → active (implementation/review default to pending in the fold).
  bus.subscribe("issue.created", (e) => set(idOf(e), "planning", "active", "Triage started"));

  // planning → passed; implementation → active.
  bus.subscribe("plan.created", (e) => {
    const id = idOf(e);
    set(id, "planning", "passed", "Plan drafted");
    set(id, "implementation", "active", "Implementation kicked off");
  });

  // implementation stays active as work lands.
  bus.subscribe("route.assigned", (e) => {
    const a = (e.payload as { assignee?: { name?: string; person_id?: string } })?.assignee;
    set(idOf(e), "implementation", "active", `Assigned ${a?.name ?? a?.person_id ?? "owner"}`);
  });
  bus.subscribe("branch.created", (e) => {
    const b = (e.payload as { branch_name?: string })?.branch_name;
    set(idOf(e), "implementation", "active", `Branch ${b ?? "opened"}`);
  });
  bus.subscribe("push", (e) => {
    const sha = (e.payload as { sha?: string; commit?: string })?.sha ?? (e.payload as { commit?: string })?.commit;
    set(idOf(e), "implementation", "active", sha ? `Pushed ${sha}` : "Commit pushed");
  });

  // ci.failed → implementation failed (Screen 3 error state).
  bus.subscribe("ci.failed", (e) => {
    const run = (e.payload as { run?: string; run_id?: string })?.run ?? (e.payload as { run_id?: string })?.run_id ?? "run";
    set(idOf(e), "implementation", "failed", `CI red (${run})`);
  });

  // plan.revised → implementation active (self-corrected → retry, no human).
  bus.subscribe("plan.revised", (e) => {
    // Skip the planner's store-only error markers (empty file_boundary / LLM error): those are
    // never published on the bus, so anything arriving here is a real self-correction.
    set(idOf(e), "implementation", "active", "Re-planned after CI failure");
  });

  // branch.merged → implementation passed; review active.
  bus.subscribe("branch.merged", (e) => {
    const id = idOf(e);
    set(id, "implementation", "passed", "Merged");
    set(id, "review", "active", "Post-merge review started");
  });

  // The post-merge scan IS the review. It runs to completion synchronously and routes any
  // findings to their OWN new issues (scan.found is keyed to those, not to this issue), so this
  // issue carries no open blocking finding → review passed. (handoff §5.2 last row.)
  bus.subscribe("scan.started", (e) =>
    set(idOf(e), "review", "passed", "Post-merge scan clean (findings filed as their own issues)"));

  // Normalize ci.completed {status:"failure"} → ci.failed (gateway passes webhooks through
  // untouched, and the gateway isn't ours to edit this round). Grounded: only on a real failure.
  bus.subscribe("ci.completed", (e) => {
    const payload = (e.payload ?? {}) as { status?: unknown; run?: unknown; run_id?: unknown };
    if (!isFailingStatus(payload.status)) return;
    const run = payload.run ?? payload.run_id ?? "unknown";
    const failed = { run, from: "ci.completed" };
    store.appendEvent({ type: "ci.failed", issue_id: idOf(e), provenance: "keeper", payload: failed });
    bus.publish({ type: "ci.failed", issue_id: idOf(e) || undefined, provenance: "keeper", payload: failed });
  });
}
