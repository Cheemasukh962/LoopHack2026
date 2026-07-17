import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { FeedItem, User } from "@shared/api";
import { getFeed, getMe } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
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
  VerifiedBadgeIcon,
} from "@/components/home/icons";

function Sidebar() {
  const { data: user } = useQuery<User>({ queryKey: ["me"], queryFn: getMe });
  return (
    <aside className="w-full flex-shrink-0 border-b border-gh-borderMuted bg-white lg:w-[336px] lg:border-b-0 lg:border-r">
      <div className="flex flex-col items-start gap-6 p-4">
        <button
          type="button"
          className="flex items-center gap-2 rounded-md border border-transparent px-3 py-2 hover:bg-gh-canvasInset"
        >
          {user ? <Avatar src={user.avatar} alt={user.handle} size={20} /> : <Skeleton className="h-5 w-5 rounded-full" />}
          <span className="text-sm font-medium text-[#25292E]">{user?.handle ?? "…"}</span>
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
              {user?.githubConnected ? "Github connected" : "Connect Github"}
            </button>
            <button
              type="button"
              className="rounded-md border border-[rgba(31,35,40,0.15)] bg-[#1F883D] px-3 py-1.5 text-sm font-semibold text-white shadow-[0_1px_0_0_rgba(31,35,40,0.04)] hover:brightness-95"
            >
              {user?.resumeUploaded ? "Resume uploaded" : "Upload Resume"}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Composer() {
  return (
    <div className="w-full rounded-md border border-gh-borderMuted bg-white p-4 shadow-[0_1px_1px_rgba(31,35,40,0.04)]">
      <input
        type="text"
        placeholder="Ask anything or type @ to add context"
        className="w-full border-none bg-transparent text-base text-gh-fg placeholder:text-gh-fgMuted focus:outline-none"
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
          <button type="button" aria-label="Send" className="flex h-8 w-8 items-center justify-center rounded-md">
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
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

function FeedCard({ item }: { item: FeedItem }) {
  return (
    <article className="w-full rounded-md border border-gh-border bg-white p-2 shadow-[0_1px_1px_rgba(31,35,40,0.04),0_1px_2px_rgba(31,35,40,0.03)]">
      <div className="flex flex-col gap-2 px-2 py-1 sm:px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative flex-shrink-0">
              <Avatar src={item.actor.avatar} alt={item.actor.name} size={40} />
              {item.actor.verified && <VerifiedBadgeIcon className="absolute -bottom-0.5 -right-0.5" />}
            </div>
            <p className="text-sm">
              <span className="font-semibold text-gh-fg">{item.actor.name} is</span>{" "}
              <span className="text-gh-fgMuted">{item.action}</span>{" "}
              <Link to={`/issue/${item.issueRef.id}`} className="font-semibold text-gh-fg hover:underline">
                {item.issueRef.title}
              </Link>
            </p>
          </div>
          <button type="button" aria-label="More options" className="rounded-md p-1.5 hover:bg-black/5">
            <KebabIcon />
          </button>
        </div>
        <p className="pl-[52px] text-xs text-gh-fgMuted">{timeAgo(item.createdAtMs)}</p>

        <div className="pt-2">
          <Link to={`/issue/${item.id}`} className="text-xl font-semibold text-gh-fg hover:underline">
            {item.issueRef.title}
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <span className="flex items-center gap-1.5 rounded-full bg-[#8250DF] px-3 py-1 text-xs font-medium text-white shadow-[0_0_0_1px_#8250DF_inset]">
            <TagIcon />
            {item.status}
          </span>
        </div>

        <div className="mt-2 rounded-[3px] bg-gh-canvasInset p-4">
          <h3 className="border-b border-gh-borderMuted pb-1.5 text-[21px] font-semibold text-gh-fg">{item.headline}</h3>
          <p className="p-4 text-sm text-gh-fg">{item.excerpt}</p>
          <Link to={`/issue/${item.id}`} className="px-0 text-sm font-semibold text-gh-fg underline">
            Read more
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
              <span>{item.reactions}</span>
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gh-fgMuted">
            <CommentBubblesIcon />
            {item.comments} comments
          </div>
        </div>
      </div>
    </article>
  );
}

function FeedList() {
  const { data: items, isLoading, isError } = useQuery<FeedItem[]>({ queryKey: ["feed"], queryFn: getFeed });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-48 w-full rounded-md" />
        ))}
      </div>
    );
  }
  if (isError) {
    return <p className="rounded-md border border-gh-border bg-white p-4 text-sm text-gh-fgMuted">Couldn’t load the feed. Is the API server running?</p>;
  }
  if (!items || items.length === 0) {
    return <p className="rounded-md border border-gh-border bg-white p-4 text-sm text-gh-fgMuted">No activity yet.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <FeedCard key={item.id} item={item} />
      ))}
    </div>
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
          <FeedList />
          <button type="button" className="w-full rounded-md border border-gh-border bg-white py-2 text-sm font-semibold text-[#0969DA] hover:bg-gh-canvasInset">
            More
          </button>
        </div>
        <HomeFooter />
      </main>
    </div>
  );
}
