import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeStore, FakeBus, FakeLlm, FakeNexla } from "./fakes.js";

test("FakeStore versions plans and never overwrites", () => {
  const s = new FakeStore();
  s.insertPlan({ plan_id: "p1", issue_id: "i1", version: 1, revised_because: null, prior_art: [], root_cause_hypothesis: "", file_boundary: ["a"], blast_radius: { call_sites: 0, services_affected: 0 }, legacy_checklist: [], test_strategy: "", assignee: { person_id: "x", context_score: 0, why: "" }, created_at: "t" });
  s.insertPlan({ plan_id: "p2", issue_id: "i1", version: 2, revised_because: null, prior_art: [], root_cause_hypothesis: "", file_boundary: ["b"], blast_radius: { call_sites: 0, services_affected: 0 }, legacy_checklist: [], test_strategy: "", assignee: { person_id: "x", context_score: 0, why: "" }, created_at: "t" });
  assert.equal(s.getPlans("i1").length, 2);
  assert.equal(s.latestPlan("i1")?.version, 2);
});

test("FakeStore.appendEvent stamps id + ts and getEvents filters by since", () => {
  const s = new FakeStore();
  const e1 = s.appendEvent({ type: "plan.created", issue_id: "i1", provenance: "keeper", payload: {} });
  assert.ok(e1.event_id && e1.ts);
  assert.equal(s.getEvents().length, 1);
  assert.equal(s.getEvents("zzzz").length, 0);
});

test("FakeBus.emit invokes matching subscribers", () => {
  const bus = new FakeBus();
  const seen: string[] = [];
  bus.subscribe("locate.done", (e) => { seen.push(String(e.issue_id)); });
  bus.emit("locate.done", { type: "locate.done", issue_id: "i9", payload: {} });
  bus.emit("plan.created", { type: "plan.created", issue_id: "iX", payload: {} });
  assert.deepEqual(seen, ["i9"]);
});

test("FakeLlm returns canned json/text and FakeNexla returns owners", async () => {
  const llm = new FakeLlm({ json: { ok: true }, text: "hi" });
  assert.deepEqual(await llm.completeJson("p"), { ok: true });
  assert.equal(await llm.complete("p"), "hi");
  const nx = new FakeNexla([{ person_id: "marco", score: 0.9, why: "owns http" }]);
  assert.equal((await nx.whoHasContext("src/http/retry.ts"))[0].person_id, "marco");
});
