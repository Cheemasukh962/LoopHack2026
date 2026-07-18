// Client-side orchestration state for the phase animation on the detail page.
//
// This is a DEMO concern, kept separate from the contract API in keeper.ts:
// the real backend would derive phase progress from the event stream
// (plan.created, ci.completed, branch.merged, …). Here we persist a few
// milestones in localStorage so the flow survives navigation to the execution
// screen and back, plus reloads.

export type PhaseKey = "planning" | "implementation" | "review";

export interface RunProgress {
  intakeDone: boolean; // clarifying questions answered + description written
  description: string; // AI-written description from the intake answers
  planningDone: boolean;
  implementationDone: boolean;
  reviewDone: boolean;
  stopped: boolean;
  planVersion: number;
}

const DEFAULT_PROGRESS: RunProgress = {
  intakeDone: false,
  description: "",
  planningDone: false,
  implementationDone: false,
  reviewDone: false,
  stopped: false,
  planVersion: 1,
};

const STORE_KEY = "keeper.run.v1";

function readAll(): Record<string, RunProgress> {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function getRun(issueId: string): RunProgress {
  return { ...DEFAULT_PROGRESS, ...readAll()[issueId] };
}

export function setRun(issueId: string, patch: Partial<RunProgress>): RunProgress {
  const all = readAll();
  const next = { ...DEFAULT_PROGRESS, ...all[issueId], ...patch };
  all[issueId] = next;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  }
  return next;
}

/** A line in the "working" status stream, tied 1:1 to a Keeper event type. */
export interface PhaseStep {
  label: string; // present tense, shown live while working
  done: string; // past tense, shown on the timeline after it completes
  event: string; // matches EventType in the frozen contract
}

// What the AI is "doing" while a phase runs. These map to the event names the
// real backend emits, so the demo mirrors the actual bus traffic.
export const PLANNING_STEPS: PhaseStep[] = [
  { label: "Recalling prior art…", done: "Recalled prior issues", event: "recall.hit" },
  { label: "Scoping the blast radius…", done: "Scoped the files + blast radius", event: "locate.done" },
  { label: "Writing acceptance criteria…", done: "Wrote acceptance criteria", event: "plan.created" },
  { label: "Breaking it into subtasks…", done: "Broke it into subtasks", event: "plan.created" },
  { label: "Assigning by skill…", done: "Assigned the owner", event: "route.assigned" },
];

// Implementation now runs autonomously — the AI writes the change and base code.
export const IMPLEMENTATION_STEPS: PhaseStep[] = [
  { label: "Opening a working branch…", done: "Opened a working branch", event: "branch.created" },
  { label: "Writing the change…", done: "Wrote the change", event: "push" },
  { label: "Generating base code…", done: "Generated base code to start from", event: "push" },
  { label: "Running the test suite…", done: "Tests passed", event: "ci.completed" },
];

/** Milliseconds each status line is shown before advancing. */
export const STEP_MS = 850;
