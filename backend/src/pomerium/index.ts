import type { PomeriumGuard, Store } from "../contract/index.js";

export function isWithinBoundary(path: string, boundary: string[]): boolean {
  return boundary.some(b => path === b || path.startsWith(b.endsWith("/") ? b : b + "/"));
}

export interface GuardOptions {
  filingCapPerHour?: number;
  now?: () => number;
  /** Real adapter hook: verify a Pomerium JWT assertion. Fallback leaves this undefined. */
  verifyAssertion?: (jwt: string) => Promise<boolean>;
}

const HOUR_MS = 3_600_000;

export function makePomeriumGuard(store: Store, opts: GuardOptions = {}): PomeriumGuard {
  const cap = opts.filingCapPerHour ?? Number(process.env.FILING_CAP_PER_HOUR ?? 5);
  const now = opts.now ?? (() => Date.now());
  const filings: number[] = []; // timestamps of authorized file_issue actions

  async function authorizeWrite(req: {
    action: "file_issue" | "comment" | "branch" | "assign";
    identity: string; scope: string[]; reason: string; issue_id?: string;
  }): Promise<boolean> {
    const base = { issue_id: req.issue_id ?? "", provenance: "keeper" as const };
    const deny = (type: string, why: string) => {
      store.appendEvent({ type, ...base, payload: { ...req, decision: "deny", why } });
      if (type !== "pomerium.denied") {
        store.appendEvent({ type: "pomerium.denied", ...base, payload: { ...req, why } });
      }
      return false;
    };

    // File-boundary enforcement applies only to `branch` — the actual code write Keeper is
    // constrained to. `assign` (choosing a person) and `comment` (posting the plan) are authz
    // decisions we audit but do not path-gate: their scope is the issue/module, not a code write.
    if (req.action === "branch") {
      const boundary = store.latestPlan(req.issue_id ?? "")?.file_boundary ?? [];
      const outside = req.scope.filter(p => !isWithinBoundary(p, boundary));
      if (outside.length > 0) return deny("boundary.violated", `outside file_boundary: ${outside.join(", ")}`);
    }

    // Rolling-hour filing cap applies to file_issue.
    if (req.action === "file_issue") {
      const cutoff = now() - HOUR_MS;
      while (filings.length && filings[0] <= cutoff) filings.shift();
      if (filings.length >= cap) return deny("pomerium.denied", `filing cap ${cap}/hour exceeded`);
      filings.push(now());
    }

    store.appendEvent({ type: "pomerium.authorized", ...base, payload: { ...req, decision: "allow" } });
    return true;
  }

  return { authorizeWrite };
}
