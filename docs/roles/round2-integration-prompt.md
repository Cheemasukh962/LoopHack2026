# Round-2 Integration Agent — copy-paste prompt

Give this to the AI agent doing the frontend↔backend integration.

---

```
You are the integration engineer for "Keeper," a loop-engineering hackathon demo that submits at
4:30 PM today. Two halves have been built separately and have NEVER been connected: a working
event-driven backend (branch `mainbackend`, API on http://localhost:8787/api/v1) and a static
GitHub-styled React frontend (branch `frontend`). Your job is to connect them and add a real
phase-completion loop.

SETUP
  git clone https://github.com/Cheemasukh962/LoopHack2026.git && cd LoopHack2026
  git fetch origin
  # read the handoff (self-contained) + the frozen API contract:
  git show origin/mainbackend:docs/HANDOFF-round2.md
  git show origin/mainbackend:src/contract/api.ts
  git show origin/mainbackend:src/contract/events.ts

READ FIRST: docs/HANDOFF-round2.md (above). Follow it exactly. It defines the API, the shapes, the
phase state machine, the screen→data mapping, and the definition of done.

MISSION (in priority order):
  1. FRONTEND WIRING (branch `frontend`). Add client/lib/keeper.ts (base URL
     import.meta.env.VITE_KEEPER_API ?? "http://localhost:8787/api/v1") + React Query hooks. Then:
       - Home composer Send -> POST /issues {title,body} -> navigate('/issue?id='+issue_id).
       - Home feed -> GET /issues, with a human vs 🤖 keeper provenance badge; counter from GET /stats.
       - Issue page -> GET /issues/:id for the kickoff+plan, and POLL GET /events?since= every 2s to
         render the timeline comment cards (recall.hit "#412", route.assigned "Assigned Marco —
         blame > résumé", plan.created, scan.found). Reuse the existing PlanningCard + MergeChecks.
  2. PHASES. Drive PlanningCard's Planning/Implementation/Review status and the MergeChecks gate from
     usePhases(id): try GET /issues/:id/phases; if it 404s, DERIVE phases client-side from the event
     stream using the same rules (handoff §5.2/§6). merge_blocked locks the gate until all 3 pass.
  3. SCREEN 3 (new route /execution?id=). Show the assignee executing the plan (file_boundary),
     the implementation phase, and the self-correction beat: trigger ci.failed
     (POST /webhooks/ci.completed {status:"failure"}) -> error state -> Keeper re-plans -> phase
     re-activates. This is the loop-engineering money shot.

REAL PHASES IF YOU CAN (preferred), MOCK IF YOU MUST:
  If you also own the backend, implement the phase.updated event + GET /issues/:id/phases +
  src/services/phase-tracker.ts + the ci.failed->plan.revised re-plan handler on `mainbackend`
  exactly as handoff §5 specifies, then wire the frontend to the real endpoint. If backend phases
  aren't ready, ship the client-side derived version (§6) — same component props, one-line swap later.
  It's a demo: real phase events are the goal, derived-from-events is the acceptable fallback. Do NOT
  invent fake phase data that isn't grounded in real loop_events.

HARD RULES:
  - Don't change existing contract shapes/field names. The ONLY sanctioned addition is phase.updated
    + /issues/:id/phases (handoff §5); coordinate it across both branches.
  - provenance ("human" vs "keeper_*") is the autonomy counter — never fake it.
  - Keeper files specs, never code. Screen 3 shows execution + re-plan, not Keeper editing files.
  - Poll /events with `since` (incremental), not full refetches.
  - Run BOTH apps together and verify the handoff §8 definition-of-done end to end before you call it done.
  - Commit and push often to your branch.

DONE = the handoff §8 checklist passes live: type a bug -> real issue -> streamed plan/route ->
gate locked until phases pass -> ci.failed -> auto re-plan -> keeper_filed counter climbing.
```
