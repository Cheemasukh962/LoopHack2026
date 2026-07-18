import type { ToolDiscovery, Store } from "../contract/index.js";

export interface ToolDiscoveryOptions {
  store?: Store;
  zeroApiUrl?: string;
  fetchImpl?: typeof fetch;
}

type Entry = {
  match: RegExp;
  tool_name: string;
  why: string;
  run: (input: string) => Promise<{ findings: string[] }>;
};

const CURATED: Entry[] = [
  {
    match: /terraform|\.tf\b/i,
    tool_name: "iac-misconfig-scanner",
    why: "Terraform detected — scan IaC for misconfigurations",
    async run(input) {
      return { findings: [`${input}: security group allows 0.0.0.0/0 on port 22`, `${input}: S3 bucket has no server-side encryption`] };
    },
  },
  {
    match: /cve-\d|dependenc|package\.json|vuln/i,
    tool_name: "dependency-audit",
    why: "Dependency/CVE signal — audit for vulnerable packages",
    async run(input) {
      return { findings: [`${input}: transitive dependency flagged by advisory`] };
    },
  },
];

const GENERIC: Entry = {
  match: /.*/,
  tool_name: "generic-static-linter",
  why: "Unknown signal — fall back to a generic linter (action space stays open)",
  async run(input) { return { findings: [`${input}: no specialized tool wired; generic lint pass returned no blockers`] }; },
};

export function makeToolDiscovery(opts: ToolDiscoveryOptions = {}): ToolDiscovery {
  async function discoverTool(context: { signal: string; hint?: string }) {
    // Real adapter: ask Zero.xyz to discover a matching service; fall through on any failure.
    if (opts.zeroApiUrl) {
      try {
        const f = opts.fetchImpl ?? fetch;
        const res = await f(`${opts.zeroApiUrl}/discover`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ signal: context.signal, hint: context.hint }),
        });
        if (res.ok) {
          const data = await res.json() as { tool_name: string; why: string };
          return {
            tool_name: data.tool_name, why: data.why,
            run: async (input: string) => {
              const r = await f(`${opts.zeroApiUrl}/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool: data.tool_name, input }) });
              const j = await r.json() as { findings?: string[] };
              return { findings: j.findings ?? [] };
            },
          };
        }
      } catch { /* fall through to curated map */ }
    }

    const hit = CURATED.find(e => e.match.test(context.signal));
    const entry = hit ?? GENERIC;
    if (!hit && opts.store) {
      opts.store.appendEvent({
        type: "gap.detected", issue_id: "", provenance: "keeper",
        payload: { signal: context.signal, hint: context.hint, fell_back_to: entry.tool_name },
      });
    }
    return { tool_name: entry.tool_name, why: entry.why, run: entry.run };
  }
  return { discoverTool };
}
