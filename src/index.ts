import seed from "./seed/seed.json";
import { readFileSync } from "node:fs";

import { InMemoryEventBus } from "./bus.js";
import { InMemoryStore } from "./store.js";
import type { InMemoryStoreSeed } from "./store.js";
import { createServer } from "./server.js";
import type { LlmClient } from "./contract/index.js";

// --- A (spine + close) ---
import { createGateway } from "./services/gateway.js";
import { registerScanner } from "./services/scanner.js";

// --- B (context & recall) ---
import { createNexla } from "./nexla/index.js";
import { createIngestService } from "./services/ingest.js";
import { createRecallService } from "./services/recall.js";
import { createLocateService } from "./services/locate.js";
import { createRouterService } from "./services/router.js";

// --- C (brain & guardrails) ---
import { registerPlanner } from "./services/planner.js";
import { registerDecomposer } from "./services/decomposer.js";
import { makeLlm, makeGuard, makeZero } from "./integrations.js";

// --- A round 2 (phase machine + self-correction) ---
import { registerPhaseTracker } from "./services/phase-tracker.js";

const hasLlmKey = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_BASE_URL);

/**
 * Prompt-aware canned LLM so the FULL loop runs end-to-end with no API key
 * (offline dev + CI). When ANTHROPIC_API_KEY (or a Zero.xyz proxy) is set we use real Claude.
 */
function fallbackLlm(): LlmClient {
  const arrAfter = (prompt: string, label: string): string[] => {
    const m = prompt.match(new RegExp(`${label}\\s*(\\[[^\\]]*\\])`));
    if (!m) return [];
    try { return JSON.parse(m[1]); } catch { return []; }
  };
  const answer = (prompt: string): unknown => {
    if (/post-merge risk scanner/i.test(prompt)) {
      return { findings: [{
        title: "Retry path has no explicit upstream timeout",
        body: "The merged retry path can await a stalled checkout gateway indefinitely; add a per-attempt request deadline.",
        paths: ["src/http/retry.ts"],
      }] };
    }
    if (/Split this into/i.test(prompt)) {
      const parent = arrAfter(prompt, "Parent file_boundary:");
      const files = parent.length ? parent : ["src/http/retry.ts"];
      return { children: files.slice(0, 3).map((f, i) => ({
        title: `Sub-task ${i + 1}: scope ${f}`,
        body: `Address the portion of the parent plan scoped to ${f}.`,
        file_boundary: [f],
      })) };
    }
    // planner (remediation plan)
    const boundary = arrAfter(prompt, "Issue file boundary from locate:");
    const fb = boundary.length ? boundary : ["src/http/retry.ts"];
    return {
      root_cause_hypothesis: "Upstream retry lacks a per-attempt timeout, so a stalled dependency exhausts the request budget.",
      file_boundary: fb,
      blast_radius: { call_sites: 3, services_affected: 1 },
      legacy_checklist: ["Confirm no callers rely on unbounded retry"],
      test_strategy: "Unit-test the timeout path; load-test to reproduce the intermittent 500s.",
      too_large: fb.length > 5,
    };
  };
  return {
    complete: async () => "",
    completeJson: async <T>(prompt: string) => answer(prompt) as T,
  };
}

async function main() {
  const store = new InMemoryStore(seed as unknown as InMemoryStoreSeed);
  const bus = new InMemoryEventBus();

  // Sponsor integrations (env-configured; safe to construct offline).
  const guard = makeGuard(store);          // Pomerium: file boundary + <=5/hr filing cap + audit
  const tools = makeZero(store);           // Zero.xyz: mid-loop tool discovery
  const llm = hasLlmKey() ? makeLlm() : fallbackLlm();

  const nexla = await createNexla();       // Nexla ownership + history

  // A — spine
  const gateway = createGateway(bus, store);

  // B — context & recall
  createIngestService({ bus, store, nexla }).start();
  createRecallService({ bus, store, nexla }).start();
  createLocateService({ bus, store, nexla }).start();
  createRouterService({ bus, store, nexla, guard }).start();

  // A round 2 — phase state machine (register before planner so the ci.failed → failed
  // transition is recorded before the planner's re-plan flips it back to active).
  registerPhaseTracker({ bus, store });

  // C — brain & guardrails (planner now discovers a Zero tool per fix — reuse the scanner's instance).
  registerPlanner({ bus, store, llm, nexla, zero: tools });
  registerDecomposer({ bus, store, llm, guard });

  // A — the close (Loop 5)
  const diff = readFileSync(new URL("./seed/staged-pr.diff", import.meta.url), "utf8");
  registerScanner(bus, store, { llm, guard, tools, stagedDiff: diff });

  const app = createServer(store, gateway);
  const port = Number(process.env.PORT ?? 8787);
  app.listen(port, () =>
    console.log(
      `Keeper API on http://localhost:${port}/api/v1  [llm=${hasLlmKey() ? "claude" : "fallback"}]\n` +
      `Full loop wired: issue.created -> recall -> locate -> plan -> (decompose) -> route ; branch.merged -> scan -> file`,
    ),
  );
}

main().catch((err) => {
  console.error("Keeper failed to boot:", err);
  process.exit(1);
});
