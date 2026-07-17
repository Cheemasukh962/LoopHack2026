import seed from "./seed/seed.json";
import { readFileSync } from "node:fs";

import { InMemoryEventBus } from "./bus.js";
import type { LlmClient, PomeriumGuard, ToolDiscovery } from "./contract/index.js";
import { createServer } from "./server.js";
import { createGateway } from "./services/gateway.js";
import { registerScanner } from "./services/scanner.js";
import { InMemoryStore } from "./store.js";
import type { InMemoryStoreSeed } from "./store.js";

const store = new InMemoryStore(seed as unknown as InMemoryStoreSeed);
const bus = new InMemoryEventBus();
const gateway = createGateway(bus, store);
let filingsThisHour = 0;

const llm: LlmClient = {
  complete: async () => "",
  completeJson: async <T>() => ({
    findings: [{
      title: "Retry path has no explicit upstream timeout",
      body: "The merged retry path can await a stalled checkout gateway indefinitely; add an explicit request deadline.",
      paths: ["src/http/retry.ts"],
    }],
  } as T),
};
const guard: PomeriumGuard = {
  authorizeWrite: async (request) => {
    const allowed = request.action !== "file_issue" || filingsThisHour < 5;
    if (allowed && request.action === "file_issue") filingsThisHour += 1;
    store.appendEvent({
      type: allowed ? "pomerium.authorized" : "pomerium.denied",
      issue_id: request.issue_id ?? "",
      provenance: "keeper",
      payload: { ...request, filings_this_hour: filingsThisHour },
    });
    return allowed;
  },
};
const tools: ToolDiscovery = {
  discoverTool: async () => ({
    tool_name: "terraform-risk-scanner",
    why: "Terraform appears in the merged diff, so Keeper discovers an IaC scanner through Zero.xyz.",
    run: async () => ({ findings: ["Terraform security group permits unrestricted egress; review the new network rule before it broadens production access."] }),
  }),
};

const diff = readFileSync(new URL("./seed/staged-pr.diff", import.meta.url), "utf8");
registerScanner(bus, store, { llm, guard, tools, stagedDiff: diff });

const app = createServer(store, gateway);
const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`Keeper API listening on http://localhost:${port}/api/v1`));
