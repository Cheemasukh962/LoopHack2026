# Keeper — Round 2 Handoff: Connect Frontend ↔ Backend + Phase-Completion Loop

**Read this fully before writing code.** It is self-contained: an agent working on the `frontend`
branch can execute from this doc alone.

Submission is **4:30 PM today**. The loop already works on the backend — this round makes it
**visible** and adds the phase state machine that powers the demo's "you can't merge until every
phase passes" gate.

---

## 0. TL;DR — what you are building

1. **Wire the frontend to the real backend** (today it calls nothing — every screen is hardcoded).
2. **Add real phase-completion events** on the backend (`planning → implementation → review`) so the
   Issue page's merge-gate is driven by the loop, not by mock state.
3. **Build Screen 3** (execution / push-back / error) — the self-correction beat that makes this
   *loop engineering*: CI goes red → Keeper re-plans → the phase re-activates, all on its own.

If the backend phase endpoint isn't ready when you wire the frontend, **derive phases client-side
from the event stream** (same fold, see §6). Ship against the derived version, switch to the real
endpoint when it lands. Never block the frontend on the backend.

---

## 1. Current state

### Backend — branch `mainbackend` (works, verified live)
- Node + TypeScript, one process. `npm install && npm run dev` → **API on `http://localhost:8787/api/v1`** (CORS `*` already on).
- The full loop runs: `issue.created → recall.hit → locate.done → plan.created → route.assigned`, and
  `branch.merged → scan → files keeper_scanner issues → re-enter the loop`. 37/37 tests pass.
- Runs on a **fallback LLM** unless `ANTHROPIC_API_KEY` is set (plumbing is real; wire the key for real plans).
- Every action appends to `loop_events`. **The frontend's entire live view is a poll of `GET /events`.**

### Frontend — branch `frontend` (visual shell only)
- `fusion-starter`: React + Vite + Tailwind + shadcn/ui + React Query + React Router. Its own Express
  server exists but is unrelated — **ignore `server/routes/demo.ts` for Keeper data; call `:8787` directly.**
- Routes: `/` (`client/pages/Index.tsx`) and `/issue` (`client/pages/AgentIssue.tsx`). No Screen 3.
- **Zero data wiring** — all content is hardcoded ("Lorem ipsum"). The components you need already exist:
  - `Index.tsx`: `Sidebar` (Connect Github / Upload Resume), `Composer` (the input + Send), `FeedCard`.
  - `AgentIssue.tsx`: `PlanningCard` (Planning / Implementation / Review sections) and `MergeChecks`
    ("3 phases awaiting — complete all before you can merge"). **The gate UI is already built** — it
    just needs real phase data as props.

---

## 2. The API you consume (frozen contract — `mainbackend:src/contract/api.ts`)

Base: `http://localhost:8787/api/v1`

```
POST /issues                 { title, body }            -> { issue_id }         # composer Send
GET  /issues        ?provenance=&state=                 -> IssueSummary[]        # feed + suggestion cards
GET  /issues/:id                                        -> { issue, plan, versions }
GET  /issues/:id/tree                                   -> { root, children }    # decomposed children
GET  /issues/:id/phases                                 -> PhaseView            # NEW (this round, §5)
GET  /plans/:id                                         -> Plan
GET  /stats                                             -> { human_filed, keeper_filed, plans_revised, branches_open }
GET  /events        ?since=<iso ts>                     -> LoopEvent[]          # POLL every 2s
POST /people/:id/resume   (multipart)                   -> { parsed }           # Upload Resume
POST /repos/connect       { repo_url }                  -> { repo_id, status }  # Connect Github
POST /webhooks/:type      { ... }                       -> { accepted }         # demo drivers (merge, ci)
```

Key shapes (full definitions in the backend contract file):
```ts
IssueSummary { issue_id, title, state, provenance: "human"|"keeper_decomposer"|"keeper_scanner",
               parent_issue, assignee: {person_id,name,context_score}|null, plan_version, branch }
LoopEvent    { event_id, ts, type, issue_id, provenance: "human"|"keeper"|null, payload }
Plan         { plan_id, issue_id, version, revised_because, prior_art[], root_cause_hypothesis,
               file_boundary[], blast_radius, legacy_checklist[], test_strategy, assignee{...,why} }
```
`provenance` is the autonomy counter: `human` = a person filed it; `keeper_*` = the agent filed it.
Show `keeper_filed` climbing on stage — that IS the pitch.

Event `type` values you will render: `issue.created`, `recall.hit`, `locate.done`, `plan.created`,
`plan.too_large`, `route.assigned`, `branch.created`, `branch.merged`, `scan.started`, `scan.found`,
`pomerium.authorized`, `pomerium.denied`, `boundary.violated`, `ci.failed`, `plan.revised`,
and the new `phase.updated`.

---

## 3. Map the vision to the data

| Screen | Component (exists) | Data source |
|---|---|---|
| **1 Home** | `Composer` Send | `POST /issues {title,body}` → `navigate('/issue?id='+issue_id)` |
| | `FeedCard` list | `GET /issues` → one card per issue, provenance badge (human vs 🤖 keeper) |
| | AI suggestion cards | `GET /issues?provenance=keeper_scanner` (issues Keeper filed for you) |
| | Connect / Upload buttons | `POST /repos/connect`, `POST /people/:id/resume` (or visual-only if time-short) |
| | live counter | `GET /stats` → `human_filed` vs `keeper_filed` |
| **2 Issue** | header + kickoff `CommentCard` | `GET /issues/:id` → title/body/assignee |
| | timeline comment cards | `GET /events?since=` filtered to this `issue_id` (recall.hit, route.assigned, …) |
| | `PlanningCard` sections | `GET /issues/:id/phases` → status per phase |
| | `MergeChecks` gate | `phases.merge_blocked` → locked until all three `passed` |
| **3 Execution** | NEW page `/execution?id=` | `phases` (implementation focus) + events; shows CI-red error + auto re-plan |

---

## 4. Timeline: turn events into comment cards (Screen 2)

Poll `GET /events?since=<lastTs>` every 2s; keep the max `ts` as `since`. For events matching the open
issue's `issue_id`, render a comment card:

| event `type` | Card copy |
|---|---|
| `recall.hit` | "🔎 Found prior art — **{top_hit}** and {n-1} similar past issues." |
| `locate.done` | "📍 Root cause localized to `{file_boundary…}` (blame: {last_author})." |
| `plan.created` | "📝 Drafted a plan v{version}: {root_cause_hypothesis}." |
| `plan.too_large` | "✂️ Plan too large — decomposing into sub-issues." |
| `route.assigned` | "👤 Assigned **{assignee.name}** — {why}." |
| `scan.found` | "🐛 Post-merge scan filed a new issue: {title}." |
| `pomerium.denied` | "🛡️ Pomerium blocked a write — {why}." |

---

## 5. NEW backend work — real phase-completion (do this on `mainbackend`)

Goal: a **projection over `loop_events`** that advances `planning → implementation → review` and locks
the merge gate until all pass. This is real loop engineering: the state machine is driven by the bus,
and a CI failure self-corrects.

### 5.1 New event + endpoint (coordinated contract addition — allowed this round)
- Add `"phase.updated"` to `EventType` in `src/contract/events.ts`.
- Shape: `phase.updated` payload `{ issue_id, phase, status, detail }`
  where `phase ∈ {planning, implementation, review}`, `status ∈ {pending, active, passed, failed}`.
- Add endpoint `GET /api/v1/issues/:id/phases` → **PhaseView**:
```ts
PhaseView {
  issue_id: string;
  phases: { phase: "planning"|"implementation"|"review"; status: "pending"|"active"|"passed"|"failed"; detail: string; updated_at: string }[];
  merge_blocked: boolean;      // true unless all three are "passed"
  blocking_reason: string|null;
}
```
Implement `/phases` as a **fold over `store.getEvents()`** filtered to `phase.updated` for that issue
(latest status per phase). No Store interface change needed.

### 5.2 New service `src/services/phase-tracker.ts` — the state machine
Subscribe to existing events; emit `phase.updated` on each transition (and `store.appendEvent`):

| Trigger event | Transition |
|---|---|
| `issue.created` | planning → **active** (implementation/review → pending) |
| `plan.created` | planning → **passed**; implementation → **active** |
| `route.assigned` | implementation → active (detail: assignee) |
| `branch.created` / `push` | implementation → active (detail: branch/commit) |
| `ci.failed` | implementation → **failed** (Screen 3 error state) |
| `plan.revised` | implementation → **active** (self-corrected → retry) |
| `branch.merged` | implementation → **passed**; review → **active** |
| `scan.started` | review → active |
| review has no open blocking findings | review → **passed** |

When all three are `passed`, the gate opens (`merge_blocked=false`).

### 5.3 Self-correction path for Screen 3 (watcher was cut — add this minimal version)
- Gateway already turns `POST /webhooks/ci.completed {status:"failure"}` into a `ci.failed` event.
- Add a tiny re-plan handler (in `phase-tracker` or a mini `watcher`): on `ci.failed`, insert a new
  plan **version** with `revised_because:"ci_failure:<run>"` and emit `plan.revised`. That flips
  implementation `failed → active` — **the loop fixes itself, on stage, with no human.**

---

## 6. Frontend fallback if `/phases` isn't ready (mock, but derived — not fake)

Ship the exact same fold **client-side** from `GET /events`, so the UI works before the backend
endpoint lands and needs a one-line swap after:
```ts
// derivePhases(events for issueId) -> PhaseView  (same rules as §5.2)
// planning passed once a plan.created seen; implementation from branch/ci/merge; review from scan.
// merge_blocked = !(all three passed)
```
Wrap it: `usePhases(id)` tries `GET /issues/:id/phases`; on 404, falls back to `derivePhases(events)`.
Same component props either way. **This is the "real if we can, mock if we must" the demo needs.**

---

## 7. Run both together
```bash
# terminal 1 — backend
cd LoopHack2026 && git checkout mainbackend && npm install && npm run dev      # :8787

# terminal 2 — frontend
git checkout frontend && npm install && npm run dev                            # vite (:8080 or :5173)
```
Frontend base URL: `const API = import.meta.env.VITE_KEEPER_API ?? "http://localhost:8787/api/v1"`.
CORS is already open on the backend. Put all fetches in `client/lib/keeper.ts`.

---

## 8. Definition of done (the demo has to show this)
1. Type a bug into the composer → Send → a real issue is created → route to its Issue page.
2. Issue page streams real cards: recall (#412), plan, **"Assigned Marco — blame > résumé"**.
3. Phases advance and the **merge gate stays locked until all three pass** — driven by events.
4. Screen 3: trigger `ci.failed` → error state → **Keeper re-plans automatically** → phase re-activates.
5. Home counter shows `keeper_filed` climbing after a merge (scanner files its own issues).

## 9. Guardrails
- Don't change existing contract shapes/field names — the only sanctioned addition this round is
  `phase.updated` + `/issues/:id/phases` (§5). Coordinate it across both branches.
- `provenance` is sacred: `human` vs `keeper_*` drives the counter. Never fake it.
- Keeper files **specs, never code**. Screen 3 shows execution + re-plan, not Keeper editing files.
- Poll `/events` with `since` (don't refetch the whole list each tick).
```
