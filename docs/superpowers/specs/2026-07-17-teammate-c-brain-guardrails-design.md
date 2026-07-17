# Teammate C — Brain & Guardrails — Design

**Date:** 2026-07-17
**Owner:** Teammate C (branch `teammate-c`)
**Scope:** LLM planner, recursive decomposer, `LlmClient`, Pomerium write-guard, Zero.xyz tool discovery.
**Sponsors:** Pomerium (write authorization) + Zero.xyz (open tool discovery).

---

## 1. Goal

Turn a *located* issue into a real `Plan` artifact, split oversized plans into child issues that
**re-enter the loop** with no human, and wrap **every write** in Pomerium so Keeper physically cannot
act outside its `file_boundary` or exceed its filing budget. Give the scanner an **open** action space
via Zero.xyz mid-loop tool discovery.

Non-goals (explicitly out): real code fixes/diffs (Keeper emits specs, not patches), `watcher`,
`invalidator`, anything in another teammate's lane, any edit to `src/contract/` (frozen).

## 2. Guiding constraints (from `AGENTS.md` + role doc)

- `src/contract/` is **frozen**. Implement its interfaces exactly; emit its exact payload shapes.
- Stay in owned files. Import A's `Store`/`EventBus` and B's `NexlaContext` **through their interfaces**,
  never their concrete code. Ship stubs of `LlmClient` + `PomeriumGuard` **first** so A/B unblock.
- Every action calls `store.appendEvent(...)`. The frontend's trace + counters read `loop_events`.
- Plans are **versioned, never overwritten** (`revised_because` documents each new version).
- Provenance is two-tiered (see §4).

## 3. Architecture: one seam, two adapters per sponsor

Genuine sponsor SDK/API calls are the **primary** path; a deterministic local **fallback** is the
safety net so a live demo cannot die on a flaky network/stage. Both sit behind the *same frozen
interface*, so the spine and every demo event are byte-identical regardless of which runs.

```
KEEPER_INTEGRATIONS = real | fallback     (default: real)

PomeriumGuard  ── real:     @pomerium/js-sdk (verify assertion) + boundary + rolling-hour cap
               └─ fallback: in-process boundary check + rolling-hour cap
ToolDiscovery  ── real:     Zero.xyz discovery (HTTP/x402, Node 20 fetch) → returns tool + run()
               └─ fallback: curated signal→tool map (Terraform→IaC scanner, CVE→dep scanner, …)
LlmClient      ── @anthropic-ai/sdk, model claude-opus-4-8, key/proxy from env
               └─ (optional) Zero.xyz-routed access; Anthropic-direct is primary
```

`KEEPER_INTEGRATIONS` is read once at construction; each factory returns the matching adapter. The
enforcement *result* (authorized/denied, tool found/gap) and the emitted `loop_events` are identical
across adapters — only the mechanism differs. This is how we "commit to genuine SDK calls" (option 2)
while keeping option 3 one env var away.

## 4. Provenance model (do not conflate)

The contract uses **two different provenance vocabularies** — respect both:

- **Issue records & `issue.created` payloads** → fine-grained `Provenance`:
  `"human" | "keeper_decomposer" | "keeper_scanner"`.
- **`loop_events` rows & `BusEvent.provenance`** → coarse: `"human" | "keeper" | null`.

Decomposer files children with issue-provenance `"keeper_decomposer"`; the matching `loop_events`
row uses coarse `"keeper"`. This drives the frontend `keeper_filed` counter correctly.

## 5. Modules

### 5.1 `src/llm/index.ts` — `LlmClient`
Implements the frozen interface exactly:
- `complete(prompt, opts?) → Promise<string>`
- `completeJson<T>(prompt, opts?) → Promise<T>`

Details:
- `@anthropic-ai/sdk`, default model `claude-opus-4-8`; `system`/`model` overridable via `opts`.
- Key/proxy from env (`ANTHROPIC_API_KEY`, optional `ANTHROPIC_BASE_URL` for a Zero.xyz proxy) —
  never hardcoded. "Access unblocked by Zero.xyz" is honored via env-configured base URL/key.
- `completeJson` forces structured output (tool/JSON-schema or strict "return only JSON" + parse with
  one repair retry) so planner output always conforms. Throw on unrecoverable parse failure — callers
  treat a throw as "do not emit."

### 5.2 `src/services/planner.ts`
- **Subscribes:** `locate.done` (`LocateDonePayload {issue_id, file_boundary, blame[]}`).
- Gathers context: `prior_art` from the issue's latest `recall.hit` (`RecallHitPayload.prior_art`,
  read from store/last event); `file_boundary` seed + `blame` from `locate.done`.
- Calls `llm.completeJson<PlanBrain>()` to produce the *reasoning* fields:
  `root_cause_hypothesis`, refined `file_boundary` (⊆ locate's), `blast_radius {call_sites,
  services_affected}`, `legacy_checklist[]`, `test_strategy`, and a boolean `too_large` verdict.
- **Assignee**: filled via B's `NexlaContext.whoHasContext(primaryPath)` (interface-first; falls back
  to a placeholder assignee if Nexla not yet wired, so we're never blocked). The router still emits
  the authoritative `route.assigned` — the plan carries a best-effort assignee to satisfy `PlanRecord`.
- **Sizer:** `too_large` = LLM verdict **OR** `file_boundary.length > SIZE_THRESHOLD` (config, default 5)
  **OR** `blast_radius.call_sites > CALLSITE_THRESHOLD`. Deterministic override guarantees the demo's
  Loop-2 trigger regardless of LLM mood.
- **Guardrail:** empty `file_boundary` ⇒ **do not emit**; log and stop (no unbounded write scope).
- Inserts a **new** `PlanRecord` version via `store.insertPlan` (never overwrite; `revised_because`
  null on first, set on revisions). Always emits `plan.created {issue_id, plan_id, version, too_large}`
  and appends a `loop_event`. If `too_large`, **also** emits `plan.too_large` (decomposer trigger).
- **Revision path (lighter):** re-trigger on `ci.failed` / `main.merged` → new version with
  `revised_because` (e.g. `"ci_failure:run_8871"`) → emit `plan.revised`.

### 5.3 `src/services/decomposer.ts`
- **Subscribes:** `plan.too_large`.
- Calls `llm.completeJson<ChildSpec[]>()` to split the parent plan into **≤3** child issues, each with
  a **disjoint, smaller `file_boundary`** (enforced in code: cap at 3, drop empties).
- Each child filed **through Pomerium** (`authorizeWrite({action:"file_issue", identity:"keeper",
  scope: childBoundary, reason, issue_id: childId})`). If denied → escalate (log + `pomerium.denied`
  already emitted by guard), do **not** create the issue.
- On authorize: `store.upsertIssue` a child `IssueRecord` (`provenance:"keeper_decomposer"`,
  `parent_issue: parentId`, `state:"open"`), push child id into parent's `children`, and publish
  `issue.created {..., provenance:"keeper_decomposer", parent_issue}` → **Loop 2 re-entry**.
- **Termination:** children have strictly smaller boundaries, so recursion bottoms out when every leaf
  is small enough (sizer returns `too_large:false`). No artificial depth cap needed, but a
  `MAX_DEPTH` guard (default 3) is added as a runaway backstop and logged if hit.

### 5.4 `src/pomerium/index.ts` — `PomeriumGuard`
Implements `authorizeWrite(req) → Promise<boolean>` exactly. `req = {action, identity, scope[],
reason, issue_id?}`.
- **Boundary check** (actions `branch`/`comment`/`assign` — actual repo/code writes):
  `scope ⊆ latestPlan(issue_id).file_boundary`. Any path outside ⇒ deny + emit `boundary.violated`
  and `pomerium.denied`. (`file_issue` is *not* a file write, so no boundary check applies to it — the
  child-scope ⊆ parent-boundary invariant is enforced by the decomposer in code, not by the guard.)
- **Filing cap** (action `file_issue`): count `file_issue` authorizations in the rolling last hour
  (from `loop_events` / in-guard ring buffer). 6th within an hour ⇒ deny + `pomerium.denied`
  (this is the t=2:30 demo beat: escalation logged, no crash).
- **Real adapter:** verify `X-Pomerium-Jwt-Assertion` via `@pomerium/js-sdk` `PomeriumVerifier`
  (proves the write came through the Pomerium proxy under policy) *then* apply boundary+cap.
  **Fallback adapter:** boundary+cap only, in-process.
- On pass: emit `pomerium.authorized`, append audit `loop_event`, return `true`.
- On any fail: emit `pomerium.denied` (+ `boundary.violated` when applicable), audit line, return
  `false`. **Caller must escalate, not execute.**
- Depends on `Store` (for `latestPlan` + `appendEvent`) injected at construction.

### 5.5 `src/zero/index.ts` — `ToolDiscovery`
Implements `discoverTool({signal, hint?}) → Promise<{tool_name, why, run}>`.
- **Real adapter:** query Zero.xyz to discover a service matching `signal` (Node 20 `fetch`, x402 /
  MCP endpoint; `ZERO_API_URL` / credit from env). Return its `tool_name`, a `why`, and a `run(input)`
  that invokes the discovered tool and normalizes output to `{findings: string[]}`.
- **Fallback adapter:** curated `signal→tool` map — `terraform`/`.tf` → IaC misconfig scanner,
  `cve`/`dependency` → dep-audit, unknown language → generic linter. `run()` returns deterministic
  findings sufficient for the demo (the t=1:40 close: `.tf` misconfig → scanner files a new issue).
- Emits a `gap.detected` loop_event when invoked for a signal Keeper wasn't pre-wired for (proof the
  action space is **open**). Actual `scan.started`/`scan.found` remain the scanner's (Teammate A).

## 6. Wiring (composition, in `src/index.ts` — A owns; C exports factories)

C exports pure factory functions; A wires them in `src/index.ts`:
```
makeLlmClient(env)                         → LlmClient
makePomeriumGuard(store, env)              → PomeriumGuard
makeToolDiscovery(env)                     → ToolDiscovery
registerPlanner(bus, store, llm, nexla)    → subscribes locate.done
registerDecomposer(bus, store, llm, guard) → subscribes plan.too_large
```
No C module constructs A/B concretes; all deps arrive via interface params. This is the "ship stubs
first" unblock: stub factories return interface-conformant no-op-ish adapters immediately.

## 7. Config / env

| Var | Purpose | Default |
|---|---|---|
| `KEEPER_INTEGRATIONS` | `real` \| `fallback` adapter select | `real` |
| `ANTHROPIC_API_KEY` | Claude key (via Zero access) | — (required for real LLM) |
| `ANTHROPIC_BASE_URL` | optional Zero.xyz proxy base | unset |
| `ZERO_API_URL` | Zero.xyz discovery endpoint | — |
| `POMERIUM_JWKS_URL` / issuer / audience | assertion verification (real) | — |
| `PLAN_SIZE_THRESHOLD` | file_boundary size → too_large | 5 |
| `FILING_CAP_PER_HOUR` | Pomerium file_issue cap | 5 |
| `MAX_DECOMP_DEPTH` | decomposer runaway backstop | 3 |

Adding `@pomerium/js-sdk` to `package.json` (shared root — coordinate with team; not a `contract/`
edit). Zero.xyz uses Node 20 `fetch`, no new dep.

## 8. Error handling & guardrails (summary)

- LLM parse failure → throw → caller does not emit (no malformed plan on the bus).
- Empty `file_boundary` → planner blocks emit.
- Decomposer caps children at 3, drops empty boundaries, `MAX_DEPTH` backstop.
- Pomerium denies outside-boundary writes and the 6th filing/hour; caller escalates.
- Zero `run()` output normalized; `gap.detected` logged for unknown signals.
- Every module `store.appendEvent(...)` on every action (audit trail is the demo).

## 9. Testing / verification

- **Unit (fast, no network):** run everything with `KEEPER_INTEGRATIONS=fallback`.
  - planner: `locate.done` in → asserts `plan.created{too_large}` + `PlanRecord` inserted (new
    version, not overwritten); oversized input → also `plan.too_large`.
  - decomposer: `plan.too_large` → ≤3 `issue.created` w/ `keeper_decomposer`, parent `children` updated,
    smaller boundaries, terminates.
  - pomerium: in-boundary → `pomerium.authorized`+true; out-of-boundary → `boundary.violated`+`denied`+false;
    6th `file_issue`/hour → `denied`+false.
  - zero: `terraform` signal → IaC scanner tool + findings.
- **Integration smoke:** boot spine with stubs; drive one `issue.created` through to a decomposer
  re-entry; confirm `keeper_filed` counter increments and Loop-2 fires.
- **Real-adapter check (pre-demo):** flip `KEEPER_INTEGRATIONS=real`, verify Anthropic call,
  Pomerium assertion verify, and one live Zero.xyz discovery; then decide real-vs-fallback for stage.

## 10. Definition of Done (from role doc)

1. Planner emits a `Plan` matching `src/contract/api.ts` exactly.
2. Sizer fires `plan.too_large`; decomposer files children that re-enter Loop 1 (Loop 2 works).
3. Pomerium blocks an out-of-boundary write and denies the 6th issue/hour with `pomerium.denied`.
4. `discoverTool()` returns an IaC scanner for a Terraform signal.
5. Stubs of `LlmClient` + `PomeriumGuard` shipped first so A/B integrate unblocked.
