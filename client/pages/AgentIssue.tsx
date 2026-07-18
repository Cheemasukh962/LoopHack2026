import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangleIcon,
  CheckCircleGreenIcon,
  CheckIcon,
  ChevronCollapseIcon,
  MergeBlockedIcon,
  PendingDotIcon,
} from "@/components/agent-issue/icons";
import { Avatar } from "@/components/agent-issue/Timeline";
import { CompassLogo } from "@/components/CompassLogo";
import { AgentTimeline, type AgentAction } from "@/components/agent-issue/AgentTimeline";
import { Badge, CommentCard, InlineCode } from "@/components/agent-issue/CommentCard";
import { keeper, seedDemoIssue, DEMO_FEATURE_ID } from "@/lib/keeper";
import { timeAgo } from "@/lib/utils";
import {
  getRun,
  setRun,
  PLANNING_STEPS,
  IMPLEMENTATION_STEPS,
  STEP_MS,
  type PhaseStep,
  type RunProgress,
} from "@/lib/run-state";
import type { IssueDetail } from "@shared/api";

const madeByOz = "https://api.builder.io/api/v1/image/assets/TEMP/90a99dd6e925502c62c330bbc0aeb14c37a274db?width=80";
const samuelAvatar = "https://api.builder.io/api/v1/image/assets/TEMP/15a001fa0d049362b83ad86d84c419cbf69c3ee1?width=40";
const checkIcon = "https://api.builder.io/api/v1/image/assets/TEMP/b7181c122d914fe5de0b8c84cea316aff699540a?width=40";

type PhaseStatus = "waiting" | "working" | "awaiting_human" | "done" | "locked" | "stopped";
type RunPhase = "planning" | "implementation";
const PHASE_STEPS: Record<RunPhase, PhaseStep[]> = { planning: PLANNING_STEPS, implementation: IMPLEMENTATION_STEPS };

/* ------------------------------ intake Q&A ------------------------------ */

const INTAKE_QUESTIONS = [
  { q: "What kind of change is this?", options: ["Bug fix", "New feature", "Refactor"] },
  { q: "Where does it mainly apply?", options: ["Frontend", "Backend", "Both"] },
  { q: "How urgent is it?", options: ["Ship now", "This sprint", "Backlog"] },
];

function genDescription(title: string, answers: string[]): string {
  const [kind, area, urgency] = answers;
  return `${title}. This is a ${kind?.toLowerCase()} affecting the ${area?.toLowerCase()} surface, prioritized as "${urgency}". Compass will scope it to the smallest safe file boundary, back it with a regression test, and open it for human review before merge.`;
}

// The Description block of the kickoff card: an AI multiple-choice intake that
// writes a proper description once answered.
function DescriptionIntake({ title, onComplete }: { title: string; onComplete: (d: string) => void }) {
  const [answers, setAnswers] = useState<string[]>([]);
  const [writing, setWriting] = useState(false);
  const i = answers.length;

  useEffect(() => {
    if (i === INTAKE_QUESTIONS.length && !writing) {
      setWriting(true);
      const t = setTimeout(() => onComplete(genDescription(title, answers)), 1100);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  // Once every question is answered, show the writing state (guards against
  // rendering before the effect flips `writing`).
  if (writing || i >= INTAKE_QUESTIONS.length) {
    return (
      <div className="flex items-center gap-2 text-sm text-gh-fgMuted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-gh-border border-t-[#1F883D]" />
        Writing a clear description…
      </div>
    );
  }

  const cur = INTAKE_QUESTIONS[i];
  return (
    <div>
      <p className="text-sm text-gh-fgMuted">A couple of quick questions so I can scope this well:</p>
      <div className="mt-3">
        <p className="text-sm font-medium text-gh-fg">{cur.q}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {cur.options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setAnswers((a) => [...a, o])}
              className="rounded-full border border-gh-border px-3 py-1 text-sm text-gh-fg hover:bg-gh-canvasInset"
            >
              {o}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-gh-fgMuted">
          Question {i + 1} of {INTAKE_QUESTIONS.length}
        </p>
      </div>
      {answers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {answers.map((a, idx) => (
            <span key={idx} className="rounded-full bg-gh-canvasInset px-2 py-0.5 text-xs text-gh-fgMuted">
              {a}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// The written description, truncated with a Show full description toggle so it
// reads as "there's more here" — matching the Show full plan pattern.
function DescriptionText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p
        className="whitespace-pre-wrap text-sm text-gh-fg"
        style={open ? undefined : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
      >
        {text}
      </p>
      <button type="button" onClick={() => setOpen(!open)} className="mt-1 text-sm font-semibold text-[#0969DA] hover:underline">
        {open ? "Show less" : "Show full description"}
      </button>
    </div>
  );
}

/* --------------------------- small presentational --------------------------- */

function AssigneeBadge({
  name,
  avatar,
  state,
  onAccept,
}: {
  name: string;
  avatar?: string;
  state: "assigned" | "suggested";
  onAccept?: () => void;
}) {
  if (state === "assigned") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gh-canvasInset px-2 py-0.5 text-xs font-medium text-gh-fg ring-1 ring-inset ring-gh-border">
        {avatar && <Avatar src={avatar} alt={name} size={16} />}
        {name}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-gh-border px-2 py-0.5 text-xs font-medium text-gh-fgMuted">
        {avatar && <Avatar src={avatar} alt={name} size={16} />}
        {name}
        <span className="text-[9px] font-semibold uppercase tracking-wide opacity-70">suggested</span>
      </span>
      {onAccept && (
        <button
          type="button"
          onClick={onAccept}
          aria-label={`Accept ${name}`}
          className="flex h-5 w-5 items-center justify-center rounded-full border border-gh-border text-gh-fg hover:bg-gh-canvasInset"
        >
          <CheckIcon className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function AssigneeRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-bold text-gh-fgMuted">{label}</span>
      {children}
    </div>
  );
}

function PhaseChip({ status }: { status: PhaseStatus }) {
  const map: Record<PhaseStatus, { text: string; className: string; dot: string }> = {
    waiting: { text: "Queued", className: "text-gh-fgMuted bg-gh-canvasInset", dot: "bg-gh-fgMuted" },
    working: { text: "Working", className: "text-[#1F883D] bg-[#1F883D]/10", dot: "bg-[#1F883D] animate-pulse" },
    awaiting_human: { text: "Your turn", className: "text-[#0969DA] bg-[#0969DA]/10", dot: "bg-[#0969DA]" },
    done: { text: "Done", className: "text-[#1F883D] bg-[#1F883D]/10", dot: "bg-[#1F883D]" },
    locked: { text: "Locked", className: "text-gh-fgMuted bg-gh-canvasInset", dot: "bg-gh-fgMuted" },
    stopped: { text: "Stopped", className: "text-[#9A6700] bg-[#9A6700]/10", dot: "bg-[#9A6700]" },
  };
  const s = map[status];
  return (
    <span className={"inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium " + s.className}>
      <span className={"h-1.5 w-1.5 rounded-full " + s.dot} />
      {s.text}
    </span>
  );
}

function WorkingIndicator({ steps, step }: { steps: PhaseStep[]; step: number }) {
  const idx = Math.min(step, steps.length - 1);
  const pct = Math.round(((idx + 1) / steps.length) * 100);
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-gh-border border-t-[#1F883D]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-gh-fg">{steps[idx].label}</span>
          <span className="font-mono text-xs text-gh-fgMuted">
            {idx + 1}/{steps.length}
          </span>
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gh-borderMuted">
          <div className="h-full rounded-full bg-[#1F883D] transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function PlanBody({ plan }: { plan: IssueDetail["plan"] }) {
  const [open, setOpen] = useState(false);
  const approach = plan?.approach ?? plan?.root_cause_hypothesis ?? "Scoped the request into a development plan.";
  const criteria = plan?.acceptance_criteria ?? [];
  const subtasks = plan?.subtasks ?? [];
  const blast = plan?.blast_radius;
  const testStrategy = plan?.test_strategy;
  const files = plan?.file_boundary ?? [];

  return (
    <div className="text-sm text-gh-fg">
      <p>{approach}</p>

      {/* calm summary of the spec — always visible */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gh-fgMuted">
        {criteria.length > 0 && <span>✓ {criteria.length} acceptance criteria</span>}
        {subtasks.length > 0 && <span>• {subtasks.length} subtasks</span>}
        {files.length > 0 && <span>⌖ {files.length} files in scope</span>}
      </div>

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-1.5 text-sm font-semibold text-[#0969DA] hover:underline">
          Show full spec
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          {criteria.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-gh-fgMuted">Acceptance criteria</div>
              <ul className="space-y-1">
                {criteria.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span className="mt-px text-[#1F883D]">✓</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {subtasks.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-gh-fgMuted">Subtasks</div>
              <ol className="ml-4 list-decimal space-y-1">
                {subtasks.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
          )}
          {(blast || testStrategy) && (
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {blast && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-gh-fgMuted">Blast radius</div>
                  <p>{blast.call_sites} call sites · {blast.services_affected} service{blast.services_affected === 1 ? "" : "s"}</p>
                </div>
              )}
              {testStrategy && (
                <div className="min-w-[220px] flex-1">
                  <div className="mb-1 text-xs font-semibold text-gh-fgMuted">Test strategy</div>
                  <p>{testStrategy}</p>
                </div>
              )}
            </div>
          )}
          {files.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-gh-fgMuted">File boundary</div>
              <div className="flex flex-wrap gap-1.5">
                {files.map((f) => (
                  <InlineCode key={f}>{f}</InlineCode>
                ))}
              </div>
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

function PhaseSection({
  title,
  status,
  assignee,
  action,
  children,
}: {
  title: string;
  status: PhaseStatus;
  assignee?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const dim = status === "waiting" || status === "locked";
  return (
    <section className={dim ? "opacity-60" : undefined}>
      <div className="flex items-center gap-2">
        <h3 className="text-[18px] font-semibold leading-6 tracking-[-0.02em] text-gh-fg">{title}</h3>
        <PhaseChip status={status} />
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="mt-2 rounded-md border border-gh-border bg-white p-3 shadow-[0_1px_1px_rgba(37,41,46,0.1),0_3px_6px_rgba(37,41,46,0.12)]">
        {assignee}
        <div className={assignee ? "mt-2" : undefined}>{children}</div>
      </div>
    </section>
  );
}

/* ------------------------------- lifecycle card ------------------------------- */

// A small proven-owner bench Keeper re-delegates to when a verification fails.
const REASSIGN_TEAM = [
  { name: "Dana Ibrahim", skills: "distributed systems, reliability, incident response", commits: 428 },
  { name: "Marco Chen", skills: "security, authentication, OAuth", commits: 311 },
  { name: "Priya Nair", skills: "Terraform, AWS, SRE", commits: 276 },
];
function pickReassignee(current: string) {
  const cand = REASSIGN_TEAM.filter((p) => p.name !== current).sort((a, b) => b.commits - a.commits)[0] ?? REASSIGN_TEAM[0];
  return {
    name: cand.name,
    why: `${current}'s change failed verification, so Keeper re-delegated to the proven owner — ${cand.name} has the strongest recent context here (${cand.skills}; ${cand.commits} commits).`,
  };
}

function LifecycleCard({
  plan,
  progress,
  running,
  onStop,
  onResume,
  onReview,
}: {
  plan: IssueDetail["plan"];
  progress: RunProgress;
  running: { phase: RunPhase; step: number } | null;
  onStop: () => void;
  onResume: () => void;
  onReview: () => void;
}) {
  const reviewerName = plan?.assignee?.name ?? "samuelalake";
  const [verify, setVerify] = useState<"pass" | "fail">("pass");
  const taskTitle = plan?.root_cause_hypothesis?.match(/"([^"]+)"/)?.[1] ?? "this change";
  const reassign = pickReassignee(reviewerName);

  const planningStatus: PhaseStatus = progress.planningDone
    ? "done"
    : running?.phase === "planning"
      ? "working"
      : progress.stopped
        ? "stopped"
        : "waiting";

  const implementationStatus: PhaseStatus = progress.implementationDone
    ? "done"
    : !progress.planningDone
      ? "locked"
      : running?.phase === "implementation"
        ? "working"
        : progress.stopped
          ? "stopped"
          : "waiting";

  const reviewStatus: PhaseStatus = progress.reviewDone
    ? "done"
    : !progress.implementationDone
      ? "locked"
      : "awaiting_human";

  const anyRunning = running !== null;

  return (
    <CommentCard
      author="Compass"
      action="is running the task through its lifecycle"
      badges={<Badge>Bot</Badge>}
      headerRight={
        anyRunning ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center gap-1.5 rounded-md border border-gh-border px-2.5 py-1 text-xs font-medium text-[#CF222E] hover:bg-[#CF222E]/5"
          >
            <span className="h-2.5 w-2.5 rounded-[2px] bg-[#CF222E]" />
            Stop
          </button>
        ) : (
          <Badge>Contributor</Badge>
        )
      }
      showReaction
    >
      <div className="space-y-4">
        {/* Planning — autonomous */}
        <PhaseSection title="Planning" status={planningStatus}>
          {planningStatus === "working" && running ? (
            <WorkingIndicator steps={PLANNING_STEPS} step={running.step} />
          ) : planningStatus === "done" ? (
            <PlanBody plan={plan} />
          ) : planningStatus === "stopped" ? (
            <StoppedRow onResume={onResume} />
          ) : (
            <span className="text-sm text-gh-fgMuted">Queued…</span>
          )}
        </PhaseSection>

        {/* Development — AI writes the change on the branch, then verifies it */}
        <PhaseSection title="Development" status={implementationStatus}>
          {implementationStatus === "working" && running ? (
            <WorkingIndicator steps={IMPLEMENTATION_STEPS} step={running.step} />
          ) : implementationStatus === "stopped" ? (
            <StoppedRow onResume={onResume} />
          ) : implementationStatus === "locked" || implementationStatus === "waiting" ? (
            <span className="text-sm text-gh-fgMuted">Queued after planning…</span>
          ) : verify === "pass" ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <StepDot done label="Development" tag="AI wrote the change on the branch (we assume the assignee pushed it)" />
                <div className="ml-[5px] h-6 w-0.5 bg-[#1F883D]" />
                <StepDot done label="Verification" tag="AI checked the change — tests generated and passing" />
              </div>
              <div className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1F883D]">
                <CheckCircleGreenIcon className="h-4 w-4" />
                Verified autonomously · ready for review
              </div>
              <button
                type="button"
                onClick={() => setVerify("fail")}
                className="block text-xs text-gh-fgMuted hover:text-[#CF222E] hover:underline"
              >
                simulate a failed verification →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <StepDot done label="Development" tag="AI wrote the change on the branch" />
                <div className="ml-[5px] h-6 w-0.5 bg-[#CF222E]" />
                <div className="flex items-start gap-3">
                  <span className="mt-1.5 h-3 w-3 flex-shrink-0 rounded-full bg-[#CF222E]" />
                  <div>
                    <div className="text-base font-medium">Verification</div>
                    <div className="text-sm text-[#CF222E]">Failed — the change didn't meet the acceptance criteria</div>
                  </div>
                </div>
                <div className="ml-[5px] h-6 w-0.5 bg-[#BC4C00]" />
                <div className="flex items-start gap-3">
                  <span className="mt-1.5 h-3 w-3 flex-shrink-0 rounded-full bg-[#BC4C00]" />
                  <div>
                    <div className="text-base font-medium text-[#BC4C00]">Reassignment</div>
                    <div className="text-sm text-gh-fgMuted">Re-delegated to a more qualified owner — no human</div>
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-[#BC4C00]/40 bg-[#FFF8F0] p-3">
                <p className="text-sm text-gh-fg">
                  <b>Reassigned to {reassign.name}</b>
                </p>
                <p className="mt-1 text-xs text-gh-fgMuted">{reassign.why}</p>
                <p className="mt-1.5 text-xs text-gh-fgMuted">
                  Task: <span className="text-gh-fg">{taskTitle}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVerify("pass")}
                className="block text-xs text-gh-fgMuted hover:underline"
              >
                ↩ reset
              </button>
            </div>
          )}
        </PhaseSection>

        {/* Human review — the human's entry point */}
        <PhaseSection
          title="Human review"
          status={reviewStatus}
          assignee={
            <AssigneeRow label="Assigned to:">
              <AssigneeBadge name={reviewerName} avatar={samuelAvatar} state="assigned" />
            </AssigneeRow>
          }
          action={
            reviewStatus === "locked" ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-gh-border px-2 py-0.5 text-[11px] font-medium text-gh-fgMuted opacity-60">
                Auto
              </span>
            ) : undefined
          }
        >
          {reviewStatus === "locked" ? (
            <span className="text-sm text-gh-fgMuted">Locked — Compass is still implementing.</span>
          ) : reviewStatus === "done" ? (
            <p className="text-sm text-gh-fg">
              Approved by <span className="font-medium">{reviewerName}</span>. Ready to merge.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gh-fg">
                Compass implemented this and generated base code. Review the plan and the change, then approve or send it back.
              </p>
              <button
                type="button"
                onClick={onReview}
                className="rounded-md border border-[rgba(31,35,40,0.15)] bg-[#0969DA] px-3 py-1.5 text-sm font-semibold text-white shadow-[0_1px_0_0_rgba(31,35,40,0.04)] hover:brightness-95"
              >
                Start human review
              </button>
            </div>
          )}
        </PhaseSection>
      </div>
    </CommentCard>
  );
}

function StepDot({ done, label, tag }: { done: boolean; label: string; tag: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={"mt-1.5 h-3 w-3 flex-shrink-0 rounded-full " + (done ? "bg-[#1F883D]" : "bg-[#BDBDBD]")} />
      <div>
        <div className="text-base font-medium">{label}</div>
        <div className="text-sm text-gh-fgMuted">{tag}</div>
      </div>
    </div>
  );
}

function StoppedRow({ onResume }: { onResume: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-gh-fgMuted">Run stopped.</span>
      <button
        type="button"
        onClick={onResume}
        className="rounded-md border border-gh-border px-2.5 py-1 text-xs font-medium text-gh-fg hover:bg-gh-canvasInset"
      >
        Resume
      </button>
    </div>
  );
}

/* ------------------------------ merge checks ------------------------------ */

function CheckRow({ icon, label, pending = false, required = false }: { icon: string; label: string; pending?: boolean; required?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-b border-gh-borderMuted px-3 py-1.5 last:border-b-0">
      {pending ? <PendingDotIcon className="h-4 w-4 flex-shrink-0" /> : <CheckCircleGreenIcon className="h-4 w-4 flex-shrink-0" />}
      <img src={icon} alt="" className="h-5 w-5 flex-shrink-0 rounded shadow-[0_0_0_1px_rgba(31,35,40,0.15)]" />
      <span className="min-w-0 flex-1 truncate text-sm text-gh-fg">{label}</span>
      {required && <Badge>Required</Badge>}
      <button type="button" aria-label="Check options" className="rounded-md p-1.5 hover:bg-black/5"><span className="text-base text-gh-fgMuted">•••</span></button>
    </div>
  );
}

function MergeChecks({ progress }: { progress: RunProgress }) {
  const [openPending, setOpenPending] = useState(true);
  const [openSuccess, setOpenSuccess] = useState(true);
  const [merged, setMerged] = useState(false);

  const phases = [
    { label: "Planning", done: progress.planningDone, icon: checkIcon },
    { label: "Implementation", done: progress.implementationDone, icon: checkIcon },
    { label: "Human review", done: progress.reviewDone, icon: checkIcon },
  ];
  const pending = phases.filter((p) => !p.done);
  const success = phases.filter((p) => p.done);
  const allDone = pending.length === 0;

  return (
    <div className="overflow-hidden rounded-md border border-gh-border bg-white">
      <div className="flex items-start gap-3 p-4">
        <span className={"flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full " + (allDone ? "bg-[#1F883D]" : "bg-[#9A6700]")}>
          {allDone ? <CheckIcon className="h-4 w-4 text-white" /> : <AlertTriangleIcon />}
        </span>
        <div>
          <h3 className="text-base font-semibold text-gh-fg">
            {allDone ? "All phases complete" : `${pending.length} phase${pending.length === 1 ? "" : "s"} awaiting`}
          </h3>
          <p className="text-sm text-gh-fgMuted">
            {allDone ? "This task is ready to merge." : "You need to complete all phases before you can merge"}
          </p>
        </div>
      </div>
      <div className="border-t border-gh-borderMuted bg-gh-canvasInset px-2 py-2">
        {pending.length > 0 && (
          <>
            <button type="button" onClick={() => setOpenPending(!openPending)} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gh-fgMuted">
              <span>{pending.length} pending check{pending.length === 1 ? "" : "s"}</span>
              <ChevronCollapseIcon className={openPending ? "rotate-180" : ""} />
            </button>
            {openPending &&
              pending.map((p) => <CheckRow key={p.label} icon={p.icon} label={`${p.label}  Expected — Waiting for status to be reported`} pending required />)}
          </>
        )}
        {success.length > 0 && (
          <>
            <button type="button" onClick={() => setOpenSuccess(!openSuccess)} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gh-fgMuted">
              <span>{success.length} successful check{success.length === 1 ? "" : "s"}</span>
              <ChevronCollapseIcon className={openSuccess ? "rotate-180" : ""} />
            </button>
            {openSuccess && (
              <div>
                {success.map((p) => (
                  <CheckRow key={p.label} icon={p.icon} label={p.label} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div className="border-t border-gh-borderMuted p-3">
        <button
          type="button"
          disabled={!allDone || merged}
          onClick={() => setMerged(true)}
          className={
            "flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-white " +
            (merged
              ? "bg-[#8250DF]"
              : allDone
                ? "bg-[#1F883D] hover:brightness-95"
                : "cursor-not-allowed bg-[#8c959f]")
          }
        >
          {merged ? (
            <>
              <CheckIcon className="h-4 w-4" /> Merged · pushed to GitHub
            </>
          ) : (
            "Merge & push to GitHub"
          )}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------- page -------------------------------- */

const DEMO_DETAIL: IssueDetail = {
  issue: {
    issue_id: "demo",
    title: "New letter-spacing icon",
    body: "Added new letter-spacing icon. It is used to adjust the spacing between characters, either increasing or decreasing the distance.",
    state: "open",
    provenance: "human",
    author: { name: "madebyoz", github_handle: "madebyoz", avatar_url: madeByOz },
    created_at: new Date(Date.now() - 5 * 864e5).toISOString(),
  },
  plan: null,
  versions: 1,
};

export default function AgentIssue() {
  const { id } = useParams();
  const navigate = useNavigate();
  const effId = id ?? "demo";

  const [detail, setDetail] = useState<IssueDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [progress, setProgress] = useState<RunProgress>(() => getRun(effId));
  const [running, setRunning] = useState<{ phase: RunPhase; step: number } | null>(null);

  function update(patch: Partial<RunProgress>) {
    setProgress(setRun(effId, patch));
  }

  useEffect(() => {
    let active = true;
    if (id === DEMO_FEATURE_ID) seedDemoIssue(); // ensure the seeded feature exists on direct nav
    setProgress(getRun(effId));
    setRunning(null);
    if (!id) {
      setDetail(DEMO_DETAIL);
      setStatus("ready");
      return;
    }
    setStatus("loading");
    keeper.getIssue(id).then((d) => {
      if (!active) return;
      setDetail(d);
      setStatus(d ? "ready" : "missing");
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const intakeComplete = Boolean(detail?.issue.body) || progress.intakeDone;

  // Auto-run planning then implementation once intake is complete; pause at human review.
  useEffect(() => {
    if (status !== "ready" || !detail || progress.stopped || running) return;
    if (!intakeComplete) return;
    if (!progress.planningDone) setRunning({ phase: "planning", step: 0 });
    else if (!progress.implementationDone) setRunning({ phase: "implementation", step: 0 });
    // else: implemented → pause, human review awaits.
  }, [status, detail, progress, running, intakeComplete]);

  useEffect(() => {
    if (!running) return;
    const steps = PHASE_STEPS[running.phase];
    if (running.step >= steps.length) {
      update(running.phase === "planning" ? { planningDone: true } : { implementationDone: true });
      setRunning(null);
      return;
    }
    const t = setTimeout(() => setRunning((r) => (r ? { ...r, step: r.step + 1 } : r)), STEP_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  if (status === "loading") {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:px-8 lg:px-20 xl:px-24">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-gh-canvasInset" />
          <div className="h-32 w-full max-w-[816px] rounded bg-gh-canvasInset" />
        </div>
      </main>
    );
  }

  if (status === "missing" || !detail) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:px-8 lg:px-20 xl:px-24">
        <h1 className="text-2xl font-semibold text-gh-fg">Issue not found</h1>
        <p className="mt-2 text-sm text-gh-fgMuted">
          No issue with id <InlineCode>{id}</InlineCode>. It may not have been created in this session.
        </p>
      </main>
    );
  }

  const { issue, plan } = detail;

  // Timeline: intake + planning.
  const planningDoneCount = progress.planningDone ? PLANNING_STEPS.length : running?.phase === "planning" ? running.step : 0;
  const intakeTimeline: AgentAction[] = [
    {
      id: "ingest",
      text: (
        <span>
          <span className="font-semibold text-gh-fg">Compass</span> ingested the task
        </span>
      ),
      event: "issue.created",
      state: "done",
    },
  ];
  if (intakeComplete && !issue.body) {
    intakeTimeline.push({ id: "clarified", text: "Clarified requirements, wrote the description", event: "issue.created", state: "done" });
  }
  if (progress.planVersion > 1) {
    intakeTimeline.push({
      id: "revised",
      text: (
        <span>
          <span className="font-semibold text-gh-fg">Compass</span> restructured the plan to v{progress.planVersion} (changes requested)
        </span>
      ),
      event: "plan.revised",
      state: "done",
    });
  }
  intakeTimeline.push(
    ...PLANNING_STEPS.slice(0, planningDoneCount).map((s, i) => ({ id: `p${i}`, text: s.done, event: s.event, state: "done" as const })),
  );
  if (running?.phase === "planning" && running.step < PLANNING_STEPS.length) {
    intakeTimeline.push({ id: "p-active", text: PLANNING_STEPS[running.step].label, event: PLANNING_STEPS[running.step].event, state: "active" });
  }

  // Timeline: implementation + review outcome.
  const implDoneCount = progress.implementationDone ? IMPLEMENTATION_STEPS.length : running?.phase === "implementation" ? running.step : 0;
  const execTimeline: AgentAction[] = IMPLEMENTATION_STEPS.slice(0, implDoneCount).map((s, i) => ({
    id: `i${i}`,
    text: s.done,
    event: s.event,
    state: "done" as const,
  }));
  if (running?.phase === "implementation" && running.step < IMPLEMENTATION_STEPS.length) {
    execTimeline.push({
      id: "i-active",
      text: IMPLEMENTATION_STEPS[running.step].label,
      event: IMPLEMENTATION_STEPS[running.step].event,
      state: "active",
    });
  }
  if (progress.reviewDone) {
    execTimeline.push({
      id: "approved",
      text: (
        <span>
          <span className="font-semibold text-gh-fg">samuelalake</span> approved the change
        </span>
      ),
      event: "branch.merged",
      state: "done",
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:px-8 lg:px-20 xl:px-24">
      <div className="mb-5">
        <h1 className="text-3xl font-normal leading-[48px] tracking-[-0.02em] text-gh-fg sm:text-[32px]">{issue.title}</h1>
        <p className="text-xs text-gh-fgMuted">
          <span className="font-semibold">{issue.author.name}</span> created {timeAgo(issue.created_at)}
        </p>
      </div>
      <div className="mx-auto w-full max-w-[816px]">
        {/* Kickoff */}
        <div className="flex items-start gap-3 sm:gap-4">
          <Avatar src={issue.author.avatar_url ?? madeByOz} alt={issue.author.name} size={40} />
          <CommentCard author={issue.author.name} action="kicked off a task" showReaction>
            <h2 className="border-b border-gh-borderMuted pb-1.5 text-[21px] font-semibold text-gh-fg">{issue.title}</h2>
            <div className="space-y-5 pt-4 text-sm text-gh-fg">
              <div>
                <h3 className="text-[18px] font-semibold">Description</h3>
                <div className="mt-3">
                  {issue.body ? (
                    <DescriptionText text={issue.body} />
                  ) : progress.intakeDone ? (
                    <DescriptionText text={progress.description} />
                  ) : (
                    <DescriptionIntake title={issue.title} onComplete={(d) => update({ intakeDone: true, description: d })} />
                  )}
                </div>
              </div>
            </div>
          </CommentCard>
        </div>

        <div className="mt-3">
          <AgentTimeline entries={intakeTimeline} />
        </div>

        {/* Lifecycle */}
        <div className="mt-3 flex items-start gap-3 sm:gap-4">
          <CompassLogo size={40} rounded="md" />
          <LifecycleCard
            plan={plan}
            progress={progress}
            running={running}
            onStop={() => {
              update({ stopped: true });
              setRunning(null);
            }}
            onResume={() => update({ stopped: false })}
            onReview={() => navigate(`/issue/${effId}/review`)}
          />
        </div>

        {execTimeline.length > 0 && (
          <div className="mt-3">
            <AgentTimeline entries={execTimeline} />
          </div>
        )}

        {/* Merge gate */}
        <div className="mt-3 flex items-start gap-3 sm:gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-gh-fg">
            <MergeBlockedIcon />
          </div>
          <div className="min-w-0 flex-1">
            <MergeChecks progress={progress} />
          </div>
        </div>
      </div>
    </main>
  );
}
