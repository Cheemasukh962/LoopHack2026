import { useState } from "react";
import { Link } from "react-router-dom";
import { keeper } from "@/lib/keeper";
import { describe, usePoll, SPONSOR_META, type Sponsor } from "@/lib/loop";
import type { LoopEvent } from "@shared/api";

type Filter = "all" | "nexla" | "pomerium" | "zero";

function Chip({ sponsor }: { sponsor: Exclude<Sponsor, null> }) {
  const m = SPONSOR_META[sponsor];
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold align-middle"
      style={{ color: m.color, background: `${m.color}14`, boxShadow: `inset 0 0 0 1px ${m.color}33` }}>
      {m.label}
    </span>
  );
}

export default function Events() {
  const [filter, setFilter] = useState<Filter>("all");
  const events = usePoll<LoopEvent[]>(() => keeper.getAllEvents(), 1200, []);

  const items = (events ?? [])
    .map((e) => ({ e, item: describe(e) }))
    .filter((x): x is { e: LoopEvent; item: NonNullable<ReturnType<typeof describe>> } => Boolean(x.item))
    .reverse();

  const shown = items.filter(({ item }) => (filter === "all" ? true : item.sponsor === filter));

  const counts = {
    nexla: items.filter((x) => x.item.sponsor === "nexla").length,
    pomerium: items.filter((x) => x.item.sponsor === "pomerium").length,
    zero: items.filter((x) => x.item.sponsor === "zero").length,
  };

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: `All (${items.length})` },
    { key: "nexla", label: `Nexla (${counts.nexla})` },
    { key: "pomerium", label: `Pomerium (${counts.pomerium})` },
    { key: "zero", label: `Zero (${counts.zero})` },
  ];

  return (
    <main className="mx-auto w-full max-w-[820px] px-4 pb-16 pt-6 sm:px-8">
      <Link to="/" className="text-sm text-[#0969DA] hover:underline">← Home</Link>
      <header className="mt-3">
        <h1 className="text-2xl font-semibold text-gh-fg">Event &amp; audit log</h1>
        <p className="mt-1 text-sm text-gh-fgMuted">Every event on the bus, live — including the Pomerium allow/deny audit, Zero tool discoveries, and Keeper's self-filed issues.</p>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === t.key ? "bg-gh-fg text-white" : "border border-gh-border bg-white text-gh-fg hover:bg-gh-canvasInset"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-md border border-gh-borderMuted bg-white">
        <ol className="divide-y divide-gh-borderMuted">
          {shown.length === 0 && <li className="px-4 py-3 text-sm text-gh-fgMuted">No events yet — file an issue on the Home page.</li>}
          {shown.map(({ e, item }) => (
            <li key={e.event_id} className="flex items-start gap-3 px-4 py-2.5">
              <code className="mt-0.5 shrink-0 rounded bg-gh-canvasInset px-1.5 py-0.5 text-[11px] text-gh-fgMuted">{item.type}</code>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gh-fg">
                  {item.title}
                  {item.sponsor && <Chip sponsor={item.sponsor} />}
                </p>
                {item.detail && <p className="truncate text-xs text-gh-fgMuted" title={item.detail}>{item.detail}</p>}
              </div>
              <Link to={`/issue/${e.issue_id}`} className="shrink-0 text-xs text-[#0969DA] hover:underline">{e.issue_id}</Link>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
