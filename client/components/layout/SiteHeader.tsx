import { NavLink, Link } from "react-router-dom";
import { CompassLogo } from "@/components/CompassLogo";
import { keeper } from "@/lib/keeper";
import { usePoll } from "@/lib/loop";
import type { RepoMeta } from "@shared/api";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2.5 py-1 text-sm font-medium ${isActive ? "bg-white text-gh-fg shadow-[0_1px_1px_rgba(31,35,40,0.06)]" : "text-gh-fgMuted hover:text-gh-fg"}`;

export default function SiteHeader() {
  const meta = usePoll<RepoMeta>(() => keeper.getRepoMeta(), 10000, []);
  const live = meta?.mode === "live-repo";

  return (
    <header className="w-full min-w-0 border-b border-gh-border bg-gh-canvasInset">
      <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold text-gh-fg hover:opacity-80">
            <CompassLogo size={22} />
            Keeper
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navClass}>Home</NavLink>
            <NavLink to="/team" className={navClass}>Delegation</NavLink>
            <NavLink to="/people" className={navClass}>People</NavLink>
            <NavLink to="/events" className={navClass}>Events</NavLink>
          </nav>
        </div>
        {live && (
          <a
            href={meta?.html_url}
            target="_blank"
            rel="noreferrer"
            title={`Real data from ${meta?.target}`}
            className="flex items-center gap-1.5 rounded-full border border-[#1F883D] bg-white px-2.5 py-1 text-xs font-semibold text-[#1A7F37]"
          >
            <span className="h-2 w-2 rounded-full bg-[#1F883D]" />
            live: {meta?.target}
          </a>
        )}
      </div>
    </header>
  );
}
