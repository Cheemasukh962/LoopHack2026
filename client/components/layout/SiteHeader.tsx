import { Link } from "react-router-dom";
import { CompassLogo } from "@/components/CompassLogo";
import { keeper } from "@/lib/keeper";
import { usePoll } from "@/lib/loop";
import type { RepoMeta } from "@shared/api";

// Minimal, GitHub-clean header — no tabs. Navigation happens by clicking through the flow.
export default function SiteHeader() {
  const meta = usePoll<RepoMeta>(() => keeper.getRepoMeta(), 15000, []);
  const live = meta?.mode === "live-repo";
  return (
    <header className="w-full border-b border-gh-border bg-white">
      <div className="mx-auto flex w-full max-w-[860px] items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold text-gh-fg hover:opacity-80">
          <CompassLogo size={20} />
          Keeper
        </Link>
        {live && (
          <a href={meta?.html_url} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-gh-fgMuted hover:text-gh-fg" title={`Real data from ${meta?.target}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#1F883D]" />
            {meta?.target}
          </a>
        )}
      </div>
    </header>
  );
}
