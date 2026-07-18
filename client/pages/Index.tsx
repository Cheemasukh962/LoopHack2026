import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { keeper } from "@/lib/keeper";
import { usePoll } from "@/lib/loop";
import type { IssueSummary, Stats } from "@shared/api";
import {
  AskBubbleIcon,
  ChevronDownIcon,
  PlusIcon,
  RepoBookIcon,
  SendIcon,
  SyncIcon,
} from "@/components/home/icons";

/* -------------------------------- composer -------------------------------- */

function Composer() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = value.trim().length > 0 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const [title, ...rest] = value.trim().split("\n");
      const body = rest.join("\n").trim() || title; // backend requires a body
      const { issue_id } = await keeper.createIssue({ title, body });
      navigate(`/issue/${issue_id}`);
    } catch (err) {
      console.error("Failed to create issue", err);
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="w-full rounded-md border border-gh-borderMuted bg-white p-4 shadow-[0_1px_1px_rgba(31,35,40,0.04)]"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        disabled={submitting}
        placeholder="Describe a bug — e.g. “Intermittent 500s on checkout”"
        className="w-full border-none bg-transparent text-base text-gh-fg placeholder:text-gh-fgMuted focus:outline-none disabled:opacity-60"
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className="flex items-center gap-1 rounded-md border border-gh-borderMuted px-3 py-1.5 text-sm font-medium text-[#25292E]">
          <AskBubbleIcon /> File issue <ChevronDownIcon />
        </button>
        <button type="button" className="flex items-center gap-1 rounded-md border border-gh-borderMuted px-3 py-1.5 text-sm font-medium text-[#25292E]">
          <RepoBookIcon /> All repositories <ChevronDownIcon />
        </button>
        <button type="button" aria-label="Add context" className="flex h-8 w-8 items-center justify-center rounded-md border border-[#D1D9E0]">
          <PlusIcon />
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" aria-label="Sync" className="flex h-8 w-8 items-center justify-center rounded-md"><SyncIcon /></button>
          <span className="mx-1 h-6 w-px bg-gh-border" aria-hidden />
          <button type="submit" aria-label="Send" disabled={!canSubmit}
            className="flex h-8 w-8 items-center justify-center rounded-md enabled:hover:bg-gh-canvasInset disabled:cursor-not-allowed disabled:opacity-40">
            <SendIcon />
          </button>
        </div>
      </div>
    </form>
  );
}

/* --------------------------- autonomy counter ----------------------------- */

function AutonomyCounter({ stats }: { stats: Stats | null }) {
  const human = stats?.human_filed ?? 0;
  const keeperFiled = stats?.keeper_filed ?? 0;
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-md border border-gh-borderMuted bg-white p-3 text-center">
        <p className="text-2xl font-semibold text-gh-fg">{human}</p>
        <p className="text-xs text-gh-fgMuted">filed by a human</p>
      </div>
      <div className="rounded-md border border-[#1F883D] bg-[#DAFBE1] p-3 text-center" style={{ boxShadow: "0 0 0 1px #1F883D" }}>
        <p className="text-2xl font-semibold text-[#1A7F37]">{keeperFiled}</p>
        <p className="text-xs text-[#1A7F37]">filed by Keeper</p>
      </div>
      <div className="rounded-md border border-gh-borderMuted bg-white p-3 text-center">
        <p className="text-2xl font-semibold text-gh-fg">{stats?.plans_revised ?? 0}</p>
        <p className="text-xs text-gh-fgMuted">plans self-revised</p>
      </div>
    </div>
  );
}

/* -------------------------------- feed card ------------------------------- */

function ProvenanceBadge({ provenance }: { provenance: string }) {
  const keeperFiled = provenance !== "human";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${keeperFiled ? "bg-[#8250DF] text-white" : "bg-[#1F883D] text-white"}`}>
      {keeperFiled ? "Keeper" : "human"}
    </span>
  );
}

function FeedRow({ issue }: { issue: IssueSummary }) {
  return (
    <Link
      to={`/issue/${issue.issue_id}`}
      className="flex items-start justify-between gap-3 rounded-md border border-gh-border bg-white p-3 hover:bg-gh-canvasInset"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <ProvenanceBadge provenance={issue.provenance} />
          <span className="text-xs text-gh-fgMuted">{issue.issue_id}</span>
          {issue.parent_issue && <span className="text-xs text-gh-fgMuted">· from {issue.parent_issue}</span>}
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-gh-fg">{issue.title}</p>
      </div>
      {issue.assignee && (
        <span className="shrink-0 rounded-full bg-gh-canvasInset px-2 py-0.5 text-xs text-gh-fgMuted">
          {issue.assignee.name} · {issue.assignee.context_score.toFixed(2)}
        </span>
      )}
    </Link>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function Index() {
  const stats = usePoll<Stats>(() => keeper.getStats(), 1500, []);
  const issues = usePoll<IssueSummary[]>(() => keeper.listIssues(), 1500, []);

  const sorted = [...(issues ?? [])].sort((a, b) => {
    const num = (id: string) => Number(id.replace(/\D+/g, "")) || 0;
    // keeper-filed first, then newest
    if ((a.provenance !== "human") !== (b.provenance !== "human")) return a.provenance !== "human" ? -1 : 1;
    return num(b.issue_id) - num(a.issue_id);
  });

  return (
    <main className="mx-auto w-full max-w-[820px] flex-1 px-4 pb-16 pt-6 sm:px-8">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gh-fg">Keeper</h1>
          <p className="text-sm text-gh-fgMuted">File one issue. Watch the loop recall, plan, route, and file its own next ones.</p>
        </div>

        <Composer />
        <AutonomyCounter stats={stats} />

        <div className="flex items-center justify-between pt-2">
          <h2 className="text-sm font-semibold text-gh-fg">Feed</h2>
          <span className="text-xs text-gh-fgMuted">{issues?.length ?? 0} issues · live</span>
        </div>

        <div className="flex flex-col gap-2">
          {(!issues || issues.length === 0) && (
            <p className="rounded-md border border-gh-borderMuted bg-white p-4 text-sm text-gh-fgMuted">
              No issues yet — file one above to start the loop.
            </p>
          )}
          {sorted.map((issue) => <FeedRow key={issue.issue_id} issue={issue} />)}
        </div>
      </div>
    </main>
  );
}
