import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventBus } from "../src/bus.js";
import { InMemoryStore } from "../src/store.js";
import type { BranchRecord, IssueRecord, PersonRecord, PlanRecord } from "../src/contract/index.js";

const person: PersonRecord = {
  person_id: "person_dana",
  name: "Dana Ibrahim",
  github_handle: "dana-ibrahim",
  email: "dana@keeper.dev",
  resume_parsed: { skills: ["TypeScript"], stacks: ["Node.js"] },
  repo_commits: 42,
  context_scores: { "src/http/": 0.96 },
  cold_start: false,
};

const issue: IssueRecord = {
  issue_id: "ISS-1",
  title: "Retry requests time out",
  body: "A retry can wait forever when an upstream connection stalls.",
  state: "open",
  provenance: "human",
  parent_issue: null,
  children: [],
  branch: null,
  created_at: "2026-07-17T12:00:00.000Z",
};

const plan: PlanRecord = {
  plan_id: "plan_ISS-1_v1",
  issue_id: "ISS-1",
  version: 1,
  revised_because: null,
  prior_art: [],
  root_cause_hypothesis: "The retry wrapper has no deadline.",
  file_boundary: ["src/http/retry.ts"],
  blast_radius: { call_sites: 2, services_affected: 1 },
  legacy_checklist: [],
  test_strategy: "Exercise an aborted upstream request.",
  assignee: { person_id: "person_dana", context_score: 0.96, why: "Owns HTTP retries" },
  created_at: "2026-07-17T12:01:00.000Z",
};

const branch: BranchRecord = {
  branch_name: "keeper/ISS-1-retry-deadline",
  issue_id: "ISS-1",
  plan_version: 1,
  file_boundary: ["src/http/retry.ts"],
  state: "open",
  base_sha: "a1b2c3d",
  opened_at: "2026-07-17T12:02:00.000Z",
};

test("dispatches subscribed events and preserves append-only trace order", async () => {
  const bus = new InMemoryEventBus();
  const store = new InMemoryStore();
  const seen: string[] = [];

  bus.subscribe("issue.created", async (event) => {
    seen.push(event.payload.issue_id as string);
  });
  bus.publish({ type: "issue.created", payload: { issue_id: "ISS-1" } });

  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.deepEqual(seen, ["ISS-1"]);
  assert.equal(
    store.appendEvent({ type: "issue.created", issue_id: "ISS-1", provenance: "human", payload: {} }).event_id,
    "evt_1",
  );
  assert.equal(
    store.appendEvent({ type: "plan.created", issue_id: "ISS-1", provenance: "keeper", payload: {} }).event_id,
    "evt_2",
  );
  assert.deepEqual(store.getEvents().map((event) => event.type), ["issue.created", "plan.created"]);
});

test("continues dispatching when an earlier subscriber throws", async () => {
  const bus = new InMemoryEventBus();
  const seen: string[] = [];

  bus.subscribe("issue.created", () => {
    throw new Error("first subscriber failed");
  });
  bus.subscribe("issue.created", () => {
    seen.push("second subscriber ran");
  });

  bus.publish({ type: "issue.created", payload: { issue_id: "ISS-2" } });
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.deepEqual(seen, ["second subscriber ran"]);
});

test("seeds and retrieves people, issues, versioned plans, and branches", () => {
  const store = new InMemoryStore({ people: [person], issues: [issue], plans: [plan], branches: [branch] });

  assert.equal(store.getPerson(person.person_id)?.name, "Dana Ibrahim");
  assert.deepEqual(store.getIssues({ provenance: "human", state: "open" }).map((record) => record.issue_id), ["ISS-1"]);
  assert.equal(store.latestPlan(issue.issue_id)?.plan_id, plan.plan_id);
  assert.deepEqual(store.getBranches().map((record) => record.branch_name), [branch.branch_name]);

  store.insertPlan({ ...plan, plan_id: "plan_ISS-1_v2", version: 2, revised_because: "ci_failure:run_7" });
  assert.deepEqual(store.getPlans(issue.issue_id).map((record) => record.version), [1, 2]);
  assert.equal(store.latestPlan(issue.issue_id)?.version, 2);
});
