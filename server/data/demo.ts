import type { FeedItem, IssueDetail, User } from "@shared/api";

// Demo dataset for the frontend-wiring endpoints. One coherent Keeper story: a human files an
// issue once, the agent plans it, decomposes/executes, and phases gate the merge. Avatar URLs
// are the same public assets the UI already used, so the design stays pixel-identical.
const AV = {
  samuel: "https://api.builder.io/api/v1/image/assets/TEMP/15a001fa0d049362b83ad86d84c419cbf69c3ee1?width=40",
  steipete: "https://api.builder.io/api/v1/image/assets/TEMP/56f88fd013b2206bbafd10651c57cdab930977d0?width=80",
  oz: "https://api.builder.io/api/v1/image/assets/TEMP/90a99dd6e925502c62c330bbc0aeb14c37a274db?width=80",
};

const HOUR = 3_600_000;
// Fixed reference time so demo relative-times are stable within a run without Date.now flakiness.
const T0 = Date.parse("2026-07-17T15:00:00Z");

export const DEMO_USER: User = {
  handle: "samuelalake",
  avatar: AV.samuel,
  githubConnected: false,
  resumeUploaded: false,
};

export const DEMO_FEED: FeedItem[] = [
  {
    id: "iss-500s",
    actor: { name: "samuel", avatar: AV.steipete, verified: true },
    action: "planning",
    issueRef: { id: "iss-500s", title: "Intermittent 500s on checkout under load" },
    createdAtMs: T0 - 13 * 60_000,
    status: "In progress",
    headline: "Retry storms with no timeout",
    excerpt: "Checkout returns sporadic 500s during traffic spikes; the retry client has no per-attempt timeout.",
    reactions: 2,
    comments: 5,
  },
  {
    id: "iss-iac",
    actor: { name: "keeper", avatar: AV.oz, verified: true },
    action: "scanning",
    issueRef: { id: "iss-iac", title: "IaC misconfig: open SSH ingress in infra/main.tf" },
    createdAtMs: T0 - 2 * HOUR,
    status: "Filed by Keeper",
    headline: "Security group allows 0.0.0.0/0 on port 22",
    excerpt: "Scanner discovered a Terraform misconfiguration in the staged diff and filed this automatically.",
    reactions: 4,
    comments: 1,
  },
];

const ISSUES: Record<string, IssueDetail> = {
  "iss-500s": {
    id: "iss-500s",
    title: "Intermittent 500s on checkout under load",
    author: "arturcraft",
    createdAtMs: T0 - 5 * 24 * HOUR,
    kickoff: {
      author: "madebyoz",
      action: "kicked off a task",
      heading: "Intermittent 500s on checkout",
      checklist: ["Reproduce under load", "Add per-attempt timeout"],
      sections: [
        { heading: "Description", body: "Checkout intermittently returns 500s during traffic spikes. Recall matched prior issue #412." },
        { heading: "Root cause", body: "The retry client retries without a per-attempt timeout, causing retry storms under load." },
      ],
    },
    activities: [
      { author: "keeper", action: "recalled prior art #412 (similarity 0.42)", commitLabel: "recall.hit → locate.done", commitHash: "21af1fd" },
      { author: "keeper", action: "routed to the true code owner", commitLabel: "route.assigned → Marco Reyes", commitHash: "a3f9c01" },
    ],
    plan: {
      author: "agent",
      action: "created a full plan with development life cycle",
      sections: [
        { title: "Planning", assigned: ["AI"], text: "Confirm root cause against blame on src/http/retry.ts; scope file_boundary." },
        {
          title: "Implementation",
          assigned: ["Marco Reyes", "AI"],
          steps: [
            { title: "Development", tagline: "Add exponential backoff + per-attempt timeout" },
            { title: "Verification", tagline: "Regression test for retry storms" },
          ],
        },
        { title: "Review", assigned: ["Marco Reyes", "AI"], text: "Verify Pomerium write stayed within file_boundary before merge." },
      ],
    },
    merge: {
      phasesAwaiting: 3,
      summary: "You need to complete all phases before you can merge",
      pending: [{ label: "Review — Expected — Waiting for status to be reported", provider: "review", required: true, state: "pending" }],
      successful: [
        { label: "Planning", provider: "planning", required: false, state: "success" },
        { label: "Implementation", provider: "implementation", required: false, state: "success" },
        { label: "Vercel", provider: "vercel", required: false, state: "success" },
      ],
    },
  },
  "iss-iac": {
    id: "iss-iac",
    title: "IaC misconfig: open SSH ingress in infra/main.tf",
    author: "keeper",
    createdAtMs: T0 - 2 * HOUR,
    kickoff: {
      author: "keeper",
      action: "filed this issue automatically (Loop 5)",
      heading: "Open SSH ingress in infra/main.tf",
      checklist: ["Restrict CIDR", "Add CI plan guard"],
      sections: [
        { heading: "Description", body: "Zero.xyz tool discovery ran an IaC scanner on the staged diff and found an open SSH ingress rule." },
        { heading: "Finding", body: "infra/main.tf: security group allows 0.0.0.0/0 on port 22." },
      ],
    },
    activities: [
      { author: "keeper", action: "discovered an IaC scanner via Zero.xyz", commitLabel: "gap.detected → scan.found", commitHash: "bd41e07" },
    ],
    plan: {
      author: "agent",
      action: "created a remediation plan",
      sections: [
        { title: "Planning", assigned: ["AI"], text: "Scope the change to infra/main.tf security group rule." },
        { title: "Implementation", assigned: ["Akash Rao", "AI"], steps: [{ title: "Development", tagline: "Restrict ingress CIDR" }, { title: "Verification", tagline: "terraform plan diff review" }] },
        { title: "Review", assigned: ["Akash Rao", "AI"], text: "Confirm no other rules regressed." },
      ],
    },
    merge: {
      phasesAwaiting: 2,
      summary: "You need to complete all phases before you can merge",
      pending: [{ label: "Implementation — in progress", provider: "implementation", required: true, state: "pending" }],
      successful: [{ label: "Planning", provider: "planning", required: false, state: "success" }],
    },
  },
};

export function getIssue(id: string): IssueDetail | undefined {
  return ISSUES[id];
}
