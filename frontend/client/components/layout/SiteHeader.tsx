import { Link } from "react-router-dom";
import { SunIcon } from "@/components/agent-issue/icons";

export default function SiteHeader() {
  return (
    <header className="w-full min-w-0 border-b border-gh-border bg-gh-canvasInset">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-4 sm:px-8">
        <Link
          to="/"
          className="flex-1 truncate text-sm font-semibold text-gh-fg hover:opacity-80"
        >
          Harness Agent
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
