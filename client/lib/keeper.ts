// Keeper API adapter.
//
// Progressive backend: works fully offline for the demo (mock, localStorage-backed)
// and flips to the real Keeper backend by setting VITE_KEEPER_API_URL in .env.
// Both implementations satisfy the same KeeperClient interface and speak the
// frozen contract shapes from @shared/api, so nothing else in the app changes.

import type { CreateIssueInput, Issue, IssueDetail, Plan } from "@shared/api";
import { getRun, setRun } from "./run-state";

export interface CreateOpts {
  assignee?: { name: string; context_score?: number; why?: string };
}

export interface KeeperClient {
  createIssue(input: CreateIssueInput, opts?: CreateOpts): Promise<{ issue_id: string }>;
  getIssue(id: string): Promise<IssueDetail | null>;
}

const CURRENT_USER = {
  name: "samuelalake",
  github_handle: "samuelalake",
  avatar_url:
    "https://api.builder.io/api/v1/image/assets/TEMP/15a001fa0d049362b83ad86d84c419cbf69c3ee1?width=40",
};

/* ----------------------------- mock adapter ----------------------------- */

const STORE_KEY = "keeper.issues.v1";

function readStore(): Record<string, IssueDetail> {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, IssueDetail>) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

// A short, url-friendly id without pulling in a dep.
function makeId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `iss_${Date.now().toString(36)}${rand}`;
}

// Keeper generates a plan asynchronously after an issue is filed. For the demo
// we synthesize a plausible one from the issue text so the detail page has real,
// input-derived content instead of "Lorem ipsum".
function synthesizePlan(issue: Issue, assignee?: CreateOpts["assignee"]): Plan {
  const words = issue.title.toLowerCase().split(/\s+/).filter(Boolean);
  const guessArea = words.find((w) => w.length > 3) ?? "core";
  const files = [`client/**/*${guessArea}*`, "shared/api.ts"];
  const owner = assignee?.name ?? CURRENT_USER.name;
  const title = issue.title.trim() || "the reported issue";
  return {
    plan_id: `plan_${issue.issue_id}`,
    issue_id: issue.issue_id,
    version: 1,
    root_cause_hypothesis: `Scoped from the request: "${title}".`,
    approach: `Reproduce "${title}" behind a failing test, apply the smallest fix within the scoped boundary, and back it with regression coverage before human review.`,
    acceptance_criteria: [
      `"${title}" no longer reproduces under the new test`,
      "The change stays inside the file boundary",
      "A regression test covers the fix and CI is green",
      `${owner} reviews and approves before merge`,
    ],
    subtasks: [
      "Write a failing test that reproduces the behavior",
      `Apply the minimal fix in ${files[0]}`,
      "Add regression coverage and update the changelog",
      "Open a PR for human review",
    ],
    file_boundary: files,
    assignee: assignee
      ? { name: assignee.name, context_score: assignee.context_score ?? 0.9, why: assignee.why ?? "Matched by résumé." }
      : { name: CURRENT_USER.name, context_score: 0.82, why: `Highest recent context on ${guessArea}.` },
  };
}

const mockClient: KeeperClient = {
  async createIssue({ title, body }, opts) {
    const issue_id = makeId();
    const issue: Issue = {
      issue_id,
      title: title.trim() || "Untitled task",
      body: body.trim(),
      state: "open",
      provenance: "human",
      author: CURRENT_USER,
      created_at: new Date().toISOString(),
    };
    const store = readStore();
    store[issue_id] = { issue, plan: synthesizePlan(issue, opts?.assignee), versions: 1 };
    writeStore(store);
    return { issue_id };
  },

  async getIssue(id) {
    return readStore()[id] ?? null;
  },
};

/* ----------------------------- http adapter ----------------------------- */

function httpClient(baseUrl: string): KeeperClient {
  const base = `${baseUrl.replace(/\/$/, "")}/api/v1`;
  return {
    async createIssue(input) {
      const res = await fetch(`${base}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`createIssue failed: ${res.status}`);
      return res.json();
    },
    async getIssue(id) {
      const res = await fetch(`${base}/issues/${encodeURIComponent(id)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`getIssue failed: ${res.status}`);
      return res.json();
    },
  };
}

/* ------------------------------- selector ------------------------------- */

const apiUrl = import.meta.env.VITE_KEEPER_API_URL as string | undefined;

/** The active client. Mock unless VITE_KEEPER_API_URL is set. */
export const keeper: KeeperClient = apiUrl ? httpClient(apiUrl) : mockClient;

export const usingRealBackend = Boolean(apiUrl);

/* --------------------------- seeded demo feature --------------------------- */
// A feature request someone filed that Keeper has already built. It lands on the
// home feed already at the "ready for your review" state, so the reviewer flow
// (the card below the composer) opens straight onto Start human review.
export const DEMO_FEATURE_ID = "feat_csv_export";

const DEMO_FEATURE: IssueDetail = {
  issue: {
    issue_id: DEMO_FEATURE_ID,
    title: "Add CSV export to the analytics dashboard",
    body: "As an analyst, I want to export the current dashboard view to CSV so I can share numbers with teammates who don't use the tool. The export should respect the active filters.",
    state: "in_progress",
    provenance: "human",
    author: {
      name: "priyacodes",
      github_handle: "priyacodes",
      avatar_url: "https://api.builder.io/api/v1/image/assets/TEMP/56f88fd013b2206bbafd10651c57cdab930977d0?width=80",
    },
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  plan: {
    plan_id: `plan_${DEMO_FEATURE_ID}`,
    issue_id: DEMO_FEATURE_ID,
    version: 1,
    root_cause_hypothesis: "Add a CSV export action to the dashboard toolbar that serializes the filtered rows.",
    file_boundary: ["client/dashboard/Toolbar.tsx", "client/lib/csv.ts"],
    assignee: { name: "samuelalake", context_score: 0.88, why: "Owns the dashboard module." },
  },
  versions: 1,
};

/** Ensure the seeded feature exists (mock only) and is at the review-ready state. */
export function seedDemoIssue(): string {
  if (usingRealBackend) return DEMO_FEATURE_ID; // the backend owns its own seeds
  const store = readStore();
  if (!store[DEMO_FEATURE_ID]) {
    store[DEMO_FEATURE_ID] = DEMO_FEATURE;
    writeStore(store);
  }
  // Seed the run once (untouched → AI already planned + implemented, awaiting review).
  if (!getRun(DEMO_FEATURE_ID).intakeDone) {
    setRun(DEMO_FEATURE_ID, {
      intakeDone: true,
      description: DEMO_FEATURE.issue.body,
      planningDone: true,
      implementationDone: true,
      reviewDone: false,
      planVersion: 1,
    });
  }
  return DEMO_FEATURE_ID;
}
