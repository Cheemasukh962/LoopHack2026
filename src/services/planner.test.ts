import { test } from "node:test";
import assert from "node:assert/strict";
import { registerPlanner } from "./planner.js";
import { FakeStore, FakeBus, FakeLlm, FakeNexla } from "../testing/fakes.js";
import type { PlanBrain } from "./planner.js";

function brain(over: Partial<PlanBrain> = {}): PlanBrain {
  return { root_cause_hypothesis: "missing retry timeout", file_boundary: ["src/http/retry.ts"], blast_radius: { call_sites: 3, services_affected: 1 }, legacy_checklist: ["update changelog"], test_strategy: "unit + integration", too_large: false, ...over };
}

function locate(store: FakeStore, bus: FakeBus, file_boundary: string[]) {
  store.upsertIssue({ issue_id: "i1", title: "500s on checkout", body: "...", state: "open", provenance: "human", parent_issue: null, children: [], branch: null, created_at: "t" });
  bus.emit("locate.done", { type: "locate.done", issue_id: "i1", payload: { issue_id: "i1", file_boundary, blame: [{ path: file_boundary[0], last_author: "marco" }] } });
}

test("planner inserts a versioned plan and emits plan.created with too_large=false", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  registerPlanner({ bus, store, llm: new FakeLlm({ json: brain() }), nexla: new FakeNexla([{ person_id: "marco", score: 0.9, why: "owns src/http" }]) });
  locate(store, bus, ["src/http/retry.ts"]);
  await new Promise(r => setImmediate(r));
  const plan = store.latestPlan("i1");
  assert.equal(plan?.version, 1);
  assert.equal(plan?.assignee.person_id, "marco");
  const created = bus.published.find(e => e.type === "plan.created");
  assert.equal((created?.payload as any).too_large, false);
  assert.ok(!bus.published.some(e => e.type === "plan.too_large"));
});

test("planner emits plan.too_large when file_boundary exceeds threshold", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  const big = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts"];
  registerPlanner({ bus, store, llm: new FakeLlm({ json: brain({ file_boundary: big }) }), opts: { sizeThreshold: 5 } });
  locate(store, bus, big);
  await new Promise(r => setImmediate(r));
  assert.equal((store.latestPlan("i1")?.version), 1);
  assert.ok(bus.published.some(e => e.type === "plan.created"));
  assert.ok(bus.published.some(e => e.type === "plan.too_large"));
});

test("planner does NOT overwrite: second locate.done makes version 2", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  registerPlanner({ bus, store, llm: new FakeLlm({ json: brain() }) });
  locate(store, bus, ["src/http/retry.ts"]);
  await new Promise(r => setImmediate(r));
  locate(store, bus, ["src/http/retry.ts"]);
  await new Promise(r => setImmediate(r));
  assert.equal(store.getPlans("i1").length, 2);
  assert.equal(store.latestPlan("i1")?.version, 2);
});

test("planner blocks emit when LLM returns empty file_boundary", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  registerPlanner({ bus, store, llm: new FakeLlm({ json: brain({ file_boundary: [] }) }) });
  locate(store, bus, ["src/http/retry.ts"]);
  await new Promise(r => setImmediate(r));
  assert.equal(store.getPlans("i1").length, 0);
  assert.ok(!bus.published.some(e => e.type === "plan.created"));
});
