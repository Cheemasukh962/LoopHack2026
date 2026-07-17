# Round-2 Work Split & Recombination Guide

Three engineers, three lanes, drawn so the file ownership **never overlaps** — recombination is a
clean fast-forward-ish merge, not a conflict-resolution session. Master spec is
`docs/HANDOFF-round2.md`; the one-page mission is `docs/roles/round2-integration-prompt.md`.

## Branch map
| Lane | Branch | Base | Brief |
|---|---|---|---|
| A — backend phases + self-correction | `eng-a-backend-phases` | `mainbackend` | `round2-eng-a-backend-phases.md` |
| B — frontend data layer + Home/Issue | `eng-b-frontend-wiring` | `frontend` | `round2-eng-b-frontend-wiring.md` |
| C — Screen 3 execution | `eng-c-screen3-execution` | `frontend` | `round2-eng-c-screen3-execution.md` |

## Ownership matrix (who edits what — no file appears twice)
| Path | Owner |
|---|---|
| `src/contract/events.ts` (+`phase.updated`, +`tool.discovered`), `src/contract/api.ts` (`PhaseView`, `Plan.recommended_tool?`) | **A** |
| `src/services/phase-tracker.ts`, `src/services/planner.ts` (Zero wiring), `src/server.ts`, `src/index.ts` | **A** |
| `client/lib/keeper.ts`, `client/lib/phases.ts` | **B** |
| `client/pages/Index.tsx`, `client/pages/AgentIssue.tsx` | **B** |
| `client/App.tsx`, `client/pages/Execution.tsx`, `client/components/execution/*` | **C** |

B and C both branch off `frontend` but touch **disjoint files** (B owns the two existing pages + the
lib; C owns routing + the new page + new components). The only coupling is that C *imports* B's
`keeper.ts` — a read dependency, not a write conflict.

## The two shared contracts (freeze early, post in channel)
1. **`phase.updated` payload + `PhaseView` JSON** — A defines it (handoff §5.1). B's client-side
   `derivePhases` fold must match it exactly so `usePhases` swaps A's real endpoint for the derived
   fallback with one line. Same rules table: handoff §5.2.
2. **`client/lib/keeper.ts` hook signatures** — B defines them (`useCreateIssue`, `useIssues`,
   `useIssue`, `useEvents`, `useStats`, `usePhases`, `useTriggerCi`). C builds Screen 3 against these.
3. **`tool.discovered` payload + `Plan.recommended_tool?`** — A defines it (Zero tool-discovery in
   planning); B renders the Issue-timeline card, C renders it in the Screen 3 re-plan beat. The Zero
   sponsor gets a visible on-screen moment in both the plan and the self-correction.

## Recombination order
1. **Backend:** merge `eng-a-backend-phases` → `mainbackend`. Gate: `npm run dev` boots, 37/37 + new
   tests pass, `GET /issues/:id/phases` returns live data.
2. **Frontend:** merge `eng-b-frontend-wiring` → `frontend` first (it defines `keeper.ts`), then
   `eng-c-screen3-execution` → `frontend`. B-before-C so C's imports resolve. Disjoint files ⇒ no
   conflicts expected.
3. **End-to-end:** run both apps (handoff §7) and walk the §8 definition-of-done live.

## Definition of done (handoff §8 — the whole thing has to show this)
Type a bug → real issue → streamed plan/route ("Assigned Marco — blame > résumé") → merge gate
locked until all three phases pass → `ci.failed` → **Keeper auto re-plans** → phase re-activates →
`keeper_filed` counter climbing after a merge.

## Guardrails (all lanes)
Don't change existing contract shapes/field names — the only sanctioned addition is `phase.updated` +
`/issues/:id/phases`. `provenance` (`human` vs `keeper_*`) is the autonomy counter — never fake it.
Keeper files specs, never code. Poll `/events` with `since`. Commit and push to your own branch often.
