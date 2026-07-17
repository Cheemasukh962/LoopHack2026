import { useState, type ReactNode } from "react";
import { AlertTriangleIcon, CheckCircleGreenIcon, ChevronCollapseIcon, GearIcon, MergeBlockedIcon, PendingDotIcon } from "@/components/agent-issue/icons";
import { Avatar, ActivityRow, TimelineItem } from "@/components/agent-issue/Timeline";
import { Badge, ChecklistItem, CommentCard, InlineCode } from "@/components/agent-issue/CommentCard";

const madeByOz = "https://api.builder.io/api/v1/image/assets/TEMP/90a99dd6e925502c62c330bbc0aeb14c37a274db?width=80";
const avatarSmall = "https://api.builder.io/api/v1/image/assets/TEMP/fecad235da37f8620b01c6f99da56a2d0c511f22?width=40";
const githubActions = "https://api.builder.io/api/v1/image/assets/TEMP/ed8da972cc7446bd1bee41db3083b348995617d4?width=80";
const checkIcon = "https://api.builder.io/api/v1/image/assets/TEMP/b7181c122d914fe5de0b8c84cea316aff699540a?width=40";
const vercelIcon = "https://api.builder.io/api/v1/image/assets/TEMP/635f7541144061997cb9791fae76374768f67998?width=40";

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

function PlanSection({ title, assigned, children }: { title: string; assigned: string[]; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-[18px] font-semibold leading-6 tracking-[-0.02em] text-gh-fg">{title}</h3>
      <div className="mt-2 rounded-md border border-gh-border bg-white p-3 shadow-[0_1px_1px_rgba(37,41,46,0.1),0_3px_6px_rgba(37,41,46,0.12)]">
        <AssignedTo names={assigned} />
        <div className="mt-1 text-sm leading-5 text-gh-fg">{children}</div>
      </div>
    </section>
  );
}

function PlanningCard() {
  return (
    <CommentCard
      author="agent"
      action="created a full plan with development life cycle"
      badges={<Badge>Bot</Badge>}
      headerRight={<Badge>Contributor</Badge>}
      showReaction
    >
      <div className="space-y-3">
        <PlanSection title="Planning" assigned={["AI"]}>Lorem ipsum this is the review plan</PlanSection>
        <PlanSection title="Implementation" assigned={["some human", "AI"]}>
          <div className="space-y-1">
            <div className="flex items-start gap-3"><span className="mt-1.5 h-3 w-3 flex-shrink-0 rounded-full bg-[#BDBDBD]" /><div><div className="text-base font-medium">Development</div><div className="text-sm text-gh-fgMuted">Some tagline here</div></div></div>
            <div className="ml-[5px] h-7 w-0.5 bg-[#BDBDBD]" />
            <div className="flex items-start gap-3"><span className="mt-1.5 h-3 w-3 flex-shrink-0 rounded-full bg-[#BDBDBD]" /><div><div className="text-base font-medium">Verification</div><div className="text-sm text-gh-fgMuted">Some tagline here</div></div></div>
          </div>
        </PlanSection>
        <PlanSection title="Review" assigned={["some human", "AI"]}>Lorem ipsum this is the review plan</PlanSection>
      </div>
    </CommentCard>
  );
}

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

function MergeChecks() {
  const [openPending, setOpenPending] = useState(true);
  const [openSuccess, setOpenSuccess] = useState(true);
  return (
    <div className="overflow-hidden rounded-md border border-gh-border bg-white">
      <div className="flex items-start gap-3 p-4">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#9A6700]"><AlertTriangleIcon /></span>
        <div><h3 className="text-base font-semibold text-gh-fg">3 phases awaiting</h3><p className="text-sm text-gh-fgMuted">You need to complete all phases before you can merge</p></div>
      </div>
      <div className="border-t border-gh-borderMuted bg-gh-canvasInset px-2 py-2">
        <button type="button" onClick={() => setOpenPending(!openPending)} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gh-fgMuted"><span>1 pending check</span><ChevronCollapseIcon className={openPending ? "rotate-180" : ""} /></button>
        {openPending && <CheckRow icon={checkIcon} label="Review  Expected — Waiting for status to be reported" pending required />}
        <button type="button" onClick={() => setOpenSuccess(!openSuccess)} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gh-fgMuted"><span>3 successful checks</span><ChevronCollapseIcon className={openSuccess ? "rotate-180" : ""} /></button>
        {openSuccess && <div><CheckRow icon={checkIcon} label="Planning" /><CheckRow icon={checkIcon} label="Implementation" /><CheckRow icon={vercelIcon} label="Vercel" /></div>}
      </div>
    </div>
  );
}

export default function Index() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:px-8 lg:px-20 xl:px-24">
      <div className="mb-5">
        <h1 className="text-3xl font-normal leading-[48px] tracking-[-0.02em] text-gh-fg sm:text-[32px]">Agent Issue</h1>
        <p className="text-xs text-gh-fgMuted"><span className="font-semibold">arturcraft</span> created 5 days ago</p>
      </div>
      <div className="mx-auto w-full max-w-[816px]">
        <div className="mb-5 flex items-start gap-3">
          <Avatar src={madeByOz} alt="madebyoz" size={40} />
          <CommentCard author="madebyoz" action="kicked off a task" showReaction>
            <h2 className="border-b border-gh-borderMuted pb-1.5 text-[21px] font-semibold text-gh-fg">Heading</h2>
            <div className="space-y-5 pt-4 text-sm text-gh-fg">
              <ChecklistItem label="New Icon" />
              <div><h3 className="text-[18px] font-semibold">Description</h3><p className="mt-3">Added new <InlineCode>letter-spacing</InlineCode> icon.</p></div>
              <div><h3 className="text-[18px] font-semibold">Icon use case</h3><p className="mt-3">It is used to adjust the spacing between characters, either increasing or decreasing the distance.</p></div>
            </div>
          </CommentCard>
        </div>
        <div className="mb-5 space-y-1"><ActivityRow author="name" action="some activity that happened" commitLabel="some other activity that happened" commitHash="21af1fd" /></div>
        <div className="mb-5 flex items-start gap-3">
          <Avatar src={githubActions} alt="GitHub Actions" size={40} rounded="md" />
          <PlanningCard />
        </div>
        <div className="mb-5 space-y-1"><ActivityRow author="name" action="some activity that happened" commitLabel="some other activity that happened" commitHash="21af1fd" /></div>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-gh-fg"><MergeBlockedIcon /></div>
          <div className="min-w-0 flex-1"><MergeChecks /></div>
        </div>
      </div>
    </main>
  );
}
