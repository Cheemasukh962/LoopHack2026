import { test } from "node:test";
import assert from "node:assert/strict";
import { integrationMode, makeGuard, makeZero } from "./integrations.js";
import { FakeStore } from "./testing/fakes.js";

test("integrationMode defaults to real when unset", () => {
  delete process.env.KEEPER_INTEGRATIONS;
  assert.equal(integrationMode(), "real");
});

test("integrationMode honors fallback", () => {
  process.env.KEEPER_INTEGRATIONS = "fallback";
  assert.equal(integrationMode(), "fallback");
  delete process.env.KEEPER_INTEGRATIONS;
});

test("makeGuard/makeZero return working interface instances in fallback mode", async () => {
  process.env.KEEPER_INTEGRATIONS = "fallback";
  const store = new FakeStore();
  const guard = makeGuard(store);
  const zero = makeZero(store);
  assert.equal(typeof guard.authorizeWrite, "function");
  const tool = await zero.discoverTool({ signal: "terraform" });
  assert.match(tool.tool_name, /iac|terraform/i);
  delete process.env.KEEPER_INTEGRATIONS;
});
