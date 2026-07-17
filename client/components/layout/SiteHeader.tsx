import { Link } from "react-router-dom";
import { SunIcon } from "@/components/agent-issue/icons";
import { CompassLogo } from "@/components/CompassLogo";

export default function SiteHeader() {
  return (
    <header className="w-full min-w-0 border-b border-gh-border bg-gh-canvasInset">
      <div className="flex w-full flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm font-semibold text-gh-fg hover:opacity-80"
        >
          <CompassLogo size={24} />
          Compass
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Toggle appearance"
            className="flex flex-col items-center rounded-md border border-[#D1D9E0] bg-[#F6F8FA] p-2 shadow-[0_1px_0_0_rgba(31,35,40,0.04)] transition-colors hover:bg-gh-canvasInset"
          >
            <SunIcon />
          </button>
        </div>
      </div>
    </header>
  );
}
