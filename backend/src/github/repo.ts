// Real GitHub ingest — turns a live public repo into the Nexset-shaped rows the loop
// already understands (ownership / blame / history) plus a real diff to scan.
//
// This is what makes the demo NOT static: real contributors, real commits, real files.
// Cached to disk so restarts (and tsx-watch reloads) don't burn the API rate limit, and
// it degrades gracefully to the seeded fallback if GitHub is unreachable.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { OwnershipRow, BlameRow, HistoryRow } from "../nexla/index.js";

export interface RepoPerson {
  login: string;
  name: string;
  contributions: number;
  avatar_url: string;
  html_url: string;
}

export interface RepoIngest {
  target: string; // "owner/repo"
  html_url: string;
  fetched_at: string;
  people: RepoPerson[];
  ownership: OwnershipRow[];
  blame: BlameRow[];
  history: HistoryRow[];
  latestDiff: string;
  dominantDir: string;
}

const API = "https://api.github.com";
const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".cache");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function headers(accept = "application/vnd.github+json"): Record<string, string> {
  const h: Record<string, string> = { Accept: accept, "User-Agent": "keeper-loophack" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`GitHub ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

async function getDiff(sha: string, target: string): Promise<string> {
  const res = await fetch(`${API}/repos/${target}/commits/${sha}`, {
    headers: headers("application/vnd.github.v3.diff"),
  });
  return res.ok ? await res.text() : "";
}

const topDir = (path: string): string => {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)).join("/") : parts[0];
};

const prNumber = (msg: string): string | null => {
  const m = msg.match(/\(#(\d+)\)/);
  return m ? `#${m[1]}` : null;
};

const KEY_STOP = new Set(["the", "a", "for", "and", "to", "of", "in", "on", "with", "make", "fix", "add", "use", "it"]);
const keywords = (text: string): string[] =>
  [...new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 3 && !KEY_STOP.has(w)))].slice(0, 10);

interface GhContributor { login: string; contributions: number; avatar_url: string; html_url: string; }
interface GhCommitListItem { sha: string; commit: { message: string; author: { name: string; date: string } }; author: { login: string } | null; }
interface GhCommitDetail { sha: string; commit: { message: string; author: { name: string; date: string } }; author: { login: string } | null; files?: { filename: string }[]; }

async function fetchIngest(target: string): Promise<RepoIngest> {
  const [contributors, commits] = await Promise.all([
    getJson<GhContributor[]>(`/repos/${target}/contributors?per_page=30`),
    getJson<GhCommitListItem[]>(`/repos/${target}/commits?per_page=30`),
  ]);

  const people: RepoPerson[] = contributors.map((c) => ({
    login: c.login,
    name: c.login,
    contributions: c.contributions,
    avatar_url: c.avatar_url,
    html_url: c.html_url,
  }));

  // Pull file lists for ALL recent commits so every history row has real linked files
  // (otherwise recall matches a commit with no files and locate falls back to a canned path).
  const detailShas = commits.slice(0, 20).map((c) => c.sha);
  const details = await Promise.all(
    detailShas.map((sha) => getJson<GhCommitDetail>(`/repos/${target}/commits/${sha}`).catch(() => null)),
  );

  // Real blame per file + per-(author, module) touch counts for real ownership.
  const blameMap = new Map<string, { last_author: string; recent: string[] }>();
  const dirCount = new Map<string, number>();
  const authorDir = new Map<string, Map<string, number>>();
  for (const d of details) {
    if (!d) continue;
    const author = d.author?.login ?? d.commit.author.name;
    for (const f of d.files ?? []) {
      const dir = topDir(f.filename);
      dirCount.set(dir, (dirCount.get(dir) ?? 0) + 1);
      if (!authorDir.has(author)) authorDir.set(author, new Map());
      const dm = authorDir.get(author)!;
      dm.set(dir, (dm.get(dir) ?? 0) + 1);
      const cur = blameMap.get(f.filename);
      if (!cur) blameMap.set(f.filename, { last_author: author, recent: [author] });
      else if (!cur.recent.includes(author)) cur.recent.push(author);
    }
  }
  const blame: BlameRow[] = [...blameMap.entries()].map(([path, v]) => ({
    path,
    last_author: v.last_author,
    recent_authors: v.recent.slice(0, 4),
  }));

  const topDirs = [...dirCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map((e) => e[0]);
  const dominantDir = topDirs[0] ?? "src";

  // Real ownership: one row per (contributor, module) they actually touched, PLUS a safety net so
  // every top module has candidates (no "unassigned"). Scored by real touch counts + contributions.
  const contribOf = new Map(people.map((p) => [p.login, p.contributions]));
  const maxContrib = Math.max(1, ...people.map((p) => p.contributions));
  const ownership: OwnershipRow[] = [];
  const seen = new Set<string>();
  const addOwner = (login: string, dir: string, blameScore: number) => {
    const key = `${login}@@${dir}`;
    if (seen.has(key)) return;
    seen.add(key);
    const contrib = contribOf.get(login) ?? 1;
    ownership.push({
      person_id: login,
      name: login,
      path: dir,
      recency_weighted_blame: Number(Math.min(1, blameScore).toFixed(3)),
      pr_authorship: Number((0.6 * (contrib / maxContrib) + 0.2).toFixed(3)),
      review_participation: 0.4,
      repo_commits: Math.max(6, contrib), // real contributors are never cold-start
      resume_prior: 0.3,
      external_github_prior: 0.4,
    });
  };
  for (const [author, dirs] of authorDir) {
    const maxTouch = Math.max(1, ...dirs.values());
    for (const [dir, count] of dirs) addOwner(author, dir, count / maxTouch);
  }
  // Safety net: top contributors also own the top modules (lower blame) so nothing is unassigned.
  for (const dir of topDirs) {
    people.slice(0, 8).forEach((p, i) => addOwner(p.login, dir, 0.45 * (1 - i / 8) * (p.contributions / maxContrib)));
  }

  // Real history: recent commits/PRs as prior art.
  const shaToFiles = new Map(details.filter(Boolean).map((d) => [d!.sha, (d!.files ?? []).map((f) => f.filename)]));
  const history: HistoryRow[] = commits.slice(0, 20).map((c) => {
    const firstLine = c.commit.message.split("\n")[0];
    const id = prNumber(c.commit.message) ?? `@${c.sha.slice(0, 7)}`;
    return {
      issue_id: id,
      title: firstLine,
      body: c.commit.message,
      resolution: `${firstLine} — by ${c.author?.login ?? c.commit.author.name}`,
      linked_files: shaToFiles.get(c.sha) ?? [],
      keywords: keywords(c.commit.message),
    };
  });

  const latestDiff = await getDiff(commits[0].sha, target);

  return {
    target,
    html_url: `https://github.com/${target}`,
    fetched_at: new Date().toISOString(),
    people,
    ownership,
    blame,
    history,
    latestDiff,
    dominantDir,
  };
}

const CACHE_VERSION = "v2"; // bump when the ingest shape changes to invalidate old caches
function cachePath(target: string): string {
  return join(CACHE_DIR, `gh-${CACHE_VERSION}-${target.replace("/", "-")}.json`);
}

function readCache(target: string): RepoIngest | null {
  try {
    const p = cachePath(target);
    if (!existsSync(p)) return null;
    const data = JSON.parse(readFileSync(p, "utf8")) as RepoIngest;
    // fetched_at parsed lazily; TTL check kept simple to avoid Date.now surprises.
    const age = Date.now() - new Date(data.fetched_at).getTime();
    return age < CACHE_TTL_MS ? data : null;
  } catch {
    return null;
  }
}

function writeCache(target: string, data: RepoIngest): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath(target), JSON.stringify(data, null, 2), "utf8");
  } catch { /* best effort */ }
}

/**
 * Ingest a real public GitHub repo into Nexset-shaped rows. Disk-cached (24h) so restarts
 * don't burn the rate limit. Returns null if GitHub is unreachable so callers fall back
 * to the seeded local Nexsets.
 */
export async function ingestRepo(): Promise<RepoIngest | null> {
  const target = process.env.TARGET_REPO ?? "facebook/react";
  const cached = readCache(target);
  if (cached) {
    console.info(`[github] using cached ingest for ${target} (${cached.people.length} contributors)`);
    return cached;
  }
  try {
    const data = await fetchIngest(target);
    writeCache(target, data);
    console.info(`[github] ingested ${target}: ${data.people.length} contributors, ${data.history.length} commits, ${data.blame.length} files, dominant dir "${data.dominantDir}"`);
    return data;
  } catch (e) {
    console.warn(`[github] ingest failed (${String(e)}) — falling back to seeded Nexsets`);
    return null;
  }
}
