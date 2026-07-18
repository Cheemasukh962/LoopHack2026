import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { keeper, assigneeDisplayName } from "@/lib/keeper";
import { usePoll } from "@/lib/loop";
import type { IssueDetail, IssueSummary, LoopEvent, Stats } from "@shared/api";

type Via = "nexla" | "zero" | "pomerium";
const VIA_COLOR: Record<Via, string> = { nexla: "#7C3AED", zero: "#0E9F6E", pomerium: "#2563EB" };
const VIA_LABEL: Record<Via, string> = { nexla: "Nexla", zero: "Zero", pomerium: "Pomerium" };

function ViaTag({ via }: { via: Via }) {
  return (
    <span className="ml-2 inline-flex items-center gap-1 align-middle text-[11px] text-gh-fgMuted">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: VIA_COLOR[via] }} />
      {VIA_LABEL[via]}
    </span>
  );
}

interface Step {
  done: boolean;
  active?: boolean;
  label: string;
  detail?: string;
  via?: Via;
  node?: React.ReactNode;
}

function Dot({ done, active }: { done: boolean; active?: boolean }) {
  if (done) return <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1F883D] text-[10px] text-white">✓</span>;
  if (active) return <span className="h-4 w-4 rounded-full border-2 border-[#0969DA] bg-white" />;
  return <span className="h-4 w-4 rounded-full border-2 border-gh-border bg-white" />;
}

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol>
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <Dot done={s.done} active={s.active} />
            {i < steps.length - 1 && <span className="w-px flex-1 bg-gh-border" style={{ minHeight: 18 }} />}
          </div>
          <div className={`min-w-0 flex-1 ${i < steps.length - 1 ? "pb-4" : ""}`}>
            <p className={`text-sm ${s.done || s.active ? "text-gh-fg" : "text-gh-fgMuted"}`}>
              {s.label}
              {s.via && (s.done || s.active) && <ViaTag via={s.via} />}
            </p>
            {s.detail && (s.done || s.active) && <p className="mt-0.5 text-xs text-gh-fgMuted">{s.detail}</p>}
            {s.node}
          </div>
        </li>
      ))}
    </ol>
  );
}

const advanced = new Set<string>();

export default function AgentIssue() {
  const { id } = useParams();
  const issueId = id ?? "";
  const [busy, setBusy] = useState<string | null>(null);

  const detail = usePoll<IssueDetail | null>(() => (issueId ? keeper.getIssue(issueId) : Promise.resolve(null)), 1200, [issueId]);
  const events = usePoll<LoopEvent[]>(() => (issueId ? keeper.getEvents(issueId) : Promise.resolve([])), 1200, [issueId]);
  const stats = usePoll<Stats>(() => keeper.getStats(), 2000, []);
  const issues = usePoll<IssueSummary[]>(() => keeper.listIssues(), 2000, []);

  useEffect(() => {
    if (detail?.plan && issueId && !advanced.has(issueId)) {
      advanced.add(issueId);
      keeper.advanceImplementation(issueId).catch(() => advanced.delete(issueId));
    }
  }, [detail?.plan, issueId]);

  const has = (t: string) => (events ?? []).some((e) => e.type === t);
  const find = (t: string) => (events ?? []).find((e) => e.type === t);
  const p = (e?: LoopEvent) => (e?.payload ?? {}) as any;

  const plan = detail?.plan ?? null;
  const merged = has("branch.merged");
  const scanned = has("scan.started");
  const filedChildren = (issues ?? []).filter((i) => i.issue_id.startsWith(`SCAN-${issueId}-`));
  const bodyFromEvent = p(find("issue.created")).body as string | undefined;

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try { await fn(); } finally { setTimeout(() => setBusy(null), 400); }
  }

  const steps = useMemo<Step[]>(() => {
    const assignee = assigneeDisplayName(plan);
    const tool = plan?.recommended_tool?.tool_name ?? (p(find("tool.discovered")).tool_name as string | undefined);
    const topHit = p(find("recall.hit")).top_hit as string | undefined;
    const fileB = plan?.file_boundary?.[0] ?? (p(find("locate.done")).file_boundary?.[0] as string | undefined);

    const base: Step[] = [
      { done: has("recall.hit"), label: "Recalled prior art", detail: topHit ? `closest match ${topHit}` : undefined, via: "nexla" },
      { done: has("locate.done"), label: "Located the fix", detail: fileB, via: "nexla" },
      { done: has("route.assigned"), label: assignee ? `Assigned ${assignee}` : "Routing to an owner…", detail: "the proven owner — blame beats the résumé", via: "nexla" },
      { done: has("plan.created"), label: "Drafted a plan", detail: tool ? `will verify with ${tool}` : undefined, via: "zero" },
      {
        done: merged,
        active: has("plan.created") && !merged,
        label: merged ? "Merged" : "Ready for review & merge",
        node: !merged && has("plan.created") ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={busy !== null} onClick={() => run("merge", () => keeper.merge(issueId))}
              className="rounded-md bg-[#1F883D] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50">
              {busy === "merge" ? "Merging…" : "Merge & let Keeper scan"}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => run("ci", () => keeper.failCi(issueId))}
              className="rounded-md border border-gh-border px-3 py-1.5 text-sm text-gh-fg hover:bg-gh-canvasInset disabled:opacity-50">
              Simulate CI failure
            </button>
          </div>
        ) : undefined,
      },
    ];
    if (merged || scanned) {
      base.push({
        done: scanned,
        label: filedChildren.length ? `Scanned the merged diff → filed ${filedChildren.length} new issue${filedChildren.length > 1 ? "s" : ""}` : "Scanning the merged diff…",
        via: "zero",
        node: filedChildren.length ? (
          <ul className="mt-2 space-y-1">
            {filedChildren.map((c) => (
              <li key={c.issue_id}>
                <Link to={`/issue/${c.issue_id}`} className="text-sm text-[#0969DA] hover:underline">{c.issue_id} — {c.title}</Link>
              </li>
            ))}
          </ul>
        ) : undefined,
      });
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, plan, merged, scanned, busy, issues, issueId]);

  if (!detail) {
    return (
      <main className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-6">
        <Link to="/" className="text-sm text-[#0969DA] hover:underline">← Home</Link>
        <p className="mt-6 text-sm text-gh-fgMuted">Loading {issueId}…</p>
      </main>
    );
  }

  const { issue } = detail;
  const isKeeper = issue.provenance !== "human";
  const body = issue.body || bodyFromEvent;

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 pb-16 pt-6 sm:px-6">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm text-[#0969DA] hover:underline">← Home</Link>
        {stats && <span className="text-xs text-gh-fgMuted"><span className="font-semibold text-[#8250DF]">{stats.keeper_filed}</span> issues filed by Keeper</span>}
      </div>

      <header className="mt-4">
        <div className="flex items-center gap-2 text-xs text-gh-fgMuted">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold text-white ${isKeeper ? "bg-[#8250DF]" : "bg-[#1F883D]"}`}>
            {isKeeper ? "Keeper" : "open"}
          </span>
          {issue.issue_id}
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-gh-fg">{issue.title}</h1>
        {body && <p className="mt-2 rounded-md border border-gh-border bg-gh-canvasInset px-3 py-2 text-sm text-gh-fg">{body}</p>}
      </header>

      <section className="mt-6">
        <Timeline steps={steps} />
      </section>

      {plan && (
        <section className="mt-4 rounded-md border border-gh-border bg-white p-4">
          <h2 className="text-sm font-semibold text-gh-fg">Keeper's plan</h2>
          <p className="mt-1 text-sm text-gh-fg">{plan.root_cause_hypothesis}</p>
          {plan.assignee?.why && <p className="mt-2 text-xs text-gh-fgMuted">{plan.assignee.why}</p>}
          {plan.file_boundary?.length > 0 && (
            <p className="mt-2 text-xs text-gh-fgMuted">
              Scope: {plan.file_boundary.map((f) => <code key={f} className="mr-1 rounded bg-gh-canvasInset px-1 py-0.5 text-gh-fg">{f}</code>)}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
