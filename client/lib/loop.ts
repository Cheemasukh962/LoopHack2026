// Maps the real Keeper event stream into UI-friendly timeline items, with
// sponsor attribution (Nexla / Pomerium / Zero.xyz), plus a tiny polling hook.

import { useEffect, useRef, useState } from "react";
import type { LoopEvent } from "@shared/api";

export type Sponsor = "nexla" | "pomerium" | "zero" | null;

export interface TimelineItem {
  event_id: string;
  ts: string;
  type: string;
  issue_id: string;
  sponsor: Sponsor;
  title: string;
  detail?: string;
}

const SPONSOR_OF: Record<string, Sponsor> = {
  "recall.hit": "nexla",
  "locate.done": "nexla",
  "route.assigned": "nexla",
  "pomerium.authorized": "pomerium",
  "pomerium.denied": "pomerium",
  "boundary.violated": "pomerium",
  "tool.discovered": "zero",
};

export function sponsorOf(type: string, payload?: any): Sponsor {
  if (type === "scan.found") {
    const title = String(payload?.title ?? "");
    return /scanner|iac|audit|misconfig/i.test(title) ? "zero" : null;
  }
  return SPONSOR_OF[type] ?? null;
}

export const SPONSOR_META: Record<Exclude<Sponsor, null>, { label: string; color: string; blurb: string }> = {
  nexla: { label: "Nexla", color: "#7C3AED", blurb: "context & recall" },
  pomerium: { label: "Pomerium", color: "#2563EB", blurb: "write guardrail" },
  zero: { label: "Zero.xyz", color: "#0E9F6E", blurb: "tool discovery" },
};

/** One event → a human-readable timeline row (or null if it's not worth showing). */
export function describe(e: LoopEvent): TimelineItem | null {
  const p = (e.payload ?? {}) as any;
  const mk = (title: string, detail?: string): TimelineItem => ({
    event_id: e.event_id, ts: e.ts, type: e.type, issue_id: e.issue_id,
    sponsor: sponsorOf(e.type, p), title, detail,
  });
  switch (e.type) {
    case "issue.created": return mk(p.provenance === "human" ? "Issue filed by a human" : "Keeper filed a new issue", p.title);
    case "recall.hit": return mk("Recalled prior art", p.hits ? `${p.hits} hits${p.top_hit ? ` · top ${p.top_hit}` : ""}` : "no prior art");
    case "locate.done": return mk("Located the file boundary", Array.isArray(p.file_boundary) && p.file_boundary.length ? p.file_boundary.join(", ") : undefined);
    case "plan.created": return mk("Drafted the plan", p.too_large ? "too large → decomposing" : `v${p.version ?? 1}`);
    case "plan.revised": return mk("Re-planned itself — no human", `v${p.version ?? "?"}`);
    case "tool.discovered": return mk("Discovered a tool on the fly", String(p.tool_name ?? ""));
    case "pomerium.authorized": return mk("Authorized a write", String(p.action ?? ""));
    case "pomerium.denied": return mk("Denied a write", String(p.why ?? p.reason ?? "policy"));
    case "boundary.violated": return mk("Blocked an out-of-boundary write", String(p.why ?? ""));
    case "route.assigned": {
      const a = p.assignee ?? {};
      const name = (String(a.why ?? "").match(/^([^:]+):/)?.[1] ?? a.name ?? "owner").trim();
      return mk(`Assigned ${name}`, "blame beats the résumé");
    }
    case "branch.created": return mk("Opened a working branch", String(p.branch_name ?? ""));
    case "push": return mk("Wrote & pushed the change", String(p.sha ?? ""));
    case "ci.completed": return mk("Test suite passed");
    case "ci.failed": return mk("CI went red", String(p.run ?? ""));
    case "branch.merged": return mk("Merged");
    case "scan.started": return mk("Scanning the merged diff", Array.isArray(p.paths) ? p.paths.join(", ") : undefined);
    case "scan.found": return mk("Scan finding → filed as its own issue", String(p.title ?? ""));
    default: return null; // phase.updated etc. are rendered elsewhere
  }
}

/** Poll a fetcher on an interval; returns the latest resolved value (keeps last on error). */
export function usePoll<T>(fetcher: () => Promise<T>, ms: number, deps: unknown[] = []): T | null {
  const [val, setVal] = useState<T | null>(null);
  const saved = useRef(fetcher);
  saved.current = fetcher;
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try { const v = await saved.current(); if (alive) setVal(v); } catch { /* keep last */ }
    };
    tick();
    const h = setInterval(tick, ms);
    return () => { alive = false; clearInterval(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return val;
}
