import { Link } from "react-router-dom";
import { keeper } from "@/lib/keeper";
import { usePoll } from "@/lib/loop";
import type { RepoMeta, RepoPerson } from "@shared/api";

function NexlaChip() {
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold align-middle"
      style={{ color: "#7C3AED", background: "#7C3AED14", boxShadow: "inset 0 0 0 1px #7C3AED33" }}>
      Nexla
    </span>
  );
}

export default function People() {
  const meta = usePoll<RepoMeta>(() => keeper.getRepoMeta(), 5000, []);
  const people = usePoll<RepoPerson[]>(() => keeper.getRepoPeople(), 5000, []);
  const ranked = [...(people ?? [])].sort((a, b) => b.contributions - a.contributions);
  const live = meta?.mode === "live-repo";

  return (
    <main className="mx-auto w-full max-w-[820px] px-4 pb-16 pt-6 sm:px-8">
      <Link to="/" className="text-sm text-[#0969DA] hover:underline">← Home</Link>
      <header className="mt-3">
        <h1 className="text-2xl font-semibold text-gh-fg">People &amp; ownership <NexlaChip /></h1>
        <p className="mt-1 text-sm text-gh-fgMuted">
          {live
            ? <>Real contributors to <a href={meta?.html_url} target="_blank" rel="noreferrer" className="font-semibold text-[#0969DA] hover:underline">{meta?.target}</a>, pulled live from GitHub.
              Keeper routes each issue to the person with real context here — ranked by real commit history, not a résumé.</>
            : "No live repo connected — start the backend to load real contributors (Nexla ownership Nexset)."}
        </p>
        {live && (
          <p className="mt-1 text-xs text-gh-fgMuted">
            {meta?.contributors} contributors · {meta?.commits} recent commits · dominant module <code className="rounded bg-gh-canvasInset px-1 py-0.5">{meta?.dominant_dir}</code>
          </p>
        )}
      </header>

      <div className="mt-5 flex flex-col gap-2">
        {ranked.length === 0 && (
          <p className="rounded-md border border-gh-borderMuted bg-white p-4 text-sm text-gh-fgMuted">Loading contributors…</p>
        )}
        {ranked.map((p, i) => (
          <div key={p.login} className="flex items-center gap-3 rounded-md border border-gh-border bg-white p-3">
            <span className="w-5 shrink-0 text-center text-xs font-semibold text-gh-fgMuted">{i + 1}</span>
            <img src={p.avatar_url} alt={p.login} width={36} height={36} className="h-9 w-9 shrink-0 rounded-full bg-gh-canvasInset" />
            <div className="min-w-0 flex-1">
              <a href={p.html_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-gh-fg hover:underline">{p.name}</a>
              <p className="text-xs text-gh-fgMuted">{p.contributions.toLocaleString()} commits · owns <code className="rounded bg-gh-canvasInset px-1">{p.module}</code></p>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gh-canvasInset">
                <div className="h-full rounded-full" style={{ width: `${Math.round(p.context_score * 100)}%`, background: "#7C3AED" }} />
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-[#7C3AED14] px-2 py-1 text-xs font-semibold" style={{ color: "#7C3AED" }}>
              {p.context_score.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
