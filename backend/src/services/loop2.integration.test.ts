import { test } from "node:test";
import assert from "node:assert/strict";
import { registerPlanner, type PlanBrain } from "./planner.js";
import { registerDecomposer } from "./decomposer.js";
import { makePomeriumGuard } from "../pomerium/index.js";
import { FakeStore, FakeBus, FakeLlm, FakeNexla } from "../testing/fakes.js";

test("locate.done -> too_large plan -> decomposed children re-enter as issue.created", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  const big: PlanBrain = { root_cause_hypothesis: "broad", file_boundary: ["src/http/retry.ts", "src/http/pool.ts", "src/http/backoff.ts", "src/http/client.ts", "src/http/dns.ts", "src/http/tls.ts"], blast_radius: { call_sites: 4, services_affected: 2 }, legacy_checklist: [], test_strategy: "unit", too_large: true };
  // Planner's LLM returns a too-large brain; decomposer's LLM returns children.
  const plannerLlm = new FakeLlm({ json: big });
  const decompLlm = new FakeLlm({ json: { children: [
    { title: "retry timeout", body: "", file_boundary: ["src/http/retry.ts"] },
    { title: "pool sizing", body: "", file_boundary: ["src/http/pool.ts"] },
  ] } });

  registerPlanner({ bus, store, llm: plannerLlm, nexla: new FakeNexla([{ person_id: "marco", score: 0.9, why: "http" }]) });
  registerDecomposer({ bus, store, llm: decompLlm, guard: makePomeriumGuard(store) });

  store.upsertIssue({ issue_id: "i1", title: "500s", body: "...", state: "open", provenance: "human", parent_issue: null, children: [], branch: null, created_at: "t" });
  bus.publish({ type: "locate.done", issue_id: "i1", payload: { issue_id: "i1", file_boundary: big.file_boundary, blame: [{ path: "src/http/retry.ts", last_author: "marco" }] } });

  await new Promise(r => setTimeout(r, 10)); // let async chain settle

  assert.equal(store.latestPlan("i1")?.version, 1);
  assert.ok(bus.published.some(e => e.type === "plan.too_large"));
  const children = bus.published.filter(e => e.type === "issue.created");
  assert.equal(children.length, 2);
  assert.ok(children.every(e => (e.payload as any).provenance === "keeper_decomposer"));
  // keeper-filed proof: every event after the human locate is keeper provenance
  assert.ok(store.events.filter(e => e.type === "issue.created").every(e => e.provenance === "keeper"));
});
