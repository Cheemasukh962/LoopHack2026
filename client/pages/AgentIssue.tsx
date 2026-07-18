import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { keeper, assigneeDisplayName } from "@/lib/keeper";
import { describe, usePoll, SPONSOR_META, type Sponsor, type TimelineItem } from "@/lib/loop";
import type { IssueDetail, LoopEvent, PhaseView, Stats, IssueSummary } from "@shared/api";

/* --------------------------------- atoms --------------------------------- */

function StatusDot({ status }: { status: string }) {
  const color =
    status === "passed" ? "#1F883D" : status === "active" ? "#BF8700" : status === "failed" ? "#CF222E" : "#8C959F";
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />;
}

function SponsorChip({ sponsor }: { sponsor: Exclude<Sponsor, null> }) {
  const m = SPONSOR_META[sponsor];
  return (
    <span
      className="ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold align-middle"
      style={{ color: m.color, background: `${m.color}14`, boxShadow: `inset 0 0 0 1px ${m.color}33` }}
    >
      {m.label}
    </span>
  );
}

/* ------------------------------- sponsor strip ---------------------------- */

function SponsorStrip({ items }: { items: TimelineItem[] }) {
  const latest: Partial<Record<Exclude<Sponsor, null>, string>> = {};
  for (const it of items) if (it.sponsor) latest[it.sponsor] = it.detail || it.title;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {(Object.keys(SPONSOR_META) as Array<Exclude<Sponsor, null>>).map((s) => {
        const m = SPONSOR_META[s];
        const active = Boolean(latest[s]);
        return (
          <div
            key={s}
            className="rounded-md border bg-white p-3 transition-all"
            style={{ borderColor: active ? m.color : "#D1D9E0", boxShadow: active ? `0 0 0 1px ${m.color}` : undefined, opacity: active ? 1 : 0.55 }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: active ? m.color : "#57606A" }}>{m.label}</span>
              <span className="h-2 w-2 rounded-full" style={{ background: active ? m.color : "#C9D1D9" }} />
            </div>
            <p className="mt-0.5 text-[11px] uppercase tracking-wide text-gh-fgMuted">{m.blurb}</p>
            <p className="mt-1 truncate text-xs text-gh-fg" title={latest[s]}>{active ? latest[s] : "waiting…"}</p>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------- phase bar ------------------------------- */

function PhaseBar({ view }: { view: PhaseView | null }) {
  const phases = view?.phases ?? [
    { phase: "planning", status: "pending", detail: "", updated_at: "" },
    { phase: "implementation", status: "pending", detail: "", updated_at: "" },
    { phase: "review", status: "pending", detail: "", updated_at: "" },
  ];
  return (
    <div className="rounded-md border border-gh-borderMuted bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {phases.map((p) => (
          <div key={p.phase} className="flex items-center gap-2">
            <StatusDot status={p.status} />
            <div>
              <p className="text-sm font-semibold capitalize text-gh-fg">{p.phase}</p>
              <p className="text-xs text-gh-fgMuted">{p.detail || p.status}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- plan card ------------------------------- */

function PlanCard({ detail }: { detail: IssueDetail }) {
  const plan = detail.plan;
  if (!plan) return (
    <div className="rounded-md border border-gh-borderMuted bg-white p-4 text-sm text-gh-fgMuted">
      Keeper is drafting a plan…
    </div>
  );
  const name = assigneeDisplayName(plan);
  return (
    <div className="rounded-md border border-gh-borderMuted bg-white p-4">
      <h3 className="text-sm font-semibold text-gh-fg">Keeper's plan</h3>
      <p className="mt-1 text-sm text-gh-fg">{plan.root_cause_hypothesis}</p>

      {plan.assignee && (
        <div className="mt-3 rounded-[3px] bg-gh-canvasInset p-3">
          <p className="text-sm font-semibold text-gh-fg">
            Assigned {name} <span className="font-normal text-gh-fgMuted">· context {plan.assignee.context_score.toFixed(2)}</span>
            <SponsorChip sponsor="nexla" />
          </p>
          {plan.assignee.why && <p className="mt-1 text-xs text-gh-fgMuted">{plan.assignee.why}</p>}
        </div>
      )}

      {plan.file_boundary?.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gh-fgMuted">File boundary <span className="font-normal normal-case">(Pomerium-enforced)</span></p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {plan.file_boundary.map((f) => (
              <code key={f} className="rounded bg-gh-canvasInset px-1.5 py-0.5 text-xs text-gh-fg">{f}</code>
            ))}
          </div>
        </div>
      )}

      {plan.prior_art && plan.prior_art.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gh-fgMuted">Prior art <SponsorChip sponsor="nexla" /></p>
          <ul className="mt-1 space-y-1">
            {plan.prior_art.slice(0, 3).map((pa) => (
              <li key={pa.issue_id} className="text-xs text-gh-fg">
                <span className="font-semibold">{pa.issue_id}</span> <span className="text-gh-fgMuted">({Math.round(pa.similarity * 100)}%)</span> — {pa.resolution}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.recommended_tool && (
        <div className="mt-3 rounded-[3px] border border-[#0E9F6E33] bg-[#0E9F6E0a] p-3">
          <p className="text-sm font-semibold text-gh-fg">
            Discovered tool: <code className="text-[#0E9F6E]">{plan.recommended_tool.tool_name}</code>
            <SponsorChip sponsor="zero" />
          </p>
          <p className="mt-0.5 text-xs text-gh-fgMuted">{plan.recommended_tool.why}</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- timeline list ---------------------------- */

function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="rounded-md border border-gh-borderMuted bg-white">
      <div className="border-b border-gh-borderMuted px-4 py-2 text-sm font-semibold text-gh-fg">Live event stream</div>
      <ol className="divide-y divide-gh-borderMuted">
        {items.length === 0 && <li className="px-4 py-3 text-sm text-gh-fgMuted">Waiting for the loop…</li>}
        {items.map((it) => (
          <li key={it.event_id} className="flex items-start gap-3 px-4 py-2.5">
            <code className="mt-0.5 shrink-0 rounded bg-gh-canvasInset px-1.5 py-0.5 text-[11px] text-gh-fgMuted">{it.type}</code>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gh-fg">
                {it.title}
                {it.sponsor && <SponsorChip sponsor={it.sponsor} />}
              </p>
              {it.detail && <p className="truncate text-xs text-gh-fgMuted" title={it.detail}>{it.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* --------------------------------- page ----------------------------------- */

const advanced = new Set<string>();

export default function AgentIssue() {
  const { id } = useParams();
  const issueId = id ?? "";
  const [busy, setBusy] = useState<string | null>(null);

  const detail = usePoll<IssueDetail | null>(() => (issueId ? keeper.getIssue(issueId) : Promise.resolve(null)), 1200, [issueId]);
  const events = usePoll<LoopEvent[]>(() => (issueId ? keeper.getEvents(issueId) : Promise.resolve([])), 1200, [issueId]);
  const phases = usePoll<PhaseView | null>(() => (issueId ? keeper.getPhases(issueId) : Promise.resolve(null)), 1200, [issueId]);
  const stats = usePoll<Stats>(() => keeper.getStats(), 1500, []);
  const issues = usePoll<IssueSummary[]>(() => keeper.listIssues(), 1500, []);

  const items = useMemo<TimelineItem[]>(
    () => (events ?? []).map(describe).filter((x): x is TimelineItem => Boolean(x)),
    [events],
  );

  // Auto-advance the implementation phase once the plan exists (enriches the real stream).
  useEffect(() => {
    if (detail?.plan && issueId && !advanced.has(issueId)) {
      advanced.add(issueId);
      keeper.advanceImplementation(issueId).catch(() => advanced.delete(issueId));
    }
  }, [detail?.plan, issueId]);

  const filedChildren = (issues ?? []).filter((i) => i.issue_id.startsWith(`SCAN-${issueId}-`));
  const merged = (events ?? []).some((e) => e.type === "branch.merged");
  const bodyFromEvent = (events ?? []).find((e) => e.type === "issue.created")?.payload?.body as string | undefined;

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try { await fn(); } finally { setTimeout(() => setBusy(null), 400); }
  }

  if (!detail) {
    return (
      <main className="mx-auto w-full max-w-[900px] px-4 py-10 sm:px-8">
        <Link to="/" className="text-sm text-[#0969DA] hover:underline">← Home</Link>
        <p className="mt-6 text-sm text-gh-fgMuted">Loading {issueId}…</p>
      </main>
    );
  }

  const { issue } = detail;
  const isKeeper = issue.provenance !== "human";

  return (
    <main className="mx-auto w-full max-w-[900px] px-4 pb-16 pt-6 sm:px-8">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm text-[#0969DA] hover:underline">← Home</Link>
        {stats && (
          <div className="flex items-center gap-3 text-xs text-gh-fgMuted">
            <span>human filed <b className="text-gh-fg">{stats.human_filed}</b></span>
            <span className="rounded-full bg-[#1F883D] px-2 py-0.5 font-semibold text-white">keeper filed {stats.keeper_filed}</span>
          </div>
        )}
      </div>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isKeeper ? "bg-[#8250DF] text-white" : "bg-[#1F883D] text-white"}`}>
            {isKeeper ? "filed by Keeper" : "filed by a human"}
          </span>
          <span className="text-xs text-gh-fgMuted">{issue.issue_id}</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-gh-fg">{issue.title}</h1>
        {(issue.body || bodyFromEvent) && <p className="mt-1 max-w-2xl text-sm text-gh-fgMuted">{issue.body || bodyFromEvent}</p>}
      </header>

      <section className="mt-5 flex flex-col gap-4">
        <SponsorStrip items={items} />
        <PhaseBar view={phases} />
        <PlanCard detail={detail} />

        {/* actions */}
        <div className="flex flex-wrap items-center gap-2">
          {!merged ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("merge", () => keeper.merge(issueId))}
              className="rounded-md bg-[#1F883D] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
            >
              {busy === "merge" ? "Merging…" : "Merge & let Keeper scan"}
            </button>
          ) : (
            <span className="rounded-md bg-[#DAFBE1] px-3 py-1.5 text-sm font-semibold text-[#1A7F37]">Merged · post-merge scan ran</span>
          )}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("ci", () => keeper.failCi(issueId))}
            className="rounded-md border border-gh-border px-3 py-1.5 text-sm font-medium text-gh-fg hover:bg-gh-canvasInset disabled:opacity-50"
          >
            {busy === "ci" ? "…" : "Simulate CI failure → self-replan"}
          </button>
        </div>

        {filedChildren.length > 0 && (
          <div className="rounded-md border border-[#8250DF55] bg-[#FBEFFF] p-4">
            <p className="text-sm font-semibold text-[#6E40C9]">
              Keeper filed {filedChildren.length} new issue{filedChildren.length > 1 ? "s" : ""} — no human touched it.
            </p>
            <ul className="mt-2 space-y-1">
              {filedChildren.map((c) => (
                <li key={c.issue_id}>
                  <Link to={`/issue/${c.issue_id}`} className="text-sm text-[#0969DA] hover:underline">
                    {c.issue_id} — {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Timeline items={items} />
      </section>
    </main>
  );
}
