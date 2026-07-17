# Engineer B — Frontend Data Layer + Home & Issue Wiring

**Branch:** `eng-b-frontend-wiring` (off `frontend`)
**Read first:** `docs/HANDOFF-round2.md` (§1–§4, §6), the frozen contract
(`git show origin/mainbackend:src/contract/api.ts` and `:src/contract/events.ts`),
and the existing pages `client/pages/Index.tsx` + `client/pages/AgentIssue.tsx`.

You own the **data spine of the frontend**: the single fetch/hook module everyone imports, and the
two existing screens (Home + Issue). Today every screen is hardcoded "Lorem ipsum" — you make it
real. React Query + `QueryClientProvider` are already wired in `client/App.tsx`.

## Files you OWN (only you edit these)
- `client/lib/keeper.ts` — **NEW.** The one place fetches live.
  `const API = import.meta.env.VITE_KEEPER_API ?? "http://localhost:8787/api/v1"`.
  Export typed React Query hooks — **C imports these, so keep the signatures stable:**
  `useCreateIssue()`, `useIssues(params?)`, `useIssue(id)`, `useEvents(issueId?)` (incremental —
  poll `GET /events?since=<maxTs>` every 2s, keep max ts as `since`, never full-refetch),
  `useStats()`, `usePhases(id)`, `useTriggerCi(id)` (`POST /webhooks/ci.completed {status:"failure"}`).
- `client/lib/phases.ts` — **NEW.** `derivePhases(events, issueId): PhaseView` — the client-side fold,
  **same rules as handoff §5.2** (planning passed on `plan.created`; implementation from
  branch/push/ci/`plan.revised`/merge; review from `scan.started`; `merge_blocked = !(all passed)`).
  `usePhases(id)` tries `GET /issues/:id/phases`; on **404**, falls back to `derivePhases`. Same props
  either way — one-line swap when Engineer A ships the real endpoint.
- `client/pages/Index.tsx` — Composer **Send** → `useCreateIssue` → `navigate('/issue?id='+issue_id)`.
  Feed → `useIssues()`, one card per issue with a **human vs 🤖 keeper provenance badge**. AI
  suggestion cards → `useIssues({provenance:'keeper_scanner'})`. Live counter → `useStats()`
  (`human_filed` vs `keeper_filed`). Connect/Upload buttons may stay visual-only if time-short.
- `client/pages/AgentIssue.tsx` — header + kickoff from `useIssue(id)`; timeline comment cards from
  `useEvents(id)` mapped per handoff §4 table (recall.hit "#412", route.assigned "Assigned Marco —
  blame > résumé", plan.created, scan.found …), **plus a `tool.discovered` card** (Zero sponsor):
  "🧰 Zero discovered a tool — **{tool_name}**: {why}." Drive `PlanningCard` section status and the
  `MergeChecks` gate from `usePhases(id)` — gate locked until `merge_blocked` is false.

## Files you IMPORT but never edit
Existing components (`CommentCard`, `Timeline`, `Layout`, `SiteHeader`, shadcn `components/ui/*`),
`client/lib/utils.ts`. **Do NOT touch `client/App.tsx`** — Engineer C owns routing so your lanes
never collide.

## Definition of done (handoff §8, items 1–3 & 5)
1. Type a bug → Send → a **real** issue is created → routes to `/issue?id=`.
2. Issue page streams real cards from live events; assignee line reads "Assigned Marco — blame > résumé".
3. Phases advance and the **merge gate stays locked until all three pass** (real endpoint or derived).
4. Home counter shows `keeper_filed` climbing after a merge files scanner issues.
5. `keeper.ts` compiles and exports every hook C's brief lists — verify with `npm run dev` on both apps.

## Do NOT
Fake `provenance` (it IS the autonomy counter). Refetch the whole `/events` list each tick — use
`since`. Change contract field names. Edit `client/App.tsx` or anything under `client/pages/Execution*`
or `client/components/execution/*` — those are Engineer C's.

## Contract you publish to C
The exact hook names, arguments, and return shapes exported from `client/lib/keeper.ts`. Post them in
the channel the moment the file compiles so C can build Screen 3 against real signatures.
