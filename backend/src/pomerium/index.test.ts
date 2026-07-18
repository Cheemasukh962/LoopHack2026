import { test } from "node:test";
import assert from "node:assert/strict";
import { isWithinBoundary, makePomeriumGuard } from "./index.js";
import { FakeStore } from "../testing/fakes.js";
import type { PlanRecord } from "../contract/index.js";

function seedPlan(store: FakeStore, issue_id: string, file_boundary: string[]) {
  const p: PlanRecord = { plan_id: `p_${issue_id}`, issue_id, version: 1, revised_because: null, prior_art: [], root_cause_hypothesis: "", file_boundary, blast_radius: { call_sites: 0, services_affected: 0 }, legacy_checklist: [], test_strategy: "", assignee: { person_id: "x", context_score: 0, why: "" }, created_at: "t" };
  store.insertPlan(p);
}

test("isWithinBoundary matches exact files and directory prefixes", () => {
  assert.equal(isWithinBoundary("src/http/retry.ts", ["src/http/retry.ts"]), true);
  assert.equal(isWithinBoundary("src/http/pool.ts", ["src/http/"]), true);
  assert.equal(isWithinBoundary("src/auth/session.ts", ["src/http/"]), false);
});

test("branch write inside boundary authorizes and emits pomerium.authorized", async () => {
  const store = new FakeStore();
  seedPlan(store, "i1", ["src/http/retry.ts"]);
  const guard = makePomeriumGuard(store);
  const ok = await guard.authorizeWrite({ action: "branch", identity: "keeper", scope: ["src/http/retry.ts"], reason: "fix", issue_id: "i1" });
  assert.equal(ok, true);
  assert.ok(store.events.some(e => e.type === "pomerium.authorized"));
});

test("branch write outside boundary denies and emits boundary.violated + pomerium.denied", async () => {
  const store = new FakeStore();
  seedPlan(store, "i1", ["src/http/retry.ts"]);
  const guard = makePomeriumGuard(store);
  const ok = await guard.authorizeWrite({ action: "branch", identity: "keeper", scope: ["infra/main.tf"], reason: "x", issue_id: "i1" });
  assert.equal(ok, false);
  assert.ok(store.events.some(e => e.type === "boundary.violated"));
  assert.ok(store.events.some(e => e.type === "pomerium.denied"));
});

test("6th file_issue in the same hour is denied", async () => {
  const store = new FakeStore();
  let clock = 1_000_000;
  const guard = makePomeriumGuard(store, { now: () => clock });
  const file = () => guard.authorizeWrite({ action: "file_issue", identity: "keeper", scope: [], reason: "child" });
  for (let i = 0; i < 5; i++) assert.equal(await file(), true);
  assert.equal(await file(), false); // 6th within the hour
  assert.ok(store.events.filter(e => e.type === "pomerium.denied").length >= 1);
});

test("filing cap resets after an hour passes", async () => {
  const store = new FakeStore();
  let clock = 0;
  const guard = makePomeriumGuard(store, { now: () => clock });
  const file = () => guard.authorizeWrite({ action: "file_issue", identity: "keeper", scope: [], reason: "child" });
  for (let i = 0; i < 5; i++) await file();
  clock += 3_600_001; // 1h + 1ms later
  assert.equal(await file(), true);
});
