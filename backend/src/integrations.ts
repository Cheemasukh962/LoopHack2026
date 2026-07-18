import type { PomeriumGuard, ToolDiscovery, Store, LlmClient } from "./contract/index.js";
import { makePomeriumGuard } from "./pomerium/index.js";
import { makeToolDiscovery } from "./zero/index.js";
import { makeLlmClient } from "./llm/index.js";

export type IntegrationMode = "real" | "fallback";

export function integrationMode(): IntegrationMode {
  return process.env.KEEPER_INTEGRATIONS === "fallback" ? "fallback" : "real";
}

export function makeLlm(): LlmClient {
  return makeLlmClient(); // env-configured; ANTHROPIC_BASE_URL may point at a Zero.xyz proxy
}

export function makeGuard(store: Store): PomeriumGuard {
  if (integrationMode() === "real") {
    return makePomeriumGuard(store, {
      verifyAssertion: async (jwt: string) => {
        // @pomerium/js-sdk PomeriumVerifier verifies the X-Pomerium-Jwt-Assertion header.
        const mod: any = await import("@pomerium/js-sdk");
        const Verifier = mod.PomeriumVerifier ?? mod.default?.PomeriumVerifier;
        const verifier = new Verifier({
          issuer: process.env.POMERIUM_ISSUER,
          audience: process.env.POMERIUM_AUDIENCE,
        });
        try { await verifier.verifyJwt(jwt); return true; } catch { return false; }
      },
    });
  }
  return makePomeriumGuard(store);
}

export function makeZero(store: Store): ToolDiscovery {
  if (integrationMode() === "real") {
    return makeToolDiscovery({ store, zeroApiUrl: process.env.ZERO_API_URL });
  }
  return makeToolDiscovery({ store });
}
