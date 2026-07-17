import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircleGreenIcon } from "@/components/agent-issue/icons";
import { Avatar } from "@/components/agent-issue/Timeline";
import { CompassLogo } from "@/components/CompassLogo";
import { InlineCode } from "@/components/agent-issue/CommentCard";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { keeper } from "@/lib/keeper";
import { getRun, setRun } from "@/lib/run-state";
import type { IssueDetail } from "@shared/api";

const samuelAvatar = "https://api.builder.io/api/v1/image/assets/TEMP/15a001fa0d049362b83ad86d84c419cbf69c3ee1?width=40";

type Role = "plan" | "user" | "agent";
interface Code {
  lang: string;
  content: string;
}
interface ChatMsg {
  id: number;
  role: Role;
  text: ReactNode;
  code?: Code;
  suggestions?: string[];
  plan?: { files: string[]; steps: string[] }; // triggers the truncated plan renderer
}

const IMPL_DIFF: Code = {
  lang: "diff",
  content: "- cache.set(key, profile)\n+ if (profile.version > (cache.get(key)?.version ?? -1))\n+   cache.set(key, profile)\n+ bus.emit(\"cache.invalidated\", { key })",
};

const AGENT_REPLIES: { text: string; code?: Code }[] = [
  {
    text: "Good call. I tightened the guard to also cover the first write when nothing is cached yet.",
    code: { lang: "diff", content: "- if (profile.version > (cache.get(key)?.version ?? -1))\n+ const cached = cache.get(key)\n+ if (!cached || profile.version > cached.version)" },
  },
  { text: "Updated. I also added an invalidation metric so this is observable in prod." },
  { text: "Done — re-ran the suite, still green. Anything else before you approve?" },
];

/* ------------------------------ tool marks ------------------------------ */
// Lightweight placeholder marks for the handoff targets (not official logos).
function ClaudeMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <g stroke="#D97757" strokeWidth="2.2" strokeLinecap="round">
        <line x1="12" y1="4" x2="12" y2="20" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="6.3" y1="6.3" x2="17.7" y2="17.7" />
        <line x1="17.7" y1="6.3" x2="6.3" y2="17.7" />
      </g>
    </svg>
  );
}
function CodexMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M12 3l7 4v10l-7 4-7-4V7z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}
function PreviewMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16.5V20" strokeLinecap="round" />
    </svg>
  );
}

function CodeBlock({ code }: { code: Code }) {
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-gh-border bg-[#0D1117]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1">
        <span className="font-mono text-[11px] uppercase tracking-wide text-white/50">{code.lang}</span>
      </div>
      <pre className="overflow-x-auto px-3 py-2 text-[12px] leading-5">
        <code className="font-mono">
          {code.content.split("\n").map((line, i) => {
            const color = line.startsWith("+") ? "text-[#3FB950]" : line.startsWith("-") ? "text-[#F85149]" : "text-[#C9D1D9]";
            return (
              <div key={i} className={color}>
                {line || " "}
              </div>
            );
          })}
        </code>
      </pre>
    </div>
  );
}

// The plan carried over from the issue page — truncated with Show full plan.
function PlanMessage({ text, files, steps }: { text: string; files: string[]; steps: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-sm text-gh-fg">
      <p>{text}</p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 text-sm font-semibold text-[#0969DA] hover:underline">
          Show full plan
        </button>
      ) : (
        <div className="mt-2 space-y-3">
          <ul className="ml-4 list-disc space-y-1 text-gh-fg">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f) => (
                <InlineCode key={f}>{f}</InlineCode>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-[#0969DA] hover:underline">
            Show less
          </button>
        </div>
      )}
    </div>
  );
}

function ChatBubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";
  const label = isUser ? "samuelalake" : msg.role === "plan" ? "Compass · plan" : "Agent";
  return (
    <div className="flex items-start gap-3">
      {isUser ? <Avatar src={samuelAvatar} alt={label} size={28} rounded="full" /> : <CompassLogo size={28} rounded="md" />}
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-xs font-semibold text-gh-fg">{label}</span>
          {msg.role === "plan" && <span className="rounded-full bg-[#8250DF]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#8250DF]">plan</span>}
        </div>
        <div className={"rounded-md border p-3 text-sm text-gh-fg " + (isUser ? "border-gh-border bg-gh-canvasInset" : "border-gh-border bg-white")}>
          {msg.plan ? <PlanMessage text={typeof msg.text === "string" ? msg.text : ""} files={msg.plan.files} steps={msg.plan.steps} /> : <div className="whitespace-pre-wrap">{msg.text}</div>}
          {msg.code && <CodeBlock code={msg.code} />}
          {msg.suggestions && (
            <ul className="mt-2 space-y-1">
              {msg.suggestions.map((s) => (
                <li key={s} className="flex items-start gap-2 text-sm text-gh-fgMuted">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#0969DA]" />
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolButton({ label, mark, hint, emphasis = false }: { label: string; mark: ReactNode; hint: string; emphasis?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={
            "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium text-gh-fg " +
            (emphasis ? "border-gh-fg/30 bg-gh-canvasInset font-semibold hover:bg-gh-border" : "border-gh-border bg-white hover:bg-gh-canvasInset")
          }
        >
          {mark}
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

export default function ReviewIssue() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<IssueDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const nextId = useRef(2);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    if (!id) {
      setStatus("missing");
      return;
    }
    keeper.getIssue(id).then((d) => {
      if (!active) return;
      setDetail(d);
      setStatus(d ? "ready" : "missing");
      if (d) {
        const files = d.plan?.file_boundary ?? ["shared/api.ts"];
        setMessages([
          {
            id: 0,
            role: "plan",
            text: d.plan?.root_cause_hypothesis ?? "Scoped the request into a plan.",
            plan: {
              files,
              steps: [
                "Reproduce the reported behavior behind a failing test.",
                "Apply the minimal fix within the file boundary.",
                "Add regression coverage, then update the changelog.",
              ],
            },
          },
          {
            id: 1,
            role: "agent",
            text: "I implemented this and generated base code for you to build on. Here's the diff for review:",
            code: IMPL_DIFF,
          },
        ]);
      }
    });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing]);

  function push(msg: Omit<ChatMsg, "id">) {
    setMessages((m) => [...m, { ...msg, id: nextId.current++ }]);
  }

  function send() {
    const text = input.trim();
    if (!text || typing) return;
    setInput("");
    push({ role: "user", text });
    const replyIndex = messages.filter((m) => m.role === "agent").length % AGENT_REPLIES.length;
    setTyping(true);
    window.setTimeout(() => {
      const reply = AGENT_REPLIES[replyIndex];
      push({ role: "agent", text: reply.text, code: reply.code });
      setTyping(false);
    }, 900);
  }

  function approve() {
    if (!id) return;
    setRun(id, { reviewDone: true });
    navigate(`/issue/${id}`);
  }

  function requestChanges() {
    if (!id) return;
    const prev = getRun(id);
    // Send it back to the top of the loop: re-plan and re-implement.
    setRun(id, { planningDone: false, implementationDone: false, reviewDone: false, planVersion: prev.planVersion + 1 });
    navigate(`/issue/${id}`);
  }

  if (status === "loading") {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 pb-12 pt-6 sm:px-8">
        <div className="h-8 w-64 animate-pulse rounded bg-gh-canvasInset" />
      </main>
    );
  }

  if (status === "missing" || !detail) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 pb-12 pt-6 sm:px-8">
        <h1 className="text-2xl font-semibold text-gh-fg">Issue not found</h1>
        <Link to="/" className="mt-2 inline-block text-sm font-semibold text-[#0969DA] hover:underline">
          Back home
        </Link>
      </main>
    );
  }

  const { issue, plan } = detail;
  const files = plan?.file_boundary ?? ["shared/api.ts"];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-8">
      <Link to={`/issue/${id}`} className="text-sm text-gh-fgMuted hover:underline">
        ← Back to issue
      </Link>
      <div className="mb-5 mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#0969DA]">Human review</p>
        <h1 className="mt-1 text-2xl font-semibold text-gh-fg sm:text-3xl">{issue.title}</h1>
        <p className="text-xs text-gh-fgMuted">Review Compass's plan and generated code. Approve, or send it back with changes.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Chat column */}
        <div className="flex min-w-0 flex-col rounded-md border border-gh-border bg-gh-canvasInset">
          <div className="flex-1 space-y-4 overflow-y-auto p-4" style={{ maxHeight: "58vh" }}>
            {messages.map((m) => (
              <ChatBubble key={m.id} msg={m} />
            ))}
            {typing && (
              <div className="flex items-center gap-3 pl-10 text-sm text-gh-fgMuted">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-gh-border border-t-[#1F883D]" />
                Agent is working…
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Review the change — preview locally, or continue in your own tool */}
          <div className="flex flex-wrap items-center gap-2 border-t border-gh-border px-4 py-2">
            <span className="text-xs text-gh-fgMuted">Review the change:</span>
            <ToolButton label="Preview changes locally" mark={<PreviewMark />} hint="Check out the branch and run it on your machine (coming soon)" emphasis />
            <ToolButton label="Open in Claude Code" mark={<ClaudeMark />} hint="Carry this session into Claude Code (coming soon)" />
            <ToolButton label="Open in Codex" mark={<CodexMark />} hint="Carry this session into Codex (coming soon)" />
          </div>

          {/* Composer + review actions */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="border-t border-gh-border bg-white p-3"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder="Tell the agent what to change…"
              className="w-full resize-none border-none bg-transparent text-sm text-gh-fg placeholder:text-gh-fgMuted focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <button
                type="submit"
                disabled={!input.trim() || typing}
                className="rounded-md border border-gh-border px-3 py-1.5 text-sm font-medium text-gh-fg enabled:hover:bg-gh-canvasInset disabled:opacity-40"
              >
                Send
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={requestChanges}
                  className="rounded-md border border-gh-border px-3 py-1.5 text-sm font-medium text-[#9A6700] hover:bg-[#9A6700]/5"
                >
                  Request changes
                </button>
                <button
                  type="button"
                  onClick={approve}
                  className="rounded-md border border-[rgba(31,35,40,0.15)] bg-[#1F883D] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-95"
                >
                  Approve &amp; merge
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Changes column */}
        <aside className="space-y-4">
          <div className="rounded-md border border-gh-border bg-white">
            <div className="flex items-center justify-between border-b border-gh-border px-3 py-2">
              <h2 className="text-sm font-semibold text-gh-fg">Changes</h2>
              <span className="rounded-full bg-[#1F883D]/10 px-2 py-0.5 text-[11px] font-medium text-[#1F883D]">Committed by AI</span>
            </div>
            <div className="p-3">
              <p className="mb-2 text-xs font-semibold text-gh-fgMuted">
                {files.length} file{files.length === 1 ? "" : "s"} in boundary
              </p>
              <ul className="space-y-1">
                {files.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs">
                    <span className="text-[#1F883D]">+</span>
                    <span className="truncate font-mono text-gh-fg">{f}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-gh-fgMuted">
                <CheckCircleGreenIcon className="h-3.5 w-3.5" /> Committed to compass/{(id ?? "").slice(0, 8)}
              </p>
            </div>
          </div>

          <div className="rounded-md border border-dashed border-gh-border bg-white p-3 text-xs text-gh-fgMuted">
            Compass planned and wrote the base code. Continue building in your own tool with the handoff buttons, or approve
            to merge as-is.
          </div>
        </aside>
      </div>
    </main>
  );
}
