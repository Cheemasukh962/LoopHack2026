import { test } from "node:test";
import assert from "node:assert/strict";
import { registerDecomposer } from "./decomposer.js";
import { FakeStore, FakeBus, FakeLlm } from "../testing/fakes.js";
import { makePomeriumGuard } from "../pomerium/index.js";
import type { PlanRecord, IssueCreatedPayload } from "../contract/index.js";

function seedParent(store: FakeStore, boundary: string[]) {
  store.upsertIssue({ issue_id: "i1", title: "big", body: "...", state: "open", provenance: "human", parent_issue: null, children: [], branch: null, created_at: "t" });
  const plan: PlanRecord = { plan_id: "plan_i1_v1", issue_id: "i1", version: 1, revised_because: null, prior_art: [], root_cause_hypothesis: "", file_boundary: boundary, blast_radius: { call_sites: 0, services_affected: 0 }, legacy_checklist: [], test_strategy: "", assignee: { person_id: "x", context_score: 0, why: "" }, created_at: "t" };
  store.insertPlan(plan);
}

const CHILDREN = { children: [
  { title: "fix retry timeout", body: "...", file_boundary: ["src/http/retry.ts"] },
  { title: "add retry test", body: "...", file_boundary: ["src/http/retry.test.ts"] },
] };

test("decomposer files children with keeper_decomposer provenance and links parent", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  seedParent(store, ["src/http/"]);
  registerDecomposer({ bus, store, llm: new FakeLlm({ json: CHILDREN }), guard: makePomeriumGuard(store) });
  bus.emit("plan.too_large", { type: "plan.too_large", issue_id: "i1", payload: { issue_id: "i1", plan_id: "plan_i1_v1", version: 1 } });
  await new Promise(r => setImmediate(r));
  const created = bus.published.filter(e => e.type === "issue.created");
  assert.equal(created.length, 2);
  assert.equal((created[0].payload as unknown as IssueCreatedPayload).provenance, "keeper_decomposer");
  assert.equal((created[0].payload as unknown as IssueCreatedPayload).parent_issue, "i1");
  assert.equal(store.getIssue("i1")?.children.length, 2);
});

test("decomposer caps children at maxChildren", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  seedParent(store, ["src/http/"]);
  const four = { children: [1, 2, 3, 4].map(n => ({ title: `c${n}`, body: "", file_boundary: [`src/http/f${n}.ts`] })) };
  registerDecomposer({ bus, store, llm: new FakeLlm({ json: four }), guard: makePomeriumGuard(store), opts: { maxChildren: 3 } });
  bus.emit("plan.too_large", { type: "plan.too_large", issue_id: "i1", payload: { issue_id: "i1" } });
  await new Promise(r => setImmediate(r));
  assert.equal(bus.published.filter(e => e.type === "issue.created").length, 3);
});

test("6th child across filings is denied by Pomerium (cap) and not created", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  seedParent(store, ["src/http/"]);
  let clock = 0;
  const guard = makePomeriumGuard(store, { now: () => clock });
  // Pre-consume 5 filings this hour.
  for (let i = 0; i < 5; i++) await guard.authorizeWrite({ action: "file_issue", identity: "keeper", scope: [], reason: "seed" });
  registerDecomposer({ bus, store, llm: new FakeLlm({ json: { children: [{ title: "c", body: "", file_boundary: ["src/http/x.ts"] }] } }), guard });
  bus.emit("plan.too_large", { type: "plan.too_large", issue_id: "i1", payload: { issue_id: "i1" } });
  await new Promise(r => setImmediate(r));
  assert.equal(bus.published.filter(e => e.type === "issue.created").length, 0);
  assert.ok(store.events.some(e => e.type === "pomerium.denied"));
});

test("decomposer stops at maxDepth", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  // chain i0 -> i1 (depth 1); set maxDepth 1 so i1 will not decompose further
  store.upsertIssue({ issue_id: "i0", title: "root", body: "", state: "open", provenance: "human", parent_issue: null, children: ["i1"], branch: null, created_at: "t" });
  seedParent(store, ["src/http/"]);
  store.upsertIssue({ ...store.getIssue("i1")!, parent_issue: "i0" });
  registerDecomposer({ bus, store, llm: new FakeLlm({ json: CHILDREN }), guard: makePomeriumGuard(store), opts: { maxDepth: 1 } });
  bus.emit("plan.too_large", { type: "plan.too_large", issue_id: "i1", payload: { issue_id: "i1" } });
  await new Promise(r => setImmediate(r));
  assert.equal(bus.published.filter(e => e.type === "issue.created").length, 0);
});
