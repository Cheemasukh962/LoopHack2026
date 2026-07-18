import { test } from "node:test";
import assert from "node:assert/strict";
import { makeToolDiscovery } from "./index.js";
import { FakeStore } from "../testing/fakes.js";

test("terraform signal discovers an IaC scanner that produces findings", async () => {
  const zero = makeToolDiscovery();
  const tool = await zero.discoverTool({ signal: "terraform" });
  assert.match(tool.tool_name, /iac|terraform/i);
  const out = await tool.run("infra/main.tf");
  assert.ok(out.findings.length > 0);
});

test(".tf extension signal also maps to the IaC scanner", async () => {
  const zero = makeToolDiscovery();
  const tool = await zero.discoverTool({ signal: "infra/main.tf" });
  assert.match(tool.tool_name, /iac|terraform/i);
});

test("cve signal discovers a dependency scanner", async () => {
  const zero = makeToolDiscovery();
  const tool = await zero.discoverTool({ signal: "CVE-2026-1234" });
  assert.match(tool.tool_name, /dep|cve|audit/i);
});

test("unknown signal returns a generic tool and logs gap.detected when store present", async () => {
  const store = new FakeStore();
  const zero = makeToolDiscovery({ store });
  const tool = await zero.discoverTool({ signal: "brainfuck" });
  assert.ok(tool.tool_name.length > 0);
  assert.ok(store.events.some(e => e.type === "gap.detected"));
});
