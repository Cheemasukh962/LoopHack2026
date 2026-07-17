import type { FeedItem, IssueDetail, User } from "@shared/api";

// Single seam for where the data comes from. Today it's this app's own Express routes
// (mounted as Vite middleware in dev, Netlify function in prod). To point the frontend at
// eng-a's real Keeper backend later, change API_BASE (or add a Vite proxy) — nothing else.
export const API_BASE = "/api";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export const getMe = () => getJson<User>("/me");
export const getFeed = () => getJson<FeedItem[]>("/feed");
export const getIssue = (id: string) => getJson<IssueDetail>(`/issues/${encodeURIComponent(id)}`);
