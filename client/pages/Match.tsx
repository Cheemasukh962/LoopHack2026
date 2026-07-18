import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { keeper } from "@/lib/keeper";

// Pre-loaded résumé (demo). Uploading = Keeper reads this and delegates the matching spec.
const RESUME = {
  name: "Alex Rivera",
  handle: "alexrivera",
  headline: "Senior Frontend Engineer · 6 yrs",
  skills: ["React", "TypeScript", "Accessibility", "Design systems", "Vite", "Testing"],
};

// The open backlog Keeper (as PM) can delegate from — each spec needs certain skills.
const BACKLOG = [
  {
    id: "csv-a11y",
    title: "Make the analytics dashboard export accessible",
    skills: ["react", "accessibility", "typescript"],
    body: "The CSV export button on the analytics dashboard isn't keyboard- or screen-reader accessible. Add proper focus handling, ARIA, and a visible focus ring, and respect the active filters.",
  },
  {
    id: "oauth",
    title: "Rotate OAuth session tokens on renewal",
    skills: ["security", "authentication", "oauth"],
    body: "Session tokens aren't rotated on renewal, widening the replay window. Rotate on refresh and invalidate the previous token.",
  },
  {
    id: "tf",
    title: "Restrict the Terraform security group from 0.0.0.0/0",
    skills: ["terraform", "aws", "sre"],
    body: "infra/main.tf opens 0.0.0.0/0 ingress on a debug rule. Restrict the CIDR and remove the temporary rule.",
  },
];

const overlap = (resumeSkills: string[], taskSkills: string[]) => {
  const rs = resumeSkills.map((s) => s.toLowerCase());
  return taskSkills.filter((t) => rs.some((r) => r.includes(t) || t.includes(r)));
};

function Initials({ name }: { name: string }) {
  const i = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0969DA] text-sm font-bold text-white">{i}</span>;
}

export default function Match() {
  const navigate = useNavigate();
  // phases: reading skills -> matched -> starting
  const [recognized, setRecognized] = useState(0);
  const [phase, setPhase] = useState<"reading" | "matched">("reading");
  const [starting, setStarting] = useState(false);

  // Animate skills being "recognized" one by one, then reveal the match.
  useEffect(() => {
    if (recognized < RESUME.skills.length) {
      const t = setTimeout(() => setRecognized((n) => n + 1), 260);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setPhase("matched"), 500);
    return () => clearTimeout(t);
  }, [recognized]);

  const ranked = BACKLOG
    .map((t) => ({ t, matched: overlap(RESUME.skills, t.skills) }))
    .sort((a, b) => b.matched.length - a.matched.length);
  const best = ranked[0];
  const score = Math.min(0.99, 0.6 + best.matched.length * 0.13);

  async function start() {
    setStarting(true);
    const { issue_id } = await keeper.createIssue(
      { title: best.t.title, body: best.t.body },
      { assignee: { name: RESUME.name, context_score: score, why: `Matched by résumé — skills ${best.matched.join(", ")}` } },
    );
    navigate(`/issue/${issue_id}`);
  }

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 pb-16 pt-6 sm:px-6">
      <Link to="/" className="text-sm text-[#0969DA] hover:underline">← Home</Link>

      <header className="mt-3">
        <h1 className="text-xl font-semibold text-gh-fg">Résumé intake</h1>
        <p className="mt-1 text-sm text-gh-fgMuted">
          Keeper reviews the résumé, recognizes the skills, and delegates the matching spec — then the agent runs it autonomously.
        </p>
      </header>

      {/* résumé card */}
      <section className="mt-5 rounded-md border border-gh-border bg-white p-4">
        <div className="flex items-center gap-3">
          <Initials name={RESUME.name} />
          <div>
            <p className="text-sm font-semibold text-gh-fg">{RESUME.name}</p>
            <p className="text-xs text-gh-fgMuted">{RESUME.headline}</p>
          </div>
          <span className="ml-auto rounded-full bg-[#DDF4FF] px-2 py-0.5 text-[11px] font-semibold text-[#0969DA]">résumé uploaded</span>
        </div>
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gh-fgMuted">
            {phase === "reading" ? "Recognizing skills…" : "Recognized skills"}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {RESUME.skills.map((s, i) => {
              const shown = i < recognized;
              const inMatch = best.matched.some((m) => s.toLowerCase().includes(m) || m.includes(s.toLowerCase()));
              return (
                <span key={s}
                  className="rounded-full px-2 py-0.5 text-xs font-medium transition-all"
                  style={{
                    opacity: shown ? 1 : 0.15,
                    background: shown && phase === "matched" && inMatch ? "#0969DA14" : "#EAEEF2",
                    color: shown && phase === "matched" && inMatch ? "#0969DA" : "#57606A",
                    boxShadow: shown && phase === "matched" && inMatch ? "inset 0 0 0 1px #0969DA55" : undefined,
                  }}>
                  {s}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {/* the match */}
      {phase === "matched" ? (
        <section className="mt-4 rounded-md border border-[#1F883D] bg-white p-4" style={{ boxShadow: "0 0 0 1px #1F883D" }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#1A7F37]">Matched · Keeper planning</p>
          <p className="mt-1 text-sm text-gh-fg">
            Assigned <b>{RESUME.name}</b> to the best-fit spec — <span className="text-gh-fgMuted">match {Math.round(score * 100)}%</span>
          </p>
          <div className="mt-3 rounded-[3px] bg-gh-canvasInset p-3">
            <p className="text-sm font-semibold text-gh-fg">{best.t.title}</p>
            <p className="mt-1 text-xs text-gh-fgMuted">{best.t.body}</p>
            <p className="mt-2 text-xs text-gh-fgMuted">
              Why: résumé skills <b className="text-[#0969DA]">{best.matched.join(", ")}</b> cover this spec.
            </p>
          </div>
          <button
            type="button"
            onClick={start}
            disabled={starting}
            className="mt-3 w-full rounded-md bg-[#1F883D] px-3 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
          >
            {starting ? "Handing off…" : "Hand to the autonomous agent →"}
          </button>
          <p className="mt-2 text-center text-[11px] text-gh-fgMuted">
            Keeper writes the spec, the agent implements & reviews it — no human from here.
          </p>
        </section>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-gh-fgMuted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gh-border border-t-[#1F883D]" />
          Matching to the open backlog…
        </p>
      )}
    </main>
  );
}
