import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventBus } from "../src/bus.js";
import { InMemoryStore } from "../src/store.js";
import type { LlmClient, PomeriumGuard, ToolDiscovery } from "../src/contract/index.js";
import { createGateway } from "../src/services/gateway.js";
import { registerScanner } from "../src/services/scanner.js";

const stagedDiff = [
  "diff --git a/src/http/retry.ts b/src/http/retry.ts",
  "+++ b/src/http/retry.ts",
  "+ return await operation();",
  "diff --git a/infra/main.tf b/infra/main.tf",
  "+++ b/infra/main.tf",
].join("\n");

const drainBus = async () => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
};

test("files a scanner issue and republishes issue.created after branch merge", async () => {
  const bus = new InMemoryEventBus();
  const store = new InMemoryStore();
  const seen: string[] = [];
  const discoveredSignals: string[] = [];
  const llm: LlmClient = {
    complete: async () => "",
    completeJson: async () => ({
      findings: [{
        title: "Add a timeout to checkout retries",
        body: "A stalled upstream request can keep the retry loop pending forever.",
        paths: ["src/http/retry.ts"],
      }],
    }),
  };
  const guard: PomeriumGuard = { authorizeWrite: async () => true };
  const tools: ToolDiscovery = {
    discoverTool: async ({ signal }) => {
      discoveredSignals.push(signal);
      return { tool_name: "iac-scanner", why: "checks Terraform", run: async () => ({ findings: [] }) };
    },
  };

  bus.subscribe("issue.created", () => seen.push("issue.created"));
  registerScanner(bus, store, { llm, guard, tools, stagedDiff });
  bus.publish({ type: "branch.merged", issue_id: "ISS-420", provenance: "keeper", payload: { diff: stagedDiff } });
  await drainBus();

  assert.equal(store.getIssues({ provenance: "keeper_scanner" }).length, 1);
  assert.deepEqual(
    store.getEvents().map((event) => event.type).filter((type) => type.startsWith("scan.")),
    ["scan.started", "scan.found"],
  );
  assert.ok(seen.includes("issue.created"));
  assert.deepEqual(discoveredSignals, ["terraform"]);
});

test("deduplicates webhook deliveries while preserving the first event", async () => {
  const bus = new InMemoryEventBus();
  const store = new InMemoryStore();
  const gateway = createGateway(bus, store);
  const seen: string[] = [];

  bus.subscribe("push", (event) => seen.push(event.issue_id ?? ""));
  gateway.ingestWebhook("push", { issue_id: "ISS-77", ref: "refs/heads/main" }, "delivery-77");
  gateway.ingestWebhook("push", { issue_id: "ISS-77", ref: "refs/heads/main" }, "delivery-77");
  await drainBus();

  assert.deepEqual(seen, ["ISS-77"]);
  assert.deepEqual(store.getEvents().map((event) => event.type), ["push"]);
});

test("creates a human issue and publishes it into the loop", async () => {
  const bus = new InMemoryEventBus();
  const store = new InMemoryStore();
  const gateway = createGateway(bus, store);
  const seen: string[] = [];

  bus.subscribe("issue.created", (event) => seen.push(event.payload.issue_id as string));
  const issue = gateway.createIssue({ title: "Checkout intermittently returns 500", body: "Customers cannot complete orders." });
  await drainBus();

  assert.equal(issue.provenance, "human");
  assert.equal(store.getIssue(issue.issue_id)?.title, "Checkout intermittently returns 500");
  assert.deepEqual(seen, [issue.issue_id]);
  assert.deepEqual(store.getEvents().map((event) => event.type), ["issue.created"]);
});
