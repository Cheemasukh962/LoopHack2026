import { test } from "node:test";
import assert from "node:assert/strict";
import { registerPhaseTracker, foldPhases } from "./phase-tracker.js";
import { FakeStore, FakeBus } from "../testing/fakes.js";
import type { BusEvent } from "../contract/index.js";

const flush = () => new Promise((r) => setImmediate(r));
const ev = (type: string, issue_id: string, payload: Record<string, unknown> = {}): BusEvent =>
  ({ type: type as BusEvent["type"], issue_id, payload });

test("fold defaults every phase to pending and blocks the merge gate", () => {
  const view = foldPhases([], "i1");
  assert.deepEqual(view.phases.map((p) => p.phase), ["planning", "implementation", "review"]);
  assert.ok(view.phases.every((p) => p.status === "pending"));
  assert.equal(view.merge_blocked, true);
  assert.equal(view.blocking_reason, "planning is pending");
});

test("happy path advances planning→implementation→review and opens the gate", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  registerPhaseTracker({ bus, store });

  bus.emit("issue.created", ev("issue.created", "i1"));
  bus.emit("plan.created", ev("plan.created", "i1", { plan_id: "p1", version: 1 }));
  bus.emit("branch.merged", ev("branch.merged", "i1", { branch_name: "fix/x" }));
  bus.emit("scan.started", ev("scan.started", "i1"));
  await flush();

  const view = foldPhases(store.getEvents(), "i1");
  assert.deepEqual(view.phases.map((p) => [p.phase, p.status]), [
    ["planning", "passed"], ["implementation", "passed"], ["review", "passed"],
  ]);
  assert.equal(view.merge_blocked, false);
  assert.equal(view.blocking_reason, null);
});

test("ci.failed drives implementation → failed and re-blocks the gate", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  registerPhaseTracker({ bus, store });
  bus.emit("issue.created", ev("issue.created", "i1"));
  bus.emit("plan.created", ev("plan.created", "i1", { version: 1 }));
  bus.emit("ci.failed", ev("ci.failed", "i1", { run: "run_8871" }));
  await flush();

  const view = foldPhases(store.getEvents(), "i1");
  const impl = view.phases.find((p) => p.phase === "implementation");
  assert.equal(impl?.status, "failed");
  assert.equal(view.merge_blocked, true);
  assert.equal(view.blocking_reason, "implementation is failed");
});

test("ci.completed {status:failure} is normalized to a real ci.failed event", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  registerPhaseTracker({ bus, store });
  bus.emit("issue.created", ev("issue.created", "i1"));
  bus.emit("plan.created", ev("plan.created", "i1", { version: 1 }));
  bus.emit("ci.completed", ev("ci.completed", "i1", { status: "failure", run: "run_9" }));
  await flush();

  // A ci.failed was published on the bus...
  assert.ok(bus.published.some((e) => e.type === "ci.failed"), "expected a normalized ci.failed");
  // ...and the phase machine reacted to it.
  const impl = foldPhases(store.getEvents(), "i1").phases.find((p) => p.phase === "implementation");
  assert.equal(impl?.status, "failed");
});

test("ci.completed {status:success} does NOT synthesize a ci.failed", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  registerPhaseTracker({ bus, store });
  bus.emit("ci.completed", ev("ci.completed", "i1", { status: "success" }));
  await flush();
  assert.ok(!bus.published.some((e) => e.type === "ci.failed"));
});

test("fold takes the LATEST status per phase (failed → active after re-plan)", () => {
  const store = new FakeStore();
  store.appendEvent({ type: "phase.updated", issue_id: "i1", provenance: "keeper", payload: { issue_id: "i1", phase: "implementation", status: "failed", detail: "CI red" } });
  store.appendEvent({ type: "phase.updated", issue_id: "i1", provenance: "keeper", payload: { issue_id: "i1", phase: "implementation", status: "active", detail: "re-planned" } });
  const impl = foldPhases(store.getEvents(), "i1").phases.find((p) => p.phase === "implementation");
  assert.equal(impl?.status, "active");
  assert.equal(impl?.detail, "re-planned");
});
