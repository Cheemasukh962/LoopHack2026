// Teammate B — dev harness (my lane, run in isolation).
//
// A's real EventBus/Store/API and C's LLM planner are not on this branch yet, so this file
// stands up *minimal* in-memory implementations of the FROZEN EventBus/Store interfaces purely
// to drive and observe my four services end to end. It is NOT A's spine — at integration,
// delete this and register my services against A's real bus/store (same interfaces).
//
//   run:  npx tsx src/services/dev-harness.ts
//
// It proves the B-lane slice of the loop:
//   issue.created -> recall.hit (#412) -> locate.done (src/http/retry.ts)
//   plan.created  -> route.assigned (Marco's blame beats Sam's résumé)

import type {
  BusEvent, EventBus, EventType, Store,
  PersonRecord, IssueRecord, PlanRecord, LoopEventRecord, BranchRecord,
} from "../contract";
import { createNexla } from "../nexla";
import { createIngestService } from "./ingest";
import { createRecallService } from "./recall";
import { createLocateService } from "./locate";
import { createRouterService } from "./router";

// ---- Minimal EventBus that lets us await a full cascade for deterministic demo output ----
class DemoBus implements EventBus {
  private handlers = new Map<EventType, ((e: BusEvent) => void | Promise<void>)[]>();
  private pending: Promise<void>[] = [];

  subscribe(type: EventType, handler: (e: BusEvent) => void | Promise<void>): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  publish(event: BusEvent): void {
    console.log(`  ↪ bus: ${event.type}${event.issue_id ? ` (${event.issue_id})` : ""}`);
    for (const h of this.handlers.get(event.type) ?? []) {
      this.pending.push(Promise.resolve(h(event)));
    }
  }

  /** Await the full cascade (handlers that publish more events keep the loop going). */
  async settle(): Promise<void> {
    while (this.pending.length) {
      const batch = this.pending;
      this.pending = [];
      await Promise.all(batch);
    }
  }
}

// ---- Minimal Store implementing the frozen interface -------------------------------------
class DemoStore implements Store {
  private people = new Map<string, PersonRecord>();
  private issues = new Map<string, IssueRecord>();
  private plans = new Map<string, PlanRecord[]>();
  private branches = new Map<string, BranchRecord>();
  private events: LoopEventRecord[] = [];
  private seq = 0;

  getPeople() { return [...this.people.values()]; }
  getPerson(id: string) { return this.people.get(id); }
  upsertPerson(p: PersonRecord) { this.people.set(p.person_id, p); }

  getIssues(filter?: { provenance?: string; state?: string }) {
    return [...this.issues.values()].filter(
      (i) =>
        (!filter?.provenance || i.provenance === filter.provenance) &&
        (!filter?.state || i.state === filter.state),
    );
  }
  getIssue(id: string) { return this.issues.get(id); }
  upsertIssue(i: IssueRecord) { this.issues.set(i.issue_id, i); }

  getPlans(issueId: string) { return this.plans.get(issueId) ?? []; }
  latestPlan(issueId: string) { const ps = this.plans.get(issueId); return ps?.[ps.length - 1]; }
  insertPlan(p: PlanRecord) {
    const ps = this.plans.get(p.issue_id) ?? [];
    ps.push(p);
    this.plans.set(p.issue_id, ps);
  }

  getBranches() { return [...this.branches.values()]; }
  upsertBranch(b: BranchRecord) { this.branches.set(b.branch_name, b); }

  appendEvent(e: Omit<LoopEventRecord, "event_id" | "ts">): LoopEventRecord {
    const rec: LoopEventRecord = { ...e, event_id: `evt_${++this.seq}`, ts: new Date().toISOString() };
    this.events.push(rec);
    return rec;
  }
  getEvents(sinceTs?: string) {
    return sinceTs ? this.events.filter((e) => e.ts > sinceTs) : [...this.events];
  }
}

// ---- Drive the B-lane slice of the loop -------------------------------------------------
async function main() {
  const bus = new DemoBus();
  const store = new DemoStore();
  const nexla = await createNexla();

  // Register my four services against the frozen interfaces (no guard in solo mode).
  createIngestService({ bus, store, nexla }).start();
  createRecallService({ bus, store, nexla }).start();
  createLocateService({ bus, store, nexla }).start();
  createRouterService({ bus, store, nexla }).start();

  console.log("\n=== 1. repo.connected -> ingest indexes the Nexla ownership Nexset ===");
  bus.publish({ type: "repo.connected", provenance: "human", payload: { repo_url: "seed://keeper" } });
  await bus.settle();

  console.log("\n=== 2. A human files ONE issue -> recall -> locate ===");
  const issue: IssueRecord = {
    issue_id: "#900", title: "Intermittent 500s on checkout",
    body: "Under load, checkout intermittently returns 500s. Looks like upstream retries with no timeout.",
    state: "open", provenance: "human", parent_issue: null, children: [], branch: null,
    created_at: new Date().toISOString(),
  };
  store.upsertIssue(issue);
  bus.publish({
    type: "issue.created", issue_id: issue.issue_id, provenance: "human",
    payload: { issue_id: issue.issue_id, title: issue.title, body: issue.body, provenance: "human", parent_issue: null },
  });
  await bus.settle();

  console.log("\n=== 3. (C would emit plan.created; we simulate it) -> router assigns ===");
  // Simulate C's planner writing a plan whose file_boundary came from our locate.done.
  const locateEvt = store.getEvents().find((e) => e.type === "locate.done" && e.issue_id === issue.issue_id);
  const fileBoundary = (locateEvt?.payload?.file_boundary as string[]) ?? [];
  const plan: PlanRecord = {
    plan_id: "plan_900_v1", issue_id: issue.issue_id, version: 1, revised_because: null,
    prior_art: (store.getEvents().find((e) => e.type === "recall.hit")?.payload?.prior_art as PlanRecord["prior_art"]) ?? [],
    root_cause_hypothesis: "Retry path lacks a per-attempt timeout.",
    file_boundary: fileBoundary,
    blast_radius: { call_sites: 3, services_affected: 1 },
    legacy_checklist: [], test_strategy: "unit + load",
    assignee: { person_id: "", context_score: 0, why: "" },
    created_at: new Date().toISOString(),
  };
  store.insertPlan(plan);
  bus.publish({
    type: "plan.created", issue_id: issue.issue_id, provenance: "keeper",
    payload: { issue_id: issue.issue_id, plan_id: plan.plan_id, version: 1, too_large: false },
  });
  await bus.settle();

  // ---- Report ----
  console.log("\n=== loop_events (the frontend trace) ===");
  for (const e of store.getEvents()) {
    console.log(`  [${e.type}] ${e.issue_id || "-"}  ${summarize(e)}`);
  }

  console.log("\n=== Definition-of-done checks ===");
  const recall = store.getEvents().find((e) => e.type === "recall.hit");
  const topPrior = (recall?.payload?.prior_art as { issue_id: string; similarity: number }[])?.[0];
  ok(`recall.hit names a real prior issue: ${topPrior?.issue_id} @ ${((topPrior?.similarity ?? 0) * 100) | 0}%`, topPrior?.issue_id === "#412");

  const locate = store.getEvents().find((e) => e.type === "locate.done");
  const fb = locate?.payload?.file_boundary as string[];
  ok(`locate.done names the right file: ${JSON.stringify(fb)}`, fb?.includes("src/http/retry.ts"));

  const route = store.getEvents().find((e) => e.type === "route.assigned");
  const assignee = route?.payload?.assignee as { person_id: string; name: string; context_score: number; why: string };
  ok(`route.assigned picks the TRUE owner (blame > résumé): ${assignee?.name} @ ${assignee?.context_score}`, assignee?.person_id === "p_marco");
  console.log(`     why: ${assignee?.why}`);

  const who = await nexla.whoHasContext("src/http/retry.ts");
  ok(`nexla.whoHasContext("src/http/retry.ts") top = ${who[0]?.person_id}`, who[0]?.person_id === "p_marco");

  console.log("");
}

function summarize(e: LoopEventRecord): string {
  const p = e.payload ?? {};
  if (e.type === "recall.hit") return `top_hit=${p.top_hit}`;
  if (e.type === "locate.done") return `boundary=${JSON.stringify(p.file_boundary)}`;
  if (e.type === "route.assigned") {
    const a = p.assignee as { name?: string; context_score?: number } | null;
    return a ? `assignee=${a.name} (${a.context_score})` : `unresolved`;
  }
  if (e.type === "index.ready") return `people=${p.people_indexed} paths=${p.paths_indexed}`;
  return "";
}

let failures = 0;
function ok(label: string, pass: boolean) {
  console.log(`  ${pass ? "✅" : "❌"} ${label}`);
  if (!pass) failures++;
}

main().then(() => {
  if (failures) {
    console.error(`\n${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log("All B-lane checks passed.\n");
});
