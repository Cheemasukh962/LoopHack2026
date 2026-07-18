import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { keeper, seedDemoIssue, DEMO_FEATURE_ID } from "@/lib/keeper";
import { KebabIcon, ReactionSmileyIcon } from "@/components/agent-issue/icons";
import { Avatar } from "@/components/agent-issue/Timeline";
import {
  AgentPeopleIcon,
  AskBubbleIcon,
  ChevronDownIcon,
  CommentBubblesIcon,
  FilterLinesIcon,
  OctocatIcon,
  PlanDocIcon,
  PlusIcon,
  RepoBookIcon,
  SendIcon,
  SyncIcon,
  TagIcon,
} from "@/components/home/icons";

const samuelAvatar = "https://api.builder.io/api/v1/image/assets/TEMP/15a001fa0d049362b83ad86d84c419cbf69c3ee1?width=40";

function Sidebar() {
  const navigate = useNavigate();
  return (
    <aside className="w-full flex-shrink-0 border-b border-gh-borderMuted bg-white lg:w-[336px] lg:border-b-0 lg:border-r">
      <div className="flex flex-col items-start gap-6 p-4">
        <button
          type="button"
          className="flex items-center gap-2 rounded-md border border-transparent px-3 py-2 hover:bg-gh-canvasInset"
        >
          <Avatar src={samuelAvatar} alt="samuelalake" size={20} />
          <span className="text-sm font-medium text-[#25292E]">samuelalake</span>
          <ChevronDownIcon />
        </button>
        <div className="flex w-full flex-col items-start gap-1 rounded-md bg-white p-2">
          <h2 className="text-xl font-semibold text-gh-fg">Welcome</h2>
          <p className="text-base leading-6 text-gh-fgMuted">
            Connect your github and resume to see suggested tasks and plans for you to execute
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-4">
            <button
              type="button"
              className="rounded-md border border-[rgba(31,35,40,0.15)] bg-[#1F883D] px-3 py-1.5 text-sm font-semibold text-white shadow-[0_1px_0_0_rgba(31,35,40,0.04)] hover:brightness-95"
            >
              Connect Github
            </button>
            <button
              type="button"
              onClick={() => navigate("/match")}
              className="rounded-md border border-[rgba(31,35,40,0.15)] bg-[#1F883D] px-3 py-1.5 text-sm font-semibold text-white shadow-[0_1px_0_0_rgba(31,35,40,0.04)] hover:brightness-95"
            >
              Upload Resume
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Composer() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = value.trim().length > 0 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // First line becomes the title, the rest becomes the body.
      const [title, ...rest] = value.trim().split("\n");
      const { issue_id } = await keeper.createIssue({
        title,
        body: rest.join("\n").trim(),
      });
      navigate(`/issue/${issue_id}`);
    } catch (err) {
      console.error("Failed to create issue", err);
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="w-full rounded-md border border-gh-borderMuted bg-white p-4 shadow-[0_1px_1px_rgba(31,35,40,0.04)]"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        disabled={submitting}
        placeholder="Ask anything or type @ to add context"
        className="w-full border-none bg-transparent text-base text-gh-fg placeholder:text-gh-fgMuted focus:outline-none disabled:opacity-60"
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className="flex items-center gap-1 rounded-md border border-gh-borderMuted px-3 py-1.5 text-sm font-medium text-[#25292E]">
          <AskBubbleIcon />
          Ask
          <ChevronDownIcon />
        </button>
        <button type="button" className="flex items-center gap-1 rounded-md border border-gh-borderMuted px-3 py-1.5 text-sm font-medium text-[#25292E]">
          <RepoBookIcon />
          All repositories
          <ChevronDownIcon />
        </button>
        <button type="button" aria-label="Add context" className="flex h-8 w-8 items-center justify-center rounded-md border border-[#D1D9E0] shadow-[0_1px_0_0_rgba(31,35,40,0.04)]">
          <PlusIcon />
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-gh-fg">
            Auto
            <ChevronDownIcon />
          </button>
          <button type="button" aria-label="Sync" className="flex h-8 w-8 items-center justify-center rounded-md">
            <SyncIcon />
          </button>
          <span className="mx-1 h-6 w-px bg-gh-border" aria-hidden />
          <button
            type="submit"
            aria-label="Send"
            disabled={!canSubmit}
            className="flex h-8 w-8 items-center justify-center rounded-md enabled:hover:bg-gh-canvasInset disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </form>
  );
}

function PillNav() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <button type="button" className="flex items-center gap-2 rounded-xl border border-gh-borderMuted bg-white px-3 py-2 text-sm text-gh-fg shadow-[0_1px_1px_rgba(31,35,40,0.06)]">
        <AgentPeopleIcon />
        Agent
      </button>
      <button type="button" className="flex h-10 items-center gap-2 rounded-xl border border-gh-borderMuted bg-white px-4 text-sm text-gh-fg">
        <PlanDocIcon />
        Plan a session
        <ChevronDownIcon />
      </button>
    </div>
  );
}

// A feature request Keeper has already built, assigned to you to review.
// This is the reviewer entry point — clicking through opens the issue at the
// "Start human review" state.
function FeedCard() {
  const to = `/issue/${DEMO_FEATURE_ID}`;
  return (
    <article className="w-full rounded-md border border-gh-border bg-white p-2 shadow-[0_1px_1px_rgba(31,35,40,0.04),0_1px_2px_rgba(31,35,40,0.03)]">
      <div className="flex flex-col gap-2 px-2 py-1 sm:px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Avatar src={samuelAvatar} alt="samuelalake" size={40} />
            <p className="text-sm">
              <span className="font-semibold text-gh-fg">Compass</span>{" "}
              <span className="text-gh-fgMuted">assigned</span>{" "}
              <span className="font-semibold text-gh-fg">you</span>{" "}
              <span className="text-gh-fgMuted">to review a feature request</span>
            </p>
          </div>
          <button type="button" aria-label="More options" className="rounded-md p-1.5 hover:bg-black/5">
            <KebabIcon />
          </button>
        </div>
        <p className="pl-[52px] text-xs text-gh-fgMuted">2 hours ago</p>

        <div className="pt-2">
          <Link to={to} className="text-xl font-semibold text-gh-fg hover:underline">
            Add CSV export to the analytics dashboard
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <span className="flex items-center gap-1.5 rounded-full bg-[#0969DA] px-3 py-1 text-xs font-medium text-white shadow-[0_0_0_1px_#0969DA_inset]">
            <TagIcon />
            Needs your review
          </span>
          <span className="text-xs text-gh-fgMuted">Requested by priyacodes · built by Compass</span>
        </div>

        <div className="mt-2 rounded-[3px] bg-gh-canvasInset p-4">
          <p className="text-sm text-gh-fg">
            As an analyst, I want to export the current dashboard view to CSV so I can share numbers with teammates who
            don't use the tool. The export should respect the active filters.
          </p>
          <Link to={to} className="mt-3 inline-block text-sm font-semibold text-[#0969DA] hover:underline">
            Start review →
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Add or remove reactions"
              className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-gh-borderMuted bg-gh-canvasInset"
            >
              <ReactionSmileyIcon />
            </button>
            <button type="button" className="flex h-[26px] items-center gap-1.5 rounded-full border border-gh-border px-2 text-xs text-gh-fgMuted">
              <span>👍</span>
              <span>2</span>
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gh-fgMuted">
            <CommentBubblesIcon />
            3 comments
          </div>
        </div>
      </div>
    </article>
  );
}

function HomeFooter() {
  const links = ["Terms", "Privacy", "Security", "Status", "Community", "Docs", "Contact", "Manage cookies"];
  return (
    <footer className="flex flex-col items-center gap-3 py-10 text-xs text-gh-fgMuted">
      <div className="flex items-center gap-2">
        <OctocatIcon />
        <span>© 2026 GitHub, Inc.</span>
      </div>
      <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 text-center">
        {links.map((label) => (
          <button key={label} type="button" className="hover:underline">
            {label}
          </button>
        ))}
      </nav>
    </footer>
  );
}

export default function Index() {
  // Ensure the review-ready feature exists so the feed card opens straight onto it.
  useEffect(() => {
    seedDemoIssue();
  }, []);

  return (
    <div className="flex w-full flex-col lg:flex-row">
      <Sidebar />
      <main className="mx-auto w-full max-w-[900px] flex-1 px-4 pb-4 pt-4 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold text-gh-fg">Home</h1>
          <Composer />
          <PillNav />
          <div className="flex items-center justify-between pt-2">
            <h2 className="text-sm font-semibold text-gh-fg">Feed</h2>
            <button type="button" className="flex items-center gap-1.5 rounded-md border border-[#D1D9E0] bg-[#F6F8FA] px-3 py-1.5 text-sm font-medium text-[#25292E]">
              <FilterLinesIcon />
              Filter
            </button>
          </div>
          <FeedCard />
          <button type="button" className="w-full rounded-md border border-gh-border bg-white py-2 text-sm font-semibold text-[#0969DA] hover:bg-gh-canvasInset">
            More
          </button>
        </div>
        <HomeFooter />
      </main>
    </div>
  );
}
