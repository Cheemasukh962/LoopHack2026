import { test } from "node:test";
import assert from "node:assert/strict";
import { registerPlanner } from "./planner.js";
import { FakeStore, FakeBus, FakeLlm } from "../testing/fakes.js";
import { makeToolDiscovery } from "../zero/index.js";
import type { PlanBrain } from "./planner.js";

const flush = () => new Promise((r) => setImmediate(r));

function brain(over: Partial<PlanBrain> = {}): PlanBrain {
  return {
    root_cause_hypothesis: "missing retry timeout",
    file_boundary: ["src/http/retry.ts"],
    blast_radius: { call_sites: 3, services_affected: 1 },
    legacy_checklist: [],
    test_strategy: "unit",
    too_large: false,
    ...over,
  };
}

function locate(store: FakeStore, bus: FakeBus, file_boundary: string[]) {
  store.upsertIssue({ issue_id: "i1", title: "t", body: "b", state: "open", provenance: "human", parent_issue: null, children: [], branch: null, created_at: "t" });
  bus.emit("locate.done", { type: "locate.done", issue_id: "i1", payload: { issue_id: "i1", file_boundary, blame: [{ path: file_boundary[0], last_author: "marco" }] } });
}

test("planner discovers a specialized tool on a terraform boundary and attaches it to the plan", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  registerPlanner({ bus, store, llm: new FakeLlm({ json: brain({ file_boundary: ["infra/main.tf"] }) }), zero: makeToolDiscovery({}) });
  locate(store, bus, ["infra/main.tf"]);
  await flush();

  const plan = store.latestPlan("i1");
  assert.equal(plan?.recommended_tool?.tool_name, "iac-misconfig-scanner");

  const discovered = bus.published.find((e) => e.type === "tool.discovered");
  assert.ok(discovered, "expected a tool.discovered event");
  assert.equal((discovered!.payload as any).tool_name, "iac-misconfig-scanner");
  assert.equal((discovered!.payload as any).plan_version, 1);
});

test("planner stays SILENT (no tool.discovered) on a generic signal", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  registerPlanner({ bus, store, llm: new FakeLlm({ json: brain({ file_boundary: ["src/http/retry.ts"] }) }), zero: makeToolDiscovery({}) });
  locate(store, bus, ["src/http/retry.ts"]);
  await flush();

  assert.equal(store.latestPlan("i1")?.recommended_tool, undefined);
  assert.ok(!bus.published.some((e) => e.type === "tool.discovered"));
});

test("ci.failed re-plans: new version, revised_because ci_failure:<run>, plan.revised + re-discovered tool", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  registerPlanner({ bus, store, llm: new FakeLlm({ json: brain({ file_boundary: ["infra/main.tf"] }) }), zero: makeToolDiscovery({}) });
  locate(store, bus, ["infra/main.tf"]);
  await flush();
  assert.equal(store.latestPlan("i1")?.version, 1);

  bus.emit("ci.failed", { type: "ci.failed", issue_id: "i1", payload: { issue_id: "i1", run: "run_8871" } });
  await flush();

  const plan = store.latestPlan("i1");
  assert.equal(plan?.version, 2);
  assert.equal(plan?.revised_because, "ci_failure:run_8871");
  assert.ok(bus.published.some((e) => e.type === "plan.revised"));
  const rediscovered = bus.published.filter((e) => e.type === "tool.discovered");
  assert.equal(rediscovered.length, 2, "tool re-discovered on the re-plan path");
  assert.equal((rediscovered.at(-1)!.payload as any).plan_version, 2);
});

test("ci.failed with no prior plan is a no-op (nothing to revise)", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  registerPlanner({ bus, store, llm: new FakeLlm({ json: brain() }), zero: makeToolDiscovery({}) });
  bus.emit("ci.failed", { type: "ci.failed", issue_id: "i1", payload: { issue_id: "i1", run: "r1" } });
  await flush();
  assert.equal(store.getPlans("i1").length, 0);
  assert.ok(!bus.published.some((e) => e.type === "plan.revised"));
});
