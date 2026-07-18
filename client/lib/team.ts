// Autonomous delegation engine (the people-centric vision).
//
// Keeper delegates a task to the best RÉSUMÉ match, the person "does" it (using a Zero-discovered
// tool), Keeper reviews it — and if a résumé claim wasn't backed by real proof, the review catches a
// major mistake, a PM schedules a sync, and Keeper AUTO RE-DELEGATES to the proven owner. The loop
// repeats. Pure, deterministic logic (no randomness) so the demo lands every time.

export interface Member {
  id: string;
  name: string;
  skills: string[];
  stacks: string[];
  cold_start: boolean; // résumé claim not yet backed by commits
  commits: number;
  source: "team" | "uploaded";
}

export interface Task {
  id: string;
  title: string;
  required_skills: string[];
  module: string;
}

const lc = (s: string) => s.toLowerCase();
const skillHit = (skills: string[], want: string): boolean =>
  skills.map(lc).some((k) => k.includes(lc(want)) || lc(want).includes(k));

/** How good the RÉSUMÉ looks for this task (0..1) — what a naïve delegator trusts. */
export function resumeMatch(m: Member, t: Task): number {
  if (!t.required_skills.length) return 0;
  const hit = t.required_skills.filter((s) => skillHit(m.skills, s)).length;
  return Number((hit / t.required_skills.length).toFixed(2));
}

/** Actual proven capability — résumé match discounted by cold-start and weighted by real commits. */
export function provenFit(m: Member, t: Task): number {
  const proven = m.cold_start ? 0.2 : Math.min(1, m.commits / 300 + 0.35);
  return Number((resumeMatch(m, t) * proven).toFixed(2));
}

export function pickByResume(t: Task, members: Member[], exclude: string[] = []): Member | null {
  const pool = members.filter((m) => !exclude.includes(m.id));
  if (!pool.length) return null;
  // Naïve delegation trusts the résumé: best skill match, then the BROADER résumé (what over-selling
  // wins), then proven fit last. This is how an over-claiming candidate grabs a task they can't ship.
  return [...pool].sort((a, b) =>
    resumeMatch(b, t) - resumeMatch(a, t) ||
    b.skills.length - a.skills.length ||
    provenFit(b, t) - provenFit(a, t),
  )[0];
}

export function pickByProven(t: Task, members: Member[], exclude: string[] = []): Member | null {
  const pool = members.filter((m) => !exclude.includes(m.id));
  if (!pool.length) return null;
  return [...pool].sort((a, b) => provenFit(b, t) - provenFit(a, t) || b.commits - a.commits)[0];
}

export type Verdict = "clean" | "minor" | "major";
export function verdictFor(fit: number): Verdict {
  return fit >= 0.5 ? "clean" : fit >= 0.28 ? "minor" : "major";
}

/** The Zero-discovered tool Keeper would use to check the work, by module signal. */
export function toolFor(module: string): string {
  if (/infra|terraform|\.tf/i.test(module)) return "iac-misconfig-scanner";
  if (/auth|security|oauth/i.test(module)) return "secrets-and-authz-audit";
  if (/client|react|ui/i.test(module)) return "a11y-axe-scan";
  return "dependency-audit";
}

/** The demo task backlog — each maps to a real team skill set. */
export const BACKLOG: Task[] = [
  { id: "T-101", title: "Add a per-attempt timeout to the retry path", required_skills: ["reliability", "distributed systems", "incident response"], module: "src/http" },
  { id: "T-102", title: "Rotate OAuth session tokens on renewal", required_skills: ["authentication", "security", "oauth"], module: "src/auth" },
  { id: "T-103", title: "Restrict the Terraform security group from 0.0.0.0/0", required_skills: ["terraform", "aws", "sre"], module: "infra" },
  { id: "T-104", title: "Make the dashboard CSV export accessible", required_skills: ["react", "accessibility"], module: "client/dashboard" },
  { id: "T-105", title: "Add a circuit breaker to the upstream client", required_skills: ["distributed systems", "sre", "reliability"], module: "src/http" },
];

/* ------------------------------- résumé parsing ------------------------------ */

const SKILL_VOCAB = [
  "typescript", "javascript", "react", "node.js", "node", "express", "postgresql", "redis",
  "distributed systems", "incident response", "reliability", "sre", "observability",
  "security", "authentication", "oauth", "authorization", "cryptography",
  "terraform", "aws", "gcp", "kubernetes", "docker", "ci/cd", "ecs", "cloudwatch",
  "accessibility", "a11y", "product analytics", "playwright", "vite", "graphql", "python", "go",
];

/** Pull known skills out of pasted résumé text (best-effort keyword extraction). */
export function parseResumeSkills(text: string): string[] {
  const hay = lc(text);
  const found = SKILL_VOCAB.filter((s) => hay.includes(s));
  // de-dup a11y/accessibility and node/node.js
  const norm = new Set(found.map((s) => (s === "a11y" ? "accessibility" : s === "node" ? "node.js" : s)));
  return [...norm].slice(0, 8);
}

/** Rough commit estimate from a résumé's claimed years, so an uploaded person isn't auto-cold-start. */
export function estimateCommitsFromResume(text: string): number {
  const m = lc(text).match(/(\d+)\+?\s*years?/);
  const years = m ? Math.min(15, Number(m[1])) : 2;
  return years * 60;
}
