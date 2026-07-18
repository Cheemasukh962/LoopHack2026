import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { keeper } from "@/lib/keeper";
import type { Person } from "@shared/api";
import {
  BACKLOG, type Member, type Task,
  resumeMatch, provenFit, pickByResume, pickByProven, verdictFor, toolFor,
  parseResumeSkills, estimateCommitsFromResume,
} from "@/lib/team";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Stage = "delegated" | "working" | "review" | "meeting" | "done";
interface Card {
  task: Task;
  assignee: Member;
  stage: Stage;
  resume: number;
  proven: number;
  verdict?: "clean" | "minor" | "major";
  tool?: string;
  tried: string[];
  meeting: boolean;
  redelegated?: string;
}
type Sponsor = "nexla" | "zero" | "pomerium";
interface Log { id: number; text: string; sponsor?: Sponsor; flag?: boolean }

const SPONSOR_COLOR: Record<Sponsor, string> = { nexla: "#7C3AED", zero: "#0E9F6E", pomerium: "#2563EB" };
const UPLOAD_KEY = "keeper.team.uploaded.v1";

function toMember(p: Person, source: Member["source"] = "team"): Member {
  const skills = [...(p.resume_parsed?.skills ?? []), ...(p.resume_parsed?.stacks ?? [])];
  return { id: p.person_id, name: p.name, skills, stacks: p.resume_parsed?.stacks ?? [], cold_start: p.cold_start, commits: p.repo_commits, source };
}

const CLAIMANT: Member = {
  id: "person_sam", name: "Sam Okoro", cold_start: true, commits: 1, source: "team",
  skills: ["security", "authentication", "OAuth", "reliability", "SRE"], stacks: ["Node.js", "Python"],
};

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function Avatar({ name, color = "#57606A" }: { name: string; color?: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: color }}>
      {initials(name)}
    </span>
  );
}

function Chip({ sponsor }: { sponsor: Sponsor }) {
  const c = SPONSOR_COLOR[sponsor];
  const label = sponsor === "zero" ? "Zero.xyz" : sponsor[0].toUpperCase() + sponsor.slice(1);
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold align-middle"
      style={{ color: c, background: `${c}14`, boxShadow: `inset 0 0 0 1px ${c}33` }}>{label}</span>
  );
}

const COLS: { key: Stage; label: string }[] = [
  { key: "delegated", label: "Delegated" },
  { key: "working", label: "Working" },
  { key: "review", label: "In review" },
  { key: "meeting", label: "Escalated · PM sync" },
  { key: "done", label: "Done" },
];

export default function Team() {
  const [team, setTeam] = useState<Member[]>([]);
  const [cards, setCards] = useState<Record<string, Card>>({});
  const [logs, setLogs] = useState<Log[]>([]);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const teamRef = useRef<Member[]>([]);
  const logId = useRef(0);

  // Load roster: backend résumé team + any uploaded, guaranteeing a cold-start claimant for the demo.
  useEffect(() => {
    (async () => {
      const people = await keeper.getTeam();
      let members = people.map((p) => toMember(p));
      if (!members.some((m) => m.cold_start)) members = [...members, CLAIMANT];
      const uploaded: Member[] = JSON.parse(localStorage.getItem(UPLOAD_KEY) ?? "[]");
      const all = [...members, ...uploaded.filter((u) => !members.some((m) => m.id === u.id))];
      setTeam(all);
      teamRef.current = all;
    })();
  }, []);
  useEffect(() => { teamRef.current = team; }, [team]);

  const log = (text: string, sponsor?: Sponsor, flag?: boolean) =>
    setLogs((ls) => [...ls, { id: ++logId.current, text, sponsor, flag }]);
  const setCard = (id: string, patch: Partial<Card>) =>
    setCards((c) => ({ ...c, [id]: { ...c[id], ...patch } }));

  async function processTask(task: Task) {
    const members = teamRef.current;
    // 1) Delegate by résumé (what a naïve delegator trusts).
    const first = pickByResume(task, members);
    if (!first) return;
    const rm = resumeMatch(first, task);
    const pf = provenFit(first, task);
    setCards((c) => ({ ...c, [task.id]: { task, assignee: first, stage: "delegated", resume: rm, proven: pf, tried: [first.id], meeting: false } }));
    log(`Delegated “${task.title}” → ${first.name} — résumé match ${rm.toFixed(2)} for ${task.required_skills.join(", ")}`, "nexla");
    await sleep(1100);

    // 2) They work on it — Keeper discovers a tool via Zero to check the output.
    const tool = toolFor(task.module);
    setCard(task.id, { stage: "working", tool });
    log(`${first.name} is implementing… Keeper discovered ${tool} via Zero to verify it`, "zero");
    await sleep(1200);

    // 3) Review — proven fit decides whether the résumé claim held up.
    setCard(task.id, { stage: "review" });
    const verdict = verdictFor(pf);
    setCard(task.id, { verdict });
    await sleep(900);

    if (verdict === "clean") {
      setCard(task.id, { stage: "done" });
      log(`Review of “${task.title}” passed — proven fit ${pf.toFixed(2)}. ✓`);
      return;
    }
    if (verdict === "minor") {
      log(`Minor issues on “${task.title}” — sent back; ${first.name} fixed them`);
      await sleep(900);
      setCard(task.id, { stage: "done" });
      log(`Review passed after rework. ✓`);
      return;
    }

    // MAJOR: résumé claim wasn't backed by proof → PM sync + auto re-delegate to the proven owner.
    setCard(task.id, { stage: "meeting", meeting: true });
    log(`🚩 Major defect on “${task.title}”: ${first.name} claimed ${task.required_skills[0]} on their résumé but isn't the proven owner (${first.commits} commit${first.commits === 1 ? "" : "s"}). PM scheduled a sync.`, undefined, true);
    await sleep(1300);
    const proven = pickByProven(task, members, [first.id]);
    if (!proven) { setCard(task.id, { stage: "done" }); return; }
    setCard(task.id, { assignee: proven, stage: "working", tried: [first.id, proven.id], redelegated: first.name, proven: provenFit(proven, task), tool: toolFor(task.module) });
    log(`Re-delegated to ${proven.name} — proven owner (${proven.commits} commits, real ownership). Pomerium re-authorized the write.`, "pomerium");
    await sleep(1200);
    setCard(task.id, { stage: "review", verdict: "clean" });
    log(`${proven.name} shipped it; review passed. ✓`, "nexla");
    await sleep(700);
    setCard(task.id, { stage: "done" });
  }

  async function run() {
    setPhase("running");
    setCards({});
    setLogs([]);
    logId.current = 0;
    for (const task of BACKLOG) {
      await processTask(task);
      await sleep(400);
    }
    setPhase("done");
  }

  const cardList = Object.values(cards);
  const stats = {
    delegated: cardList.length,
    redelegated: cardList.filter((c) => c.redelegated).length,
    meetings: cardList.filter((c) => c.meeting).length,
    done: cardList.filter((c) => c.stage === "done").length,
  };

  return (
    <main className="mx-auto w-full max-w-[1000px] px-4 pb-16 pt-6 sm:px-8">
      <Link to="/" className="text-sm text-[#0969DA] hover:underline">← Home</Link>
      <header className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gh-fg">Autonomous delegation</h1>
          <p className="mt-1 max-w-2xl text-sm text-gh-fgMuted">
            Keeper delegates each task to the best <b>résumé</b> match, they do it (Keeper verifies with a
            <b> Zero</b>-discovered tool), and reviews it. If a résumé claim wasn't backed by real ownership,
            the review catches it, a PM schedules a sync, and Keeper <b>auto re-delegates to the proven owner</b>.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={phase === "running" || team.length === 0}
          className="rounded-md bg-[#1F883D] px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
        >
          {phase === "running" ? "Running…" : phase === "done" ? "Run again" : "Run autonomous delegation"}
        </button>
      </header>

      {phase !== "idle" && (
        <div className="mt-4 grid grid-cols-4 gap-3">
          {[["tasks", stats.delegated], ["re-delegated", stats.redelegated], ["PM syncs", stats.meetings], ["done", stats.done]].map(([k, v]) => (
            <div key={k as string} className="rounded-md border border-gh-borderMuted bg-white p-2.5 text-center">
              <p className="text-xl font-semibold text-gh-fg">{v as number}</p>
              <p className="text-[11px] text-gh-fgMuted">{k as string}</p>
            </div>
          ))}
        </div>
      )}

      {/* board */}
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-5">
        {COLS.map((col) => (
          <div key={col.key} className="rounded-md border border-gh-borderMuted bg-gh-canvasInset p-2">
            <p className="px-1 pb-2 text-xs font-semibold text-gh-fgMuted">{col.label}</p>
            <div className="flex flex-col gap-2">
              {cardList.filter((c) => c.stage === col.key).map((c) => (
                <div key={c.task.id} className="rounded-md border border-gh-border bg-white p-2">
                  <p className="text-xs font-semibold text-gh-fg">{c.task.title}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Avatar name={c.assignee.name} color={c.assignee.cold_start ? "#BC4C00" : "#0969DA"} />
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-gh-fg">{c.assignee.name}{c.assignee.cold_start && " · résumé claim"}</p>
                      <p className="text-[10px] text-gh-fgMuted">résumé {c.resume.toFixed(2)} · proven {c.proven.toFixed(2)}</p>
                    </div>
                  </div>
                  {c.tool && (c.stage === "working" || c.stage === "review") && <p className="mt-1 text-[10px]" style={{ color: SPONSOR_COLOR.zero }}>▶ {c.tool} (Zero)</p>}
                  {c.stage === "meeting" && <p className="mt-1 text-[10px] font-semibold text-[#BC4C00]">🚩 major defect → PM sync</p>}
                  {c.redelegated && c.stage === "done" && <p className="mt-1 text-[10px] text-gh-fgMuted">re-delegated from {c.redelegated}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* activity + roster */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-gh-fg">Activity</h2>
          <div className="mt-2 max-h-[360px] overflow-y-auto rounded-md border border-gh-borderMuted bg-white">
            <ol className="divide-y divide-gh-borderMuted">
              {logs.length === 0 && <li className="px-3 py-3 text-sm text-gh-fgMuted">Press “Run autonomous delegation”.</li>}
              {logs.map((l) => (
                <li key={l.id} className={`px-3 py-2 text-xs ${l.flag ? "bg-[#FFF8F0]" : ""}`}>
                  <span className={l.flag ? "font-semibold text-[#BC4C00]" : "text-gh-fg"}>{l.text}</span>
                  {l.sponsor && <Chip sponsor={l.sponsor} />}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gh-fg">Team &amp; résumés</h2>
            <span className="text-xs text-gh-fgMuted">{team.length} people</span>
          </div>
          <div className="mt-2 flex flex-col gap-2">
            {team.map((m) => (
              <div key={m.id} className="flex items-start gap-2 rounded-md border border-gh-border bg-white p-2">
                <Avatar name={m.name} color={m.cold_start ? "#BC4C00" : "#0969DA"} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gh-fg">
                    {m.name}
                    {m.cold_start
                      ? <span className="ml-1.5 rounded-full bg-[#FFEBDA] px-1.5 py-0.5 text-[10px] font-semibold text-[#BC4C00]">résumé claim · {m.commits} commit</span>
                      : <span className="ml-1.5 text-[10px] text-gh-fgMuted">{m.commits} commits</span>}
                    {m.source === "uploaded" && <span className="ml-1.5 text-[10px] text-[#0969DA]">uploaded</span>}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gh-fgMuted">{m.skills.slice(0, 6).join(" · ")}</p>
                </div>
              </div>
            ))}
          </div>
          <ResumeUpload onAdd={(m) => {
            setTeam((t) => {
              const next = [...t, m];
              teamRef.current = next;
              const uploaded = next.filter((x) => x.source === "uploaded");
              localStorage.setItem(UPLOAD_KEY, JSON.stringify(uploaded));
              return next;
            });
          }} />
        </div>
      </div>
    </main>
  );
}

/* ------------------------------ résumé upload ------------------------------ */

function ResumeUpload({ onAdd }: { onAdd: (m: Member) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  function submit() {
    const skills = parseResumeSkills(text);
    if (!name.trim() || skills.length === 0) return;
    onAdd({
      id: `uploaded_${name.trim().toLowerCase().replace(/\s+/g, "_")}`,
      name: name.trim(),
      skills,
      stacks: [],
      cold_start: /\b(0|1|one)\s*years?|new grad|entry|junior/i.test(text),
      commits: estimateCommitsFromResume(text),
      source: "uploaded",
    });
    setName(""); setText(""); setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="mt-2 w-full rounded-md border border-dashed border-[#0969DA] bg-[#0969DA0a] py-2 text-sm font-semibold text-[#0969DA] hover:bg-[#0969DA14]">
        + Upload a résumé
      </button>
    );
  }
  return (
    <div className="mt-2 rounded-md border border-gh-borderMuted bg-white p-3">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name"
        className="w-full rounded-md border border-gh-border px-2 py-1.5 text-sm focus:outline-none" />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
        placeholder="Paste résumé text (skills, stacks, years)…"
        className="mt-2 w-full resize-y rounded-md border border-gh-border px-2 py-1.5 text-sm focus:outline-none" />
      <div className="mt-2 flex items-center justify-between gap-2">
        <label className="cursor-pointer text-xs text-[#0969DA] hover:underline">
          or attach a .txt/.md file
          <input type="file" accept=".txt,.md,.text" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
        </label>
        {text && <span className="text-[11px] text-gh-fgMuted">parsed: {parseResumeSkills(text).join(", ") || "no known skills yet"}</span>}
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={submit} className="rounded-md bg-[#1F883D] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-95">Add to team</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-gh-border px-3 py-1.5 text-sm text-gh-fg">Cancel</button>
      </div>
    </div>
  );
}
