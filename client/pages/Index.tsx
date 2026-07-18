import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { keeper } from "@/lib/keeper";
import { usePoll } from "@/lib/loop";
import type { IssueSummary, Stats } from "@shared/api";

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
      const body = rest.join("\n").trim() || title;
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
      className="flex items-center gap-2 rounded-md border border-gh-border bg-white px-3 py-2 focus-within:border-[#0969DA]"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={submitting}
        placeholder="Describe a bug — e.g. “Intermittent 500s on checkout”"
        className="w-full border-none bg-transparent text-sm text-gh-fg placeholder:text-gh-fgMuted focus:outline-none disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={!canSubmit}
        className="shrink-0 rounded-md bg-[#1F883D] px-3 py-1.5 text-sm font-semibold text-white enabled:hover:brightness-95 disabled:opacity-40"
      >
        File issue
      </button>
    </form>
  );
}

function IssueRow({ issue }: { issue: IssueSummary }) {
  const keeperFiled = issue.provenance !== "human";
  return (
    <Link to={`/issue/${issue.issue_id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gh-canvasInset">
      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${keeperFiled ? "bg-[#8250DF]" : "bg-[#1F883D]"}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gh-fg">{issue.title}</p>
        <p className="text-xs text-gh-fgMuted">
          {issue.issue_id} · {keeperFiled ? "filed by Keeper" : "opened by a human"}
          {issue.assignee ? ` · ${issue.assignee.name}` : ""}
        </p>
      </div>
      <span className="shrink-0 text-gh-fgMuted">›</span>
    </Link>
  );
}

export default function Index() {
  const stats = usePoll<Stats>(() => keeper.getStats(), 2000, []);
  const issues = usePoll<IssueSummary[]>(() => keeper.listIssues(), 2000, []);

  const sorted = [...(issues ?? [])].sort((a, b) => {
    const num = (id: string) => Number(id.replace(/\D+/g, "")) || 0;
    if ((a.provenance !== "human") !== (b.provenance !== "human")) return a.provenance !== "human" ? -1 : 1;
    return num(b.issue_id) - num(a.issue_id);
  });

  return (
    <main className="mx-auto w-full max-w-[860px] px-4 pb-16 pt-8 sm:px-6">
      <h1 className="text-xl font-semibold text-gh-fg">File one issue. Keeper runs the rest.</h1>
      <p className="mt-1 text-sm text-gh-fgMuted">
        It recalls prior art, routes to the true owner, plans, merges, and files its own next issues.
      </p>

      <div className="mt-5">
        <Composer />
      </div>

      <div className="mt-6 flex items-center justify-between border-b border-gh-border pb-2">
        <h2 className="text-sm font-semibold text-gh-fg">Issues</h2>
        <p className="text-xs text-gh-fgMuted">
          <span className="text-gh-fg">{stats?.human_filed ?? 0}</span> by humans ·{" "}
          <span className="font-semibold text-[#8250DF]">{stats?.keeper_filed ?? 0}</span> by Keeper
        </p>
      </div>

      <div className="divide-y divide-gh-border rounded-b-md">
        {(!issues || issues.length === 0) && (
          <p className="px-3 py-4 text-sm text-gh-fgMuted">No issues yet — file one above to start the loop.</p>
        )}
        {sorted.map((issue) => <IssueRow key={issue.issue_id} issue={issue} />)}
      </div>

      <nav className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-gh-border pt-4 text-sm">
        <Link to="/team" className="text-[#0969DA] hover:underline">Team &amp; delegation →</Link>
        <Link to="/people" className="text-[#0969DA] hover:underline">Contributors →</Link>
        <Link to="/events" className="text-[#0969DA] hover:underline">Activity log →</Link>
      </nav>
    </main>
  );
}
