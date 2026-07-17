# AGENTS.md — rules for every AI agent working in this repo

You are one of three agents building **Keeper** for a hackathon that submits at **4:30 PM today**.
Read this fully before writing code.

## 0. Find your job
Your branch is `teammate-a`, `teammate-b`, or `teammate-c`.
**Open `docs/roles/<your-branch>.md` and do exactly what it says. Stay in your lane.**
Then skim `docs/PLAN.md` for the full picture and the 3-minute demo you are building toward.

## 1. The one thing that must work
A human files **one** issue → the system runs the whole loop on its own → after a merge, the
**`scanner` files brand-new issues that re-enter the loop with no human**. That closing loop
(**Loop 5**) is the entire pitch. If you have to choose, protect it. Cut anything else first.

## 2. Hard rules
- **`src/contract/` is FROZEN.** It is shared with the frontend team. Do **not** change a type,
  field name, event name, or endpoint shape. If you think you must, stop and tell the lead first.
- **Stay in the files your role owns.** Import from others; never edit their files. This is how
  three agents work in parallel without merge conflicts.
- **Every service writes to `loop_events` on every action** (via `store.appendEvent(...)`).
  The frontend's entire trace view is a read of that table. No event = invisible on stage.
- **Code against the interfaces in `src/contract/interfaces.ts`**, not against each other's
  concrete files. That way you are never blocked waiting on another agent — stub and move on.
- **`provenance` is sacred**: `"human"` for the seed issue, `"keeper_decomposer"` for children,
  `"keeper_scanner"` for scanner-filed issues. It drives the frontend counter — never fake it.
- **Never overwrite a plan.** Always insert a new `version` with `revised_because` set.

## 3. Stack (already decided — do not relitigate)
- Node 20 + TypeScript, run with `tsx`. No build step.
- Event bus + store are **in-memory**, single process. Seed from `src/seed/seed.json`.
- API is **Express**, base path `/api/v1`, port `8787`.
- LLM = **Claude API** via `@anthropic-ai/sdk`, access unblocked by **Zero.xyz**. Model:
  `claude-opus-4-8` for planning/scanning; a smaller model is fine for resume parsing.
  Read the API key from `process.env.ANTHROPIC_API_KEY` (or the Zero proxy env). Never hardcode keys.

## 4. Cut order (apply from the START, not at the end)
Cut in this order if you run low on time: `watcher` → `invalidator` → `graph`/gap-detection →
identity resolution (**hand-map identities in the seed**). **Never cut `scanner`.**

## 5. Definition of "done" for any service
1. It subscribes to its trigger event(s) and publishes its output event(s).
2. It writes a `loop_events` row on every action.
3. Its output matches the shapes in `src/contract/`.
4. You ran it and watched the event flow — not "it should work", but "I saw it fire".

## 6. Sponsors — where each lives (so you don't step on each other)
- **Zero.xyz** (Teammate C): unblocks the Claude API + a `discoverTool()` helper the scanner calls mid-loop.
- **Pomerium** (Teammate C): a guard that wraps every write — file-boundary + ≤5 issues/hour cap + audit.
- **Nexla** (Teammate B): the "who has context on this path?" ownership + history layer feeding the router.
- Akash + Fillmore: **one sentence each in the pitch. Do not build for them.**
