// Keeper API adapter — progressive backend.
//
// Talks to the REAL Keeper engine at /api/v1 (Vite proxies to the backend on :8787,
// or set VITE_KEEPER_API_URL for a deployed backend). If no backend is reachable
// (e.g. the Vercel-only static deploy) it transparently falls back to a localStorage
// mock that plays the same sponsor-driven loop so the app never breaks.

import type {
  CreateIssueInput,
  Issue,
  IssueDetail,
  IssueSummary,
  LoopEvent,
  PhaseView,
  Plan,
  Provenance,
  RepoMeta,
  RepoPerson,
  SponsorStatus,
  Stats,
} from "@shared/api";

const CURRENT_USER = {
  name: "samuelalake",
  github_handle: "samuelalake",
  avatar_url:
    "https://api.builder.io/api/v1/image/assets/TEMP/15a001fa0d049362b83ad86d84c419cbf69c3ee1?width=40",
};
const KEEPER_BOT = { name: "Keeper", github_handle: "keeper-bot" };

export interface KeeperClient {
  createIssue(input: CreateIssueInput): Promise<{ issue_id: string }>;
  getIssue(id: string): Promise<IssueDetail | null>;
  listIssues(): Promise<IssueSummary[]>;
  getEvents(issueId?: string): Promise<LoopEvent[]>;
  getPhases(id: string): Promise<PhaseView | null>;
  getStats(): Promise<Stats>;
  merge(id: string): Promise<void>;
  advanceImplementation(id: string): Promise<void>;
  failCi(id: string): Promise<void>;
  getRepoMeta(): Promise<RepoMeta>;
  getRepoPeople(): Promise<RepoPerson[]>;
  getSponsors(): Promise<SponsorStatus>;
  getAllEvents(): Promise<LoopEvent[]>;
}

/* --------------------------- helpers shared by both ------------------------- */

const BODY_KEY = "keeper.bodies.v1";
type BodyCache = Record<string, { title: string; body: string; created_at: string }>;
function readBodies(): BodyCache {
  if (typeof localStorage === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(BODY_KEY) ?? "{}"); } catch { return {}; }
}
function cacheBody(issue_id: string, title: string, body: string) {
  if (typeof localStorage === "undefined") return;
  const all = readBodies();
  all[issue_id] = { title, body, created_at: new Date().toISOString() };
  localStorage.setItem(BODY_KEY, JSON.stringify(all));
}
export function cachedBody(issue_id: string): { title: string; body: string; created_at: string } | undefined {
  return readBodies()[issue_id];
}

export function authorFor(provenance: Provenance): Issue["author"] {
  return provenance === "human" ? CURRENT_USER : { ...KEEPER_BOT };
}

/** Pull a display name out of the assignee `why` ("Marco Reyes: 0.84 on …" → "Marco Reyes"). */
export function assigneeDisplayName(plan: Plan | null): string | null {
  if (!plan?.assignee) return null;
  const why = plan.assignee.why ?? "";
  const m = why.match(/^([^:]+):/);
  return (m ? m[1] : plan.assignee.name).trim();
}

/* ------------------------------- http adapter ------------------------------ */

const API_BASE = ((import.meta.env.VITE_KEEPER_API_URL as string | undefined) ?? "").replace(/\/$/, "") + "/api/v1";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok && res.status !== 202) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

function post(type: string, payload: Record<string, unknown>): Promise<unknown> {
  return req(`/webhooks/${type}`, { method: "POST", body: JSON.stringify(payload) });
}

const httpClient: KeeperClient = {
  async createIssue({ title, body }) {
    const out = await req<{ issue_id: string }>("/issues", {
      method: "POST",
      body: JSON.stringify({ title, body }),
    });
    cacheBody(out.issue_id, title, body);
    return out;
  },
  async getIssue(id) {
    try {
      const r = await req<{ issue: IssueSummary; plan: Plan | null; versions: Plan[] }>(
        `/issues/${encodeURIComponent(id)}`,
      );
      const cached = cachedBody(id);
      const issue: Issue = {
        issue_id: r.issue.issue_id,
        title: r.issue.title,
        body: cached?.body ?? "",
        state: (r.issue.state as Issue["state"]) ?? "open",
        provenance: r.issue.provenance,
        author: authorFor(r.issue.provenance),
        created_at: cached?.created_at ?? new Date().toISOString(),
      };
      return { issue, plan: r.plan, versions: Array.isArray(r.versions) ? r.versions.length : 0 };
    } catch (e) {
      if (String(e).includes("404")) return null;
      throw e;
    }
  },
  listIssues: () => req<IssueSummary[]>("/issues"),
  async getEvents(issueId) {
    const all = await req<LoopEvent[]>("/events");
    return issueId ? all.filter((e) => e.issue_id === issueId) : all;
  },
  async getPhases(id) {
    try { return await req<PhaseView>(`/issues/${encodeURIComponent(id)}/phases`); }
    catch { return null; }
  },
  getStats: () => req<Stats>("/stats"),
  async merge(id) { await post("branch.merged", { issue_id: id }); },
  async advanceImplementation(id) {
    await post("branch.created", { issue_id: id, branch_name: `fix/${id}` });
    await post("push", { issue_id: id, sha: id.toLowerCase().slice(0, 7) });
    await post("ci.completed", { issue_id: id, status: "success" });
  },
  async failCi(id) { await post("ci.failed", { issue_id: id, run: "checkout-e2e" }); },
  getRepoMeta: () => req<RepoMeta>("/repo"),
  getRepoPeople: () => req<RepoPerson[]>("/repo/people"),
  getSponsors: () => req<SponsorStatus>("/sponsors"),
  getAllEvents: () => req<LoopEvent[]>("/events"),
};

/* ------------------------------- mock adapter ------------------------------ */
// Offline fallback: same loop, driven from localStorage so the sponsor story still plays.

const STORE_KEY = "keeper.issues.v1";
type MockRec = { issue: Issue; plan: Plan | null; events: LoopEvent[]; merged: boolean };
function readStore(): Record<string, MockRec> {
  if (typeof localStorage === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}"); } catch { return {}; }
}
function writeStore(s: Record<string, MockRec>) {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORE_KEY, JSON.stringify(s));
}
let mockSeq = 900;
const mockId = () => `ISS-${++mockSeq}`;
let evtSeq = 0;
const evt = (issue_id: string, type: string, payload: Record<string, unknown>): LoopEvent => ({
  event_id: `evt_${++evtSeq}`, ts: new Date().toISOString(), type, issue_id,
  provenance: type === "issue.created" ? "human" : "keeper", payload,
});

function synthesize(issue: Issue): { plan: Plan; events: LoopEvent[] } {
  const area = issue.title.toLowerCase().split(/\s+/).find((w) => w.length > 3) ?? "core";
  const files = [`src/http/retry.ts`, `src/http/client.ts`];
  const prior_art = [
    { issue_id: "#412", similarity: 0.25, resolution: "Added a per-attempt timeout + jittered backoff in src/http/retry.ts." },
    { issue_id: "#299", similarity: 0.18, resolution: "Added a circuit breaker around retries in src/http/retry.ts." },
  ];
  const plan: Plan = {
    plan_id: `plan_${issue.issue_id}_v1`, issue_id: issue.issue_id, version: 1, revised_because: null,
    prior_art,
    root_cause_hypothesis: `Scoped from the request: "${issue.title}". Upstream retry lacks a per-attempt timeout.`,
    file_boundary: files,
    blast_radius: { call_sites: 3, services_affected: 1 },
    legacy_checklist: ["Confirm no callers rely on unbounded retry"],
    test_strategy: "Unit-test the timeout path; load-test to reproduce.",
    assignee: { person_id: "p_marco", name: "p_marco", context_score: 0.84,
      why: "Marco Reyes: 0.84 on src/http — recency-weighted git blame (47 commits, 92% recent blame), not a résumé claim. Outranks p_sam (0.78, résumé claim, no blame here)." },
    recommended_tool: { tool_name: "dependency-audit", why: "Dependency/CVE signal — audit for vulnerable packages" },
  };
  const events: LoopEvent[] = [
    evt(issue.issue_id, "issue.created", { title: issue.title, body: issue.body }),
    evt(issue.issue_id, "phase.updated", { phase: "planning", status: "active", detail: "Triage started" }),
    evt(issue.issue_id, "recall.hit", { prior_art, hits: prior_art.length, top_hit: "#412 @ 25%" }),
    evt(issue.issue_id, "locate.done", { file_boundary: files, blame: files.map((p) => ({ path: p, last_author: "p_marco" })) }),
    evt(issue.issue_id, "plan.created", { plan_id: plan.plan_id, version: 1, too_large: false }),
    evt(issue.issue_id, "tool.discovered", { tool_name: "dependency-audit", why: plan.recommended_tool!.why }),
    evt(issue.issue_id, "phase.updated", { phase: "planning", status: "passed", detail: "Plan drafted" }),
    evt(issue.issue_id, "phase.updated", { phase: "implementation", status: "active", detail: "Implementation kicked off" }),
    evt(issue.issue_id, "pomerium.authorized", { action: "assign", identity: "keeper", decision: "allow", reason: `assign ${issue.issue_id} to p_marco` }),
    evt(issue.issue_id, "route.assigned", { assignee: plan.assignee, candidates: [{ person_id: "p_marco", score: 0.835 }, { person_id: "p_sam", score: 0.775 }] }),
  ];
  return { plan, events };
}

const mockClient: KeeperClient = {
  async createIssue({ title, body }) {
    const issue: Issue = {
      issue_id: mockId(), title: title.trim() || "Untitled task", body: body.trim(),
      state: "open", provenance: "human", author: CURRENT_USER, created_at: new Date().toISOString(),
    };
    cacheBody(issue.issue_id, issue.title, issue.body);
    const { plan, events } = synthesize(issue);
    const store = readStore();
    store[issue.issue_id] = { issue, plan, events, merged: false };
    writeStore(store);
    return { issue_id: issue.issue_id };
  },
  async getIssue(id) {
    const rec = readStore()[id];
    return rec ? { issue: rec.issue, plan: rec.plan, versions: 1 } : null;
  },
  async listIssues() {
    return Object.values(readStore()).map((r): IssueSummary => ({
      issue_id: r.issue.issue_id, title: r.issue.title, state: r.issue.state, provenance: r.issue.provenance,
      parent_issue: null,
      assignee: r.plan?.assignee ? { person_id: r.plan.assignee.person_id ?? "", name: r.plan.assignee.name, context_score: r.plan.assignee.context_score } : null,
      plan_version: r.plan?.version ?? 0, branch: null,
    }));
  },
  async getEvents(issueId) {
    const store = readStore();
    const all = Object.values(store).flatMap((r) => r.events);
    return issueId ? all.filter((e) => e.issue_id === issueId) : all;
  },
  async getPhases(id) {
    const rec = readStore()[id];
    if (!rec) return null;
    const passed = (p: string) => rec.events.some((e) => e.type === "phase.updated" && (e.payload as any).phase === p && (e.payload as any).status === "passed");
    const phases = (["planning", "implementation", "review"] as const).map((phase) => ({
      phase, status: (passed(phase) ? "passed" : rec.merged || phase === "planning" ? "passed" : "active") as any, detail: "", updated_at: "",
    }));
    const blocking = phases.find((p) => p.status !== "passed");
    return { issue_id: id, phases, merge_blocked: Boolean(blocking), blocking_reason: blocking ? `${blocking.phase} is ${blocking.status}` : null };
  },
  async getStats() {
    const vals = Object.values(readStore());
    return {
      human_filed: vals.filter((r) => r.issue.provenance === "human").length,
      keeper_filed: vals.filter((r) => r.issue.provenance !== "human").length,
      plans_revised: 0, branches_open: 0,
    };
  },
  async merge(id) {
    const store = readStore();
    const rec = store[id];
    if (!rec || rec.merged) return;
    rec.merged = true;
    rec.events.push(evt(id, "branch.merged", { issue_id: id }));
    rec.events.push(evt(id, "phase.updated", { phase: "implementation", status: "passed", detail: "Merged" }));
    rec.events.push(evt(id, "scan.started", { paths: ["src/http/retry.ts", "infra/main.tf"] }));
    rec.events.push(evt(id, "phase.updated", { phase: "review", status: "passed", detail: "Post-merge scan clean (findings filed as their own issues)" }));
    // The close: Keeper files its own next issues (incl. Zero's IaC finding on the Terraform diff).
    const findings = [
      { title: "Retry path has no explicit upstream timeout", body: "The merged retry path can await a stalled gateway indefinitely; add a per-attempt request deadline.", tool: null as string | null },
      { title: "iac-misconfig-scanner: security group allows 0.0.0.0/0 on port 22", body: "infra/main.tf opens 0.0.0.0/0 ingress — restrict the CIDR.", tool: "iac-misconfig-scanner" },
    ];
    findings.forEach((f, i) => {
      const sid = `SCAN-${id}-${i + 1}`;
      const child: Issue = { issue_id: sid, title: f.title, body: f.body, state: "open", provenance: "keeper_scanner", author: { ...KEEPER_BOT }, created_at: new Date().toISOString() };
      const syn = synthesize(child);
      rec.events.push(evt(id, "pomerium.authorized", { action: "file_issue", identity: "keeper", decision: "allow", reason: f.title, issue_id: sid }));
      if (f.tool) rec.events.push(evt(sid, "tool.discovered", { tool_name: f.tool, why: "Terraform detected — scan IaC for misconfigurations" }));
      rec.events.push(evt(sid, "scan.found", { title: f.title, body: f.body }));
      rec.events.push(evt(sid, "issue.created", { title: f.title, body: f.body, provenance: "keeper_scanner" }));
      store[sid] = { issue: child, plan: syn.plan, events: syn.events, merged: false };
      cacheBody(sid, f.title, f.body);
    });
    writeStore(store);
  },
  async advanceImplementation() { /* offline: implementation is already reflected in synthesized events */ },
  async failCi(id) {
    const store = readStore();
    const rec = store[id];
    if (!rec || !rec.plan) return;
    rec.events.push(evt(id, "ci.failed", { run: "checkout-e2e" }));
    rec.events.push(evt(id, "phase.updated", { phase: "implementation", status: "failed", detail: "CI red (checkout-e2e)" }));
    rec.plan = { ...rec.plan, version: rec.plan.version + 1, revised_because: "ci.failed: checkout-e2e" };
    rec.events.push(evt(id, "plan.revised", { version: rec.plan.version }));
    rec.events.push(evt(id, "phase.updated", { phase: "implementation", status: "active", detail: "Re-planned after CI failure" }));
    writeStore(store);
  },
  async getRepoMeta() { return { mode: "mock", target: null }; },
  async getRepoPeople() { return []; },
  async getSponsors() {
    return {
      data_source: { mode: "mock (offline)" },
      sponsors: {
        nexla: { mode: "local", data: "seeded" },
        pomerium: { mode: "local", note: "file-boundary + ≤5/hr cap" },
        zero: { mode: "local", note: "tool discovery" },
        claude: { mode: "fallback" },
      },
    };
  },
  async getAllEvents() { return Object.values(readStore()).flatMap((r) => r.events); },
};

/* --------------------------------- selector -------------------------------- */

let modeP: Promise<"real" | "mock"> | null = null;
export function backendMode(): Promise<"real" | "mock"> {
  if (!modeP) {
    modeP = (async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch(`${API_BASE}/stats`, { signal: ctrl.signal });
        clearTimeout(t);
        return res.ok ? "real" : "mock";
      } catch {
        return "mock";
      }
    })();
  }
  return modeP;
}

async function impl(): Promise<KeeperClient> {
  return (await backendMode()) === "real" ? httpClient : mockClient;
}

/** The active client — real backend when reachable, else the localStorage mock. */
export const keeper: KeeperClient = {
  createIssue: async (i) => (await impl()).createIssue(i),
  getIssue: async (id) => (await impl()).getIssue(id),
  listIssues: async () => (await impl()).listIssues(),
  getEvents: async (id) => (await impl()).getEvents(id),
  getPhases: async (id) => (await impl()).getPhases(id),
  getStats: async () => (await impl()).getStats(),
  merge: async (id) => (await impl()).merge(id),
  advanceImplementation: async (id) => (await impl()).advanceImplementation(id),
  failCi: async (id) => (await impl()).failCi(id),
  getRepoMeta: async () => (await impl()).getRepoMeta(),
  getRepoPeople: async () => (await impl()).getRepoPeople(),
  getSponsors: async () => (await impl()).getSponsors(),
  getAllEvents: async () => (await impl()).getAllEvents(),
};

/* ----------------------------- seeded demo card ---------------------------- */
export const DEMO_FEATURE_ID = "feat_csv_export";
export function seedDemoIssue(): string {
  // Real backend seeds itself; nothing to do in that mode.
  return DEMO_FEATURE_ID;
}
