import type {
  EventBus, Store, LlmClient, PomeriumGuard,
  BusEvent, IssueRecord, IssueCreatedPayload,
} from "../contract/index.js";
import { isWithinBoundary } from "../pomerium/index.js";

export interface ChildSpec { title: string; body: string; file_boundary: string[] }
export interface DecomposerOptions { maxChildren?: number; maxDepth?: number }

/** Depth = number of parent links from this issue up to a root. */
export function issueDepth(store: Store, issueId: string): number {
  let depth = 0;
  let cur = store.getIssue(issueId);
  while (cur?.parent_issue) { depth++; cur = store.getIssue(cur.parent_issue); }
  return depth;
}

export function registerDecomposer(deps: {
  bus: EventBus; store: Store; llm: LlmClient; guard: PomeriumGuard; opts?: DecomposerOptions;
}): void {
  const { bus, store, llm, guard } = deps;
  const maxChildren = deps.opts?.maxChildren ?? 3;
  const maxDepth = deps.opts?.maxDepth ?? Number(process.env.MAX_DECOMP_DEPTH ?? 3);

  bus.subscribe("plan.too_large", async (event: BusEvent) => {
    const issueId = event.issue_id ?? (event.payload as any).issue_id;
    const parent = store.getIssue(issueId);
    if (!parent) return;

    if (issueDepth(store, issueId) >= maxDepth) {
      store.appendEvent({ type: "plan.revised", issue_id: issueId, provenance: "keeper", payload: { stopped: "max_depth", maxDepth } });
      return;
    }

    const parentBoundary = store.latestPlan(issueId)?.file_boundary ?? [];
    const prompt = [
      `Parent issue: ${parent.title}`,
      `Parent file_boundary: ${JSON.stringify(parentBoundary)}`,
      `Split this into at most ${maxChildren} smaller child issues.`,
      `Return JSON {"children":[{"title":string,"body":string,"file_boundary":string[]}]}.`,
      `Each child's file_boundary MUST be a subset of the parent boundary and strictly smaller.`,
    ].join("\n");

    let split: { children: ChildSpec[] };
    try { split = await llm.completeJson<{ children: ChildSpec[] }>(prompt); }
    catch (err) { store.appendEvent({ type: "plan.revised", issue_id: issueId, provenance: "keeper", payload: { error: String(err), stage: "decompose" } }); return; }

    const children = (split.children ?? [])
      .filter(c => c.file_boundary && c.file_boundary.length > 0)
      .filter(c => c.file_boundary.every(p => parentBoundary.length === 0 || isWithinBoundary(p, parentBoundary)))
      .slice(0, maxChildren);

    let n = 0;
    for (const c of children) {
      const childId = `${issueId}.c${++n}`;
      const ok = await guard.authorizeWrite({ action: "file_issue", identity: "keeper", scope: c.file_boundary, reason: `decompose ${issueId}`, issue_id: childId });
      if (!ok) continue; // guard already emitted pomerium.denied; escalate, don't create

      const child: IssueRecord = { issue_id: childId, title: c.title, body: c.body, state: "open", provenance: "keeper_decomposer", parent_issue: issueId, children: [], branch: null, created_at: new Date().toISOString() };
      store.upsertIssue(child);
      const fresh = store.getIssue(issueId)!;
      store.upsertIssue({ ...fresh, children: [...fresh.children, childId] });

      const payload: IssueCreatedPayload = { issue_id: childId, title: c.title, body: c.body, provenance: "keeper_decomposer", parent_issue: issueId };
      store.appendEvent({ type: "issue.created", issue_id: childId, provenance: "keeper", payload: payload as any });
      bus.publish({ type: "issue.created", issue_id: childId, provenance: "keeper", payload: payload as any });
    }
  });
}
