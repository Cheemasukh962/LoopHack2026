import { useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Check, IssueDetail, MergeStatus, PlanSectionDTO } from "@shared/api";
import { getIssue } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangleIcon, CheckCircleGreenIcon, ChevronCollapseIcon, MergeBlockedIcon, PendingDotIcon } from "@/components/agent-issue/icons";
import { Avatar, ActivityRow } from "@/components/agent-issue/Timeline";
import { Badge, ChecklistItem, CommentCard, InlineCode } from "@/components/agent-issue/CommentCard";

const madeByOz = "https://api.builder.io/api/v1/image/assets/TEMP/90a99dd6e925502c62c330bbc0aeb14c37a274db?width=80";
const avatarSmall = "https://api.builder.io/api/v1/image/assets/TEMP/fecad235da37f8620b01c6f99da56a2d0c511f22?width=40";
const githubActions = "https://api.builder.io/api/v1/image/assets/TEMP/ed8da972cc7446bd1bee41db3083b348995617d4?width=80";
const checkIcon = "https://api.builder.io/api/v1/image/assets/TEMP/b7181c122d914fe5de0b8c84cea316aff699540a?width=40";
const vercelIcon = "https://api.builder.io/api/v1/image/assets/TEMP/635f7541144061997cb9791fae76374768f67998?width=40";

const DEFAULT_ISSUE_ID = "iss-500s";
const PROVIDER_ICON: Record<Check["provider"], string> = {
  planning: checkIcon,
  implementation: checkIcon,
  review: checkIcon,
  vercel: vercelIcon,
};

function AssignedTo({ names }: { names: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-bold text-gh-fgMuted">Assigned to:</span>
      {names.map((name) => (
        <span key={name} className="inline-flex items-center gap-1 font-mono text-gh-fgMuted">
          <Avatar src={avatarSmall} alt="Assigned user" size={20} />
          {name}
        </span>
      ))}
    </div>
  );
}

function PlanSection({ section }: { section: PlanSectionDTO }) {
  return (
    <section>
      <h3 className="text-[18px] font-semibold leading-6 tracking-[-0.02em] text-gh-fg">{section.title}</h3>
      <div className="mt-2 rounded-md border border-gh-border bg-white p-3 shadow-[0_1px_1px_rgba(37,41,46,0.1),0_3px_6px_rgba(37,41,46,0.12)]">
        <AssignedTo names={section.assigned} />
        <div className="mt-1 text-sm leading-5 text-gh-fg">
          {section.steps ? (
            <div className="space-y-1">
              {section.steps.map((step, i) => (
                <div key={step.title}>
                  <div className="flex items-start gap-3">
                    <span className="mt-1.5 h-3 w-3 flex-shrink-0 rounded-full bg-[#BDBDBD]" />
                    <div>
                      <div className="text-base font-medium">{step.title}</div>
                      <div className="text-sm text-gh-fgMuted">{step.tagline}</div>
                    </div>
                  </div>
                  {i < section.steps!.length - 1 && <div className="ml-[5px] h-7 w-0.5 bg-[#BDBDBD]" />}
                </div>
              ))}
            </div>
          ) : (
            section.text
          )}
        </div>
      </div>
    </section>
  );
}

function PlanningCard({ plan }: { plan: IssueDetail["plan"] }) {
  return (
    <CommentCard author={plan.author} action={plan.action} badges={<Badge>Bot</Badge>} headerRight={<Badge>Contributor</Badge>} showReaction>
      <div className="space-y-3">
        {plan.sections.map((section) => (
          <PlanSection key={section.title} section={section} />
        ))}
      </div>
    </CommentCard>
  );
}

function CheckRow({ check }: { check: Check }) {
  const pending = check.state === "pending";
  return (
    <div className="flex min-w-0 items-center gap-2 border-b border-gh-borderMuted px-3 py-1.5 last:border-b-0">
      {pending ? <PendingDotIcon className="h-4 w-4 flex-shrink-0" /> : <CheckCircleGreenIcon className="h-4 w-4 flex-shrink-0" />}
      <img src={PROVIDER_ICON[check.provider]} alt="" className="h-5 w-5 flex-shrink-0 rounded shadow-[0_0_0_1px_rgba(31,35,40,0.15)]" />
      <span className="min-w-0 flex-1 truncate text-sm text-gh-fg">{check.label}</span>
      {check.required && <Badge>Required</Badge>}
      <button type="button" aria-label="Check options" className="rounded-md p-1.5 hover:bg-black/5"><span className="text-base text-gh-fgMuted">•••</span></button>
    </div>
  );
}

function MergeChecks({ merge }: { merge: MergeStatus }) {
  const [openPending, setOpenPending] = useState(true);
  const [openSuccess, setOpenSuccess] = useState(true);
  return (
    <div className="overflow-hidden rounded-md border border-gh-border bg-white">
      <div className="flex items-start gap-3 p-4">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#9A6700]"><AlertTriangleIcon /></span>
        <div>
          <h3 className="text-base font-semibold text-gh-fg">{merge.phasesAwaiting} phases awaiting</h3>
          <p className="text-sm text-gh-fgMuted">{merge.summary}</p>
        </div>
      </div>
      <div className="border-t border-gh-borderMuted bg-gh-canvasInset px-2 py-2">
        <button type="button" onClick={() => setOpenPending(!openPending)} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gh-fgMuted">
          <span>{merge.pending.length} pending check{merge.pending.length === 1 ? "" : "s"}</span>
          <ChevronCollapseIcon className={openPending ? "rotate-180" : ""} />
        </button>
        {openPending && merge.pending.map((c) => <CheckRow key={c.label} check={c} />)}
        <button type="button" onClick={() => setOpenSuccess(!openSuccess)} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gh-fgMuted">
          <span>{merge.successful.length} successful check{merge.successful.length === 1 ? "" : "s"}</span>
          <ChevronCollapseIcon className={openSuccess ? "rotate-180" : ""} />
        </button>
        {openSuccess && <div>{merge.successful.map((c) => <CheckRow key={c.label} check={c} />)}</div>}
      </div>
    </div>
  );
}

export default function AgentIssue() {
  const { id } = useParams();
  const issueId = id ?? DEFAULT_ISSUE_ID;
  const { data: issue, isLoading, isError } = useQuery<IssueDetail>({ queryKey: ["issue", issueId], queryFn: () => getIssue(issueId) });

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:px-8 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-[816px] space-y-5">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-56 w-full rounded-md" />
        </div>
      </main>
    );
  }
  if (isError || !issue) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:px-8 lg:px-20 xl:px-24">
        <p className="rounded-md border border-gh-border bg-white p-4 text-sm text-gh-fgMuted">Couldn’t load issue <InlineCode>{issueId}</InlineCode>. Is the API server running?</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:px-8 lg:px-20 xl:px-24">
      <div className="mb-5">
        <h1 className="text-3xl font-normal leading-[48px] tracking-[-0.02em] text-gh-fg sm:text-[32px]">{issue.title}</h1>
        <p className="text-xs text-gh-fgMuted"><span className="font-semibold">{issue.author}</span> created {timeAgo(issue.createdAtMs)}</p>
      </div>
      <div className="mx-auto w-full max-w-[816px]">
        <div className="mb-5 flex items-start gap-3">
          <Avatar src={madeByOz} alt={issue.kickoff.author} size={40} />
          <CommentCard author={issue.kickoff.author} action={issue.kickoff.action} showReaction>
            <h2 className="border-b border-gh-borderMuted pb-1.5 text-[21px] font-semibold text-gh-fg">{issue.kickoff.heading}</h2>
            <div className="space-y-5 pt-4 text-sm text-gh-fg">
              {issue.kickoff.checklist.map((label) => (
                <ChecklistItem key={label} label={label} />
              ))}
              {issue.kickoff.sections.map((s) => (
                <div key={s.heading}>
                  <h3 className="text-[18px] font-semibold">{s.heading}</h3>
                  <p className="mt-3">{s.body}</p>
                </div>
              ))}
            </div>
          </CommentCard>
        </div>

        {issue.activities.map((a, i) => (
          <div key={i} className="mb-5 space-y-1">
            <ActivityRow author={a.author} action={a.action} commitLabel={a.commitLabel ?? ""} commitHash={a.commitHash ?? ""} />
          </div>
        ))}

        <div className="mb-5 flex items-start gap-3">
          <Avatar src={githubActions} alt="Agent" size={40} rounded="md" />
          <PlanningCard plan={issue.plan} />
        </div>

        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-gh-fg"><MergeBlockedIcon /></div>
          <div className="min-w-0 flex-1"><MergeChecks merge={issue.merge} /></div>
        </div>
      </div>
    </main>
  );
}
