# Teammate C — Brain & Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build teammate C's lane — an LLM planner, a recursive decomposer, and the Pomerium/Zero.xyz guardrails — that turn a located issue into a versioned `Plan`, split oversized plans into child issues that re-enter the loop, and physically gate every write.

**Architecture:** Five modules implement the frozen `LlmClient`, `PomeriumGuard`, and `ToolDiscovery` interfaces plus two event-driven services. Each sponsor module has a deterministic **fallback** adapter (built and tested first, offline) and a **real** SDK adapter selected by `KEEPER_INTEGRATIONS`. Services depend on A's `Store`/`EventBus` and B's `NexlaContext` only through interfaces, tested against in-memory fakes.

**Tech Stack:** Node 20, TypeScript (ESM), `tsx`, `@anthropic-ai/sdk` (`claude-opus-4-8`), `@pomerium/js-sdk` (real adapter), Node built-in test runner via `tsx --test`.

## Global Constraints

- `src/contract/**` is FROZEN — implement its interfaces and emit its exact payload shapes; never edit it.
- Stay in owned files only: `src/llm/`, `src/pomerium/`, `src/zero/`, `src/services/planner.ts`, `src/services/decomposer.ts`, plus C-owned test support in `src/testing/`. Import A's `Store`/`EventBus` and B's `NexlaContext` via `src/contract` interfaces; never their concretes.
- Every service action calls `store.appendEvent(...)`.
- Plans are versioned, never overwritten: `version = (latest?.version ?? 0) + 1`, `revised_because` documents revisions.
- Provenance is two-tiered: issue records / `issue.created` use `"human" | "keeper_decomposer" | "keeper_scanner"`; `loop_events` rows and `BusEvent.provenance` use `"human" | "keeper" | null`.
- Model id is exactly `claude-opus-4-8`. Keys/URLs come from env, never hardcoded.
- Pomerium filing cap is 5 `file_issue` actions per rolling hour (6th denied). Decomposer size cap is ≤3 children.
- Keeper emits specs, not code diffs. Do not build `watcher`/`invalidator`.
- Test runner command form (verified): `npx tsx --test <path/to/file.test.ts>`.

---

### Task 1: Test fakes + test script

In-memory fakes implementing the frozen A/B interfaces, so every later task is testable offline. C-owned test support.

**Files:**
- Create: `src/testing/fakes.ts`
- Modify: `package.json` (add `test` script)
- Test: `src/testing/fakes.test.ts`

**Interfaces:**
- Consumes: `Store`, `EventBus`, `LlmClient`, `NexlaContext`, `LoopEventRecord`, `PlanRecord`, `IssueRecord`, `BusEvent`, `EventType` from `../contract`.
- Produces:
  - `class FakeStore implements Store` — plus `events: LoopEventRecord[]` public field.
  - `class FakeBus implements EventBus` — plus `published: BusEvent[]` and `emit(type, event)` test helper that synchronously invokes subscribers.
  - `class FakeLlm implements LlmClient` — constructed with `{ text?: string; json?: unknown }`; `completeJson` returns `json`, `complete` returns `text`.
  - `class FakeNexla implements NexlaContext` — constructed with a `whoHasContext` result array.

- [ ] **Step 1: Write the failing test**

```typescript
// src/testing/fakes.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeStore, FakeBus, FakeLlm, FakeNexla } from "./fakes.js";

test("FakeStore versions plans and never overwrites", () => {
  const s = new FakeStore();
  s.insertPlan({ plan_id: "p1", issue_id: "i1", version: 1, revised_because: null, prior_art: [], root_cause_hypothesis: "", file_boundary: ["a"], blast_radius: { call_sites: 0, services_affected: 0 }, legacy_checklist: [], test_strategy: "", assignee: { person_id: "x", context_score: 0, why: "" }, created_at: "t" });
  s.insertPlan({ plan_id: "p2", issue_id: "i1", version: 2, revised_because: null, prior_art: [], root_cause_hypothesis: "", file_boundary: ["b"], blast_radius: { call_sites: 0, services_affected: 0 }, legacy_checklist: [], test_strategy: "", assignee: { person_id: "x", context_score: 0, why: "" }, created_at: "t" });
  assert.equal(s.getPlans("i1").length, 2);
  assert.equal(s.latestPlan("i1")?.version, 2);
});

test("FakeStore.appendEvent stamps id + ts and getEvents filters by since", () => {
  const s = new FakeStore();
  const e1 = s.appendEvent({ type: "plan.created", issue_id: "i1", provenance: "keeper", payload: {} });
  assert.ok(e1.event_id && e1.ts);
  assert.equal(s.getEvents().length, 1);
  assert.equal(s.getEvents("zzzz").length, 0);
});

test("FakeBus.emit invokes matching subscribers", () => {
  const bus = new FakeBus();
  const seen: string[] = [];
  bus.subscribe("locate.done", (e) => { seen.push(String(e.issue_id)); });
  bus.emit("locate.done", { type: "locate.done", issue_id: "i9", payload: {} });
  bus.emit("plan.created", { type: "plan.created", issue_id: "iX", payload: {} });
  assert.deepEqual(seen, ["i9"]);
});

test("FakeLlm returns canned json/text and FakeNexla returns owners", async () => {
  const llm = new FakeLlm({ json: { ok: true }, text: "hi" });
  assert.deepEqual(await llm.completeJson("p"), { ok: true });
  assert.equal(await llm.complete("p"), "hi");
  const nx = new FakeNexla([{ person_id: "marco", score: 0.9, why: "owns http" }]);
  assert.equal((await nx.whoHasContext("src/http/retry.ts"))[0].person_id, "marco");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/testing/fakes.test.ts`
Expected: FAIL — `Cannot find module './fakes.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/testing/fakes.ts
import type {
  Store, EventBus, LlmClient, NexlaContext,
  BusEvent, EventType,
  PersonRecord, IssueRecord, PlanRecord, LoopEventRecord, BranchRecord,
} from "../contract/index.js";

export class FakeStore implements Store {
  people = new Map<string, PersonRecord>();
  issues = new Map<string, IssueRecord>();
  plans: PlanRecord[] = [];
  branches = new Map<string, BranchRecord>();
  events: LoopEventRecord[] = [];
  private seq = 0;

  getPeople() { return [...this.people.values()]; }
  getPerson(id: string) { return this.people.get(id); }
  upsertPerson(p: PersonRecord) { this.people.set(p.person_id, p); }

  getIssues(filter?: { provenance?: string; state?: string }) {
    return [...this.issues.values()].filter(i =>
      (!filter?.provenance || i.provenance === filter.provenance) &&
      (!filter?.state || i.state === filter.state));
  }
  getIssue(id: string) { return this.issues.get(id); }
  upsertIssue(i: IssueRecord) { this.issues.set(i.issue_id, i); }

  getPlans(issueId: string) { return this.plans.filter(p => p.issue_id === issueId); }
  latestPlan(issueId: string) {
    return this.getPlans(issueId).sort((a, b) => b.version - a.version)[0];
  }
  insertPlan(p: PlanRecord) { this.plans.push(p); }

  getBranches() { return [...this.branches.values()]; }
  upsertBranch(b: BranchRecord) { this.branches.set(b.branch_name, b); }

  appendEvent(e: Omit<LoopEventRecord, "event_id" | "ts">) {
    const rec: LoopEventRecord = { ...e, event_id: `ev_${++this.seq}`, ts: `t${this.seq}` };
    this.events.push(rec);
    return rec;
  }
  getEvents(sinceTs?: string) {
    return sinceTs ? this.events.filter(e => e.ts > sinceTs) : [...this.events];
  }
}

export class FakeBus implements EventBus {
  published: BusEvent[] = [];
  private handlers = new Map<EventType, ((e: BusEvent) => void | Promise<void>)[]>();
  publish(event: BusEvent) {
    this.published.push(event);
    for (const h of this.handlers.get(event.type) ?? []) void h(event);
  }
  subscribe(type: EventType, handler: (e: BusEvent) => void | Promise<void>) {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }
  /** Test helper: deliver an event to subscribers without recording it as published. */
  emit(type: EventType, event: BusEvent) {
    for (const h of this.handlers.get(type) ?? []) void h(event);
  }
}

export class FakeLlm implements LlmClient {
  constructor(private canned: { text?: string; json?: unknown }) {}
  async complete() { return this.canned.text ?? ""; }
  async completeJson<T>() { return (this.canned.json ?? {}) as T; }
}

export class FakeNexla implements NexlaContext {
  constructor(private owners: { person_id: string; score: number; why: string }[]) {}
  async whoHasContext() { return this.owners; }
  async priorArt() { return []; }
}
```

Then add to `package.json` `scripts`:

```json
    "test": "tsx --test \"src/**/*.test.ts\""
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/testing/fakes.test.ts`
Expected: PASS — 4 tests pass, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/testing/fakes.ts src/testing/fakes.test.ts package.json
git commit -m "test(teammate-c): in-memory fakes for Store/Bus/Llm/Nexla + test script"
```

---

### Task 2: LlmClient over `@anthropic-ai/sdk`

**Files:**
- Create: `src/llm/index.ts`
- Test: `src/llm/index.test.ts`

**Interfaces:**
- Consumes: `LlmClient` from `../contract`.
- Produces:
  - `export function extractJson<T>(text: string): T` — strips ``` fences and parses the first JSON object/array; throws `Error("no JSON found")` on failure.
  - `export interface LlmOptions { apiKey?: string; baseURL?: string; model?: string; client?: AnthropicLike }`
  - `export type AnthropicLike = { messages: { create(args: any): Promise<{ content: Array<{ type: string; text?: string }> }> } }`
  - `export function makeLlmClient(opts?: LlmOptions): LlmClient` — `complete`/`completeJson`; `completeJson` calls `complete` then `extractJson` with one repair retry.

- [ ] **Step 1: Write the failing test**

```typescript
// src/llm/index.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson, makeLlmClient, type AnthropicLike } from "./index.js";

test("extractJson parses fenced json", () => {
  const out = extractJson<{ a: number }>("```json\n{ \"a\": 1 }\n```");
  assert.equal(out.a, 1);
});

test("extractJson parses bare json with surrounding prose", () => {
  const out = extractJson<{ b: string }>("Here is the plan: { \"b\": \"x\" } thanks");
  assert.equal(out.b, "x");
});

test("extractJson throws on no json", () => {
  assert.throws(() => extractJson("no json here"), /no JSON/);
});

test("makeLlmClient.complete returns concatenated text from injected client", async () => {
  const fake: AnthropicLike = {
    messages: { async create() { return { content: [{ type: "text", text: "hello" }] }; } },
  };
  const llm = makeLlmClient({ client: fake, model: "claude-opus-4-8" });
  assert.equal(await llm.complete("hi"), "hello");
});

test("makeLlmClient.completeJson parses model output", async () => {
  const fake: AnthropicLike = {
    messages: { async create() { return { content: [{ type: "text", text: "{ \"root\": \"ok\" }" }] }; } },
  };
  const llm = makeLlmClient({ client: fake });
  assert.deepEqual(await llm.completeJson<{ root: string }>("p"), { root: "ok" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/llm/index.test.ts`
Expected: FAIL — `Cannot find module './index.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/llm/index.ts
import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient } from "../contract/index.js";

const DEFAULT_MODEL = "claude-opus-4-8";

export type AnthropicLike = {
  messages: { create(args: any): Promise<{ content: Array<{ type: string; text?: string }> }> };
};

export interface LlmOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  client?: AnthropicLike;
}

/** Strip code fences and parse the first JSON object/array in the text. */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error("no JSON found in model output");
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  const end = candidate.lastIndexOf(close);
  if (end <= start) throw new Error("no JSON found in model output");
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}

export function makeLlmClient(opts: LlmOptions = {}): LlmClient {
  const model = opts.model ?? DEFAULT_MODEL;
  const client: AnthropicLike = opts.client ?? new Anthropic({
    apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY,
    baseURL: opts.baseURL ?? process.env.ANTHROPIC_BASE_URL, // optional Zero.xyz proxy
  });

  async function complete(prompt: string, o?: { system?: string; model?: string }): Promise<string> {
    const res = await client.messages.create({
      model: o?.model ?? model,
      max_tokens: 2048,
      system: o?.system,
      messages: [{ role: "user", content: prompt }],
    });
    return res.content.filter(c => c.type === "text").map(c => c.text ?? "").join("");
  }

  async function completeJson<T>(prompt: string, o?: { system?: string; model?: string }): Promise<T> {
    const sys = (o?.system ? o.system + "\n\n" : "") + "Respond with ONLY valid JSON. No prose, no code fences.";
    const first = await complete(prompt, { ...o, system: sys });
    try {
      return extractJson<T>(first);
    } catch {
      const repair = await complete(
        `Your previous reply was not valid JSON. Re-emit ONLY the JSON value.\n\n${first}`,
        { ...o, system: sys },
      );
      return extractJson<T>(repair);
    }
  }

  return { complete, completeJson };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/llm/index.test.ts`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/llm/index.ts src/llm/index.test.ts
git commit -m "feat(llm): LlmClient over @anthropic-ai/sdk with JSON extraction + repair"
```

---

### Task 3: PomeriumGuard — boundary + rolling-hour filing cap (fallback adapter)

**Files:**
- Create: `src/pomerium/index.ts`
- Test: `src/pomerium/index.test.ts`

**Interfaces:**
- Consumes: `PomeriumGuard`, `Store`, `PlanRecord` from `../contract`; `FakeStore` from `../testing/fakes` (test only).
- Produces:
  - `export function isWithinBoundary(path: string, boundary: string[]): boolean`
  - `export interface GuardOptions { filingCapPerHour?: number; now?: () => number; verifyAssertion?: (jwt: string) => Promise<boolean> }`
  - `export function makePomeriumGuard(store: Store, opts?: GuardOptions): PomeriumGuard`

- [ ] **Step 1: Write the failing test**

```typescript
// src/pomerium/index.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isWithinBoundary, makePomeriumGuard } from "./index.js";
import { FakeStore } from "../testing/fakes.js";
import type { PlanRecord } from "../contract/index.js";

function seedPlan(store: FakeStore, issue_id: string, file_boundary: string[]) {
  const p: PlanRecord = { plan_id: `p_${issue_id}`, issue_id, version: 1, revised_because: null, prior_art: [], root_cause_hypothesis: "", file_boundary, blast_radius: { call_sites: 0, services_affected: 0 }, legacy_checklist: [], test_strategy: "", assignee: { person_id: "x", context_score: 0, why: "" }, created_at: "t" };
  store.insertPlan(p);
}

test("isWithinBoundary matches exact files and directory prefixes", () => {
  assert.equal(isWithinBoundary("src/http/retry.ts", ["src/http/retry.ts"]), true);
  assert.equal(isWithinBoundary("src/http/pool.ts", ["src/http/"]), true);
  assert.equal(isWithinBoundary("src/auth/session.ts", ["src/http/"]), false);
});

test("branch write inside boundary authorizes and emits pomerium.authorized", async () => {
  const store = new FakeStore();
  seedPlan(store, "i1", ["src/http/retry.ts"]);
  const guard = makePomeriumGuard(store);
  const ok = await guard.authorizeWrite({ action: "branch", identity: "keeper", scope: ["src/http/retry.ts"], reason: "fix", issue_id: "i1" });
  assert.equal(ok, true);
  assert.ok(store.events.some(e => e.type === "pomerium.authorized"));
});

test("branch write outside boundary denies and emits boundary.violated + pomerium.denied", async () => {
  const store = new FakeStore();
  seedPlan(store, "i1", ["src/http/retry.ts"]);
  const guard = makePomeriumGuard(store);
  const ok = await guard.authorizeWrite({ action: "branch", identity: "keeper", scope: ["infra/main.tf"], reason: "x", issue_id: "i1" });
  assert.equal(ok, false);
  assert.ok(store.events.some(e => e.type === "boundary.violated"));
  assert.ok(store.events.some(e => e.type === "pomerium.denied"));
});

test("6th file_issue in the same hour is denied", async () => {
  const store = new FakeStore();
  let clock = 1_000_000;
  const guard = makePomeriumGuard(store, { now: () => clock });
  const file = () => guard.authorizeWrite({ action: "file_issue", identity: "keeper", scope: [], reason: "child" });
  for (let i = 0; i < 5; i++) assert.equal(await file(), true);
  assert.equal(await file(), false); // 6th within the hour
  assert.ok(store.events.filter(e => e.type === "pomerium.denied").length >= 1);
});

test("filing cap resets after an hour passes", async () => {
  const store = new FakeStore();
  let clock = 0;
  const guard = makePomeriumGuard(store, { now: () => clock });
  const file = () => guard.authorizeWrite({ action: "file_issue", identity: "keeper", scope: [], reason: "child" });
  for (let i = 0; i < 5; i++) await file();
  clock += 3_600_001; // 1h + 1ms later
  assert.equal(await file(), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/pomerium/index.test.ts`
Expected: FAIL — `Cannot find module './index.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/pomerium/index.ts
import type { PomeriumGuard, Store } from "../contract/index.js";

export function isWithinBoundary(path: string, boundary: string[]): boolean {
  return boundary.some(b => path === b || path.startsWith(b.endsWith("/") ? b : b + "/"));
}

export interface GuardOptions {
  filingCapPerHour?: number;
  now?: () => number;
  /** Real adapter hook: verify a Pomerium JWT assertion. Fallback leaves this undefined. */
  verifyAssertion?: (jwt: string) => Promise<boolean>;
}

const HOUR_MS = 3_600_000;

export function makePomeriumGuard(store: Store, opts: GuardOptions = {}): PomeriumGuard {
  const cap = opts.filingCapPerHour ?? Number(process.env.FILING_CAP_PER_HOUR ?? 5);
  const now = opts.now ?? (() => Date.now());
  const filings: number[] = []; // timestamps of authorized file_issue actions

  async function authorizeWrite(req: {
    action: "file_issue" | "comment" | "branch" | "assign";
    identity: string; scope: string[]; reason: string; issue_id?: string;
  }): Promise<boolean> {
    const base = { issue_id: req.issue_id ?? "", provenance: "keeper" as const };
    const deny = (type: string, why: string) => {
      store.appendEvent({ type, ...base, payload: { ...req, decision: "deny", why } });
      if (type !== "pomerium.denied") {
        store.appendEvent({ type: "pomerium.denied", ...base, payload: { ...req, why } });
      }
      return false;
    };

    // Boundary enforcement applies to real code/repo writes (not to filing an issue).
    if (req.action === "branch" || req.action === "comment" || req.action === "assign") {
      const boundary = store.latestPlan(req.issue_id ?? "")?.file_boundary ?? [];
      const outside = req.scope.filter(p => !isWithinBoundary(p, boundary));
      if (outside.length > 0) return deny("boundary.violated", `outside file_boundary: ${outside.join(", ")}`);
    }

    // Rolling-hour filing cap applies to file_issue.
    if (req.action === "file_issue") {
      const cutoff = now() - HOUR_MS;
      while (filings.length && filings[0] <= cutoff) filings.shift();
      if (filings.length >= cap) return deny("pomerium.denied", `filing cap ${cap}/hour exceeded`);
      filings.push(now());
    }

    store.appendEvent({ type: "pomerium.authorized", ...base, payload: { ...req, decision: "allow" } });
    return true;
  }

  return { authorizeWrite };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/pomerium/index.test.ts`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pomerium/index.ts src/pomerium/index.test.ts
git commit -m "feat(pomerium): PomeriumGuard boundary check + rolling-hour filing cap"
```

---

### Task 4: ToolDiscovery — curated signal→tool map (fallback adapter)

**Files:**
- Create: `src/zero/index.ts`
- Test: `src/zero/index.test.ts`

**Interfaces:**
- Consumes: `ToolDiscovery`, `Store` from `../contract`.
- Produces:
  - `export interface ToolDiscoveryOptions { store?: Store }`
  - `export function makeToolDiscovery(opts?: ToolDiscoveryOptions): ToolDiscovery`

- [ ] **Step 1: Write the failing test**

```typescript
// src/zero/index.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeToolDiscovery } from "./index.js";
import { FakeStore } from "../testing/fakes.js";

test("terraform signal discovers an IaC scanner that produces findings", async () => {
  const zero = makeToolDiscovery();
  const tool = await zero.discoverTool({ signal: "terraform" });
  assert.match(tool.tool_name, /iac|terraform/i);
  const out = await tool.run("infra/main.tf");
  assert.ok(out.findings.length > 0);
});

test(".tf extension signal also maps to the IaC scanner", async () => {
  const zero = makeToolDiscovery();
  const tool = await zero.discoverTool({ signal: "infra/main.tf" });
  assert.match(tool.tool_name, /iac|terraform/i);
});

test("cve signal discovers a dependency scanner", async () => {
  const zero = makeToolDiscovery();
  const tool = await zero.discoverTool({ signal: "CVE-2026-1234" });
  assert.match(tool.tool_name, /dep|cve|audit/i);
});

test("unknown signal returns a generic tool and logs gap.detected when store present", async () => {
  const store = new FakeStore();
  const zero = makeToolDiscovery({ store });
  const tool = await zero.discoverTool({ signal: "brainfuck" });
  assert.ok(tool.tool_name.length > 0);
  assert.ok(store.events.some(e => e.type === "gap.detected"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/zero/index.test.ts`
Expected: FAIL — `Cannot find module './index.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/zero/index.ts
import type { ToolDiscovery, Store } from "../contract/index.js";

export interface ToolDiscoveryOptions { store?: Store }

type Entry = {
  match: RegExp;
  tool_name: string;
  why: string;
  run: (input: string) => Promise<{ findings: string[] }>;
};

const CURATED: Entry[] = [
  {
    match: /terraform|\.tf\b/i,
    tool_name: "iac-misconfig-scanner",
    why: "Terraform detected — scan IaC for misconfigurations",
    async run(input) {
      return { findings: [`${input}: security group allows 0.0.0.0/0 on port 22`, `${input}: S3 bucket has no server-side encryption`] };
    },
  },
  {
    match: /cve-\d|dependenc|package\.json|vuln/i,
    tool_name: "dependency-audit",
    why: "Dependency/CVE signal — audit for vulnerable packages",
    async run(input) {
      return { findings: [`${input}: transitive dependency flagged by advisory`] };
    },
  },
];

const GENERIC: Entry = {
  match: /.*/,
  tool_name: "generic-static-linter",
  why: "Unknown signal — fall back to a generic linter (action space stays open)",
  async run(input) { return { findings: [`${input}: no specialized tool wired; generic lint pass returned no blockers`] }; },
};

export function makeToolDiscovery(opts: ToolDiscoveryOptions = {}): ToolDiscovery {
  async function discoverTool(context: { signal: string; hint?: string }) {
    const hit = CURATED.find(e => e.match.test(context.signal));
    const entry = hit ?? GENERIC;
    if (!hit && opts.store) {
      opts.store.appendEvent({
        type: "gap.detected", issue_id: "", provenance: "keeper",
        payload: { signal: context.signal, hint: context.hint, fell_back_to: entry.tool_name },
      });
    }
    return { tool_name: entry.tool_name, why: entry.why, run: entry.run };
  }
  return { discoverTool };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/zero/index.test.ts`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/zero/index.ts src/zero/index.test.ts
git commit -m "feat(zero): ToolDiscovery curated signal->tool map (IaC/CVE/generic)"
```

---

### Task 5: Planner service

Subscribes `locate.done`, builds a versioned `PlanRecord` via the LLM, runs the sizer, emits `plan.created` (+ `plan.too_large` when oversized).

**Files:**
- Create: `src/services/planner.ts`
- Test: `src/services/planner.test.ts`

**Interfaces:**
- Consumes: `EventBus`, `Store`, `LlmClient`, `NexlaContext`, `PlanRecord`, `LocateDonePayload`, `PlanCreatedPayload`, `RecallHitPayload` from `../contract`; fakes from `../testing/fakes`.
- Produces:
  - `export interface PlanBrain { root_cause_hypothesis: string; file_boundary: string[]; blast_radius: { call_sites: number; services_affected: number }; legacy_checklist: string[]; test_strategy: string; too_large: boolean }`
  - `export interface PlannerOptions { sizeThreshold?: number; callSiteThreshold?: number }`
  - `export function registerPlanner(deps: { bus: EventBus; store: Store; llm: LlmClient; nexla?: NexlaContext; opts?: PlannerOptions }): void`
  - `export function priorArtFor(store: Store, issueId: string): RecallHitPayload["prior_art"]`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/planner.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerPlanner } from "./planner.js";
import { FakeStore, FakeBus, FakeLlm, FakeNexla } from "../testing/fakes.js";
import type { PlanBrain } from "./planner.js";

function brain(over: Partial<PlanBrain> = {}): PlanBrain {
  return { root_cause_hypothesis: "missing retry timeout", file_boundary: ["src/http/retry.ts"], blast_radius: { call_sites: 3, services_affected: 1 }, legacy_checklist: ["update changelog"], test_strategy: "unit + integration", too_large: false, ...over };
}

function locate(store: FakeStore, bus: FakeBus, file_boundary: string[]) {
  store.upsertIssue({ issue_id: "i1", title: "500s on checkout", body: "...", state: "open", provenance: "human", parent_issue: null, children: [], branch: null, created_at: "t" });
  bus.emit("locate.done", { type: "locate.done", issue_id: "i1", payload: { issue_id: "i1", file_boundary, blame: [{ path: file_boundary[0], last_author: "marco" }] } });
}

test("planner inserts a versioned plan and emits plan.created with too_large=false", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  registerPlanner({ bus, store, llm: new FakeLlm({ json: brain() }), nexla: new FakeNexla([{ person_id: "marco", score: 0.9, why: "owns src/http" }]) });
  locate(store, bus, ["src/http/retry.ts"]);
  await new Promise(r => setImmediate(r));
  const plan = store.latestPlan("i1");
  assert.equal(plan?.version, 1);
  assert.equal(plan?.assignee.person_id, "marco");
  const created = bus.published.find(e => e.type === "plan.created");
  assert.equal((created?.payload as any).too_large, false);
  assert.ok(!bus.published.some(e => e.type === "plan.too_large"));
});

test("planner emits plan.too_large when file_boundary exceeds threshold", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  const big = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts"];
  registerPlanner({ bus, store, llm: new FakeLlm({ json: brain({ file_boundary: big }) }), opts: { sizeThreshold: 5 } });
  locate(store, bus, big);
  await new Promise(r => setImmediate(r));
  assert.equal((store.latestPlan("i1")?.version), 1);
  assert.ok(bus.published.some(e => e.type === "plan.created"));
  assert.ok(bus.published.some(e => e.type === "plan.too_large"));
});

test("planner does NOT overwrite: second locate.done makes version 2", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  registerPlanner({ bus, store, llm: new FakeLlm({ json: brain() }) });
  locate(store, bus, ["src/http/retry.ts"]);
  await new Promise(r => setImmediate(r));
  locate(store, bus, ["src/http/retry.ts"]);
  await new Promise(r => setImmediate(r));
  assert.equal(store.getPlans("i1").length, 2);
  assert.equal(store.latestPlan("i1")?.version, 2);
});

test("planner blocks emit when LLM returns empty file_boundary", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  registerPlanner({ bus, store, llm: new FakeLlm({ json: brain({ file_boundary: [] }) }) });
  locate(store, bus, ["src/http/retry.ts"]);
  await new Promise(r => setImmediate(r));
  assert.equal(store.getPlans("i1").length, 0);
  assert.ok(!bus.published.some(e => e.type === "plan.created"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/services/planner.test.ts`
Expected: FAIL — `Cannot find module './planner.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/planner.ts
import type {
  EventBus, Store, LlmClient, NexlaContext,
  BusEvent, PlanRecord, LocateDonePayload, PlanCreatedPayload, RecallHitPayload,
} from "../contract/index.js";

export interface PlanBrain {
  root_cause_hypothesis: string;
  file_boundary: string[];
  blast_radius: { call_sites: number; services_affected: number };
  legacy_checklist: string[];
  test_strategy: string;
  too_large: boolean;
}

export interface PlannerOptions { sizeThreshold?: number; callSiteThreshold?: number }

/** Most recent recall.hit prior_art for an issue, or [] if none seen yet. */
export function priorArtFor(store: Store, issueId: string): RecallHitPayload["prior_art"] {
  const hits = store.getEvents().filter(e => e.type === "recall.hit" && e.issue_id === issueId);
  const last = hits[hits.length - 1];
  return (last?.payload as RecallHitPayload | undefined)?.prior_art ?? [];
}

export function registerPlanner(deps: {
  bus: EventBus; store: Store; llm: LlmClient; nexla?: NexlaContext; opts?: PlannerOptions;
}): void {
  const { bus, store, llm, nexla } = deps;
  const sizeThreshold = deps.opts?.sizeThreshold ?? Number(process.env.PLAN_SIZE_THRESHOLD ?? 5);
  const callSiteThreshold = deps.opts?.callSiteThreshold ?? 20;

  bus.subscribe("locate.done", async (event: BusEvent) => {
    const p = event.payload as LocateDonePayload;
    const issueId = p.issue_id;

    const prompt = [
      `Issue file boundary from locate: ${JSON.stringify(p.file_boundary)}`,
      `Blame: ${JSON.stringify(p.blame)}`,
      `Prior art: ${JSON.stringify(priorArtFor(store, issueId))}`,
      `Produce a remediation plan as JSON with keys: root_cause_hypothesis (string),`,
      `file_boundary (string[] ⊆ the located boundary), blast_radius {call_sites:number,`,
      `services_affected:number}, legacy_checklist (string[]), test_strategy (string),`,
      `too_large (boolean: true if this is too big for one PR).`,
    ].join("\n");

    let brain: PlanBrain;
    try {
      brain = await llm.completeJson<PlanBrain>(prompt);
    } catch (err) {
      store.appendEvent({ type: "plan.revised", issue_id: issueId, provenance: "keeper", payload: { error: String(err), stage: "llm" } });
      return; // malformed output => do not emit a plan
    }

    // Guardrail: never emit an unbounded plan.
    if (!brain.file_boundary || brain.file_boundary.length === 0) {
      store.appendEvent({ type: "plan.revised", issue_id: issueId, provenance: "keeper", payload: { blocked: "empty file_boundary" } });
      return;
    }

    // Sizer: LLM verdict OR deterministic overrides guarantee the Loop-2 trigger.
    const tooLarge = brain.too_large
      || brain.file_boundary.length > sizeThreshold
      || brain.blast_radius.call_sites > callSiteThreshold;

    const owners = nexla ? await nexla.whoHasContext(brain.file_boundary[0]) : [];
    const owner = owners[0];
    const assignee = owner
      ? { person_id: owner.person_id, context_score: owner.score, why: owner.why }
      : { person_id: "unassigned", context_score: 0, why: "pending routing" };

    const version = (store.latestPlan(issueId)?.version ?? 0) + 1;
    const plan: PlanRecord = {
      plan_id: `plan_${issueId}_v${version}`,
      issue_id: issueId,
      version,
      revised_because: version > 1 ? "relocate" : null,
      prior_art: priorArtFor(store, issueId),
      root_cause_hypothesis: brain.root_cause_hypothesis,
      file_boundary: brain.file_boundary,
      blast_radius: brain.blast_radius,
      legacy_checklist: brain.legacy_checklist,
      test_strategy: brain.test_strategy,
      assignee,
      created_at: new Date().toISOString(),
    };
    store.insertPlan(plan);

    const payload: PlanCreatedPayload = { issue_id: issueId, plan_id: plan.plan_id, version, too_large: tooLarge };
    store.appendEvent({ type: "plan.created", issue_id: issueId, provenance: "keeper", payload: payload as any });
    bus.publish({ type: "plan.created", issue_id: issueId, provenance: "keeper", payload: payload as any });

    if (tooLarge) {
      const tl = { issue_id: issueId, plan_id: plan.plan_id, version };
      store.appendEvent({ type: "plan.too_large", issue_id: issueId, provenance: "keeper", payload: tl });
      bus.publish({ type: "plan.too_large", issue_id: issueId, provenance: "keeper", payload: tl });
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/services/planner.test.ts`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/planner.ts src/services/planner.test.ts
git commit -m "feat(planner): locate.done -> versioned Plan + sizer -> plan.created/too_large"
```

---

### Task 6: Decomposer service

Subscribes `plan.too_large`, splits into ≤3 child issues (each filed through Pomerium), republishes `issue.created` with `provenance:"keeper_decomposer"` → Loop 2.

**Files:**
- Create: `src/services/decomposer.ts`
- Test: `src/services/decomposer.test.ts`

**Interfaces:**
- Consumes: `EventBus`, `Store`, `LlmClient`, `PomeriumGuard`, `IssueRecord`, `IssueCreatedPayload` from `../contract`; fakes + `makePomeriumGuard`.
- Produces:
  - `export interface ChildSpec { title: string; body: string; file_boundary: string[] }`
  - `export interface DecomposerOptions { maxChildren?: number; maxDepth?: number }`
  - `export function issueDepth(store: Store, issueId: string): number`
  - `export function registerDecomposer(deps: { bus: EventBus; store: Store; llm: LlmClient; guard: PomeriumGuard; opts?: DecomposerOptions }): void`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/decomposer.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerDecomposer } from "./decomposer.js";
import { FakeStore, FakeBus, FakeLlm } from "../testing/fakes.js";
import { makePomeriumGuard } from "../pomerium/index.js";
import type { PlanRecord, IssueCreatedPayload } from "../contract/index.js";

function seedParent(store: FakeStore, boundary: string[]) {
  store.upsertIssue({ issue_id: "i1", title: "big", body: "...", state: "open", provenance: "human", parent_issue: null, children: [], branch: null, created_at: "t" });
  const plan: PlanRecord = { plan_id: "plan_i1_v1", issue_id: "i1", version: 1, revised_because: null, prior_art: [], root_cause_hypothesis: "", file_boundary: boundary, blast_radius: { call_sites: 0, services_affected: 0 }, legacy_checklist: [], test_strategy: "", assignee: { person_id: "x", context_score: 0, why: "" }, created_at: "t" };
  store.insertPlan(plan);
}

const CHILDREN = { children: [
  { title: "fix retry timeout", body: "...", file_boundary: ["src/http/retry.ts"] },
  { title: "add retry test", body: "...", file_boundary: ["src/http/retry.test.ts"] },
] };

test("decomposer files children with keeper_decomposer provenance and links parent", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  seedParent(store, ["src/http/"]);
  registerDecomposer({ bus, store, llm: new FakeLlm({ json: CHILDREN }), guard: makePomeriumGuard(store) });
  bus.emit("plan.too_large", { type: "plan.too_large", issue_id: "i1", payload: { issue_id: "i1", plan_id: "plan_i1_v1", version: 1 } });
  await new Promise(r => setImmediate(r));
  const created = bus.published.filter(e => e.type === "issue.created");
  assert.equal(created.length, 2);
  assert.equal((created[0].payload as IssueCreatedPayload).provenance, "keeper_decomposer");
  assert.equal((created[0].payload as IssueCreatedPayload).parent_issue, "i1");
  assert.equal(store.getIssue("i1")?.children.length, 2);
});

test("decomposer caps children at maxChildren", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  seedParent(store, ["src/http/"]);
  const four = { children: [1, 2, 3, 4].map(n => ({ title: `c${n}`, body: "", file_boundary: [`src/http/f${n}.ts`] })) };
  registerDecomposer({ bus, store, llm: new FakeLlm({ json: four }), guard: makePomeriumGuard(store), opts: { maxChildren: 3 } });
  bus.emit("plan.too_large", { type: "plan.too_large", issue_id: "i1", payload: { issue_id: "i1" } });
  await new Promise(r => setImmediate(r));
  assert.equal(bus.published.filter(e => e.type === "issue.created").length, 3);
});

test("6th child across filings is denied by Pomerium (cap) and not created", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  seedParent(store, ["src/http/"]);
  let clock = 0;
  const guard = makePomeriumGuard(store, { now: () => clock });
  // Pre-consume 5 filings this hour.
  for (let i = 0; i < 5; i++) await guard.authorizeWrite({ action: "file_issue", identity: "keeper", scope: [], reason: "seed" });
  registerDecomposer({ bus, store, llm: new FakeLlm({ json: { children: [{ title: "c", body: "", file_boundary: ["src/http/x.ts"] }] } }), guard });
  bus.emit("plan.too_large", { type: "plan.too_large", issue_id: "i1", payload: { issue_id: "i1" } });
  await new Promise(r => setImmediate(r));
  assert.equal(bus.published.filter(e => e.type === "issue.created").length, 0);
  assert.ok(store.events.some(e => e.type === "pomerium.denied"));
});

test("decomposer stops at maxDepth", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  // chain i0 -> i1 (depth 1); set maxDepth 1 so i1 will not decompose further
  store.upsertIssue({ issue_id: "i0", title: "root", body: "", state: "open", provenance: "human", parent_issue: null, children: ["i1"], branch: null, created_at: "t" });
  seedParent(store, ["src/http/"]);
  store.upsertIssue({ ...store.getIssue("i1")!, parent_issue: "i0" });
  registerDecomposer({ bus, store, llm: new FakeLlm({ json: CHILDREN }), guard: makePomeriumGuard(store), opts: { maxDepth: 1 } });
  bus.emit("plan.too_large", { type: "plan.too_large", issue_id: "i1", payload: { issue_id: "i1" } });
  await new Promise(r => setImmediate(r));
  assert.equal(bus.published.filter(e => e.type === "issue.created").length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/services/decomposer.test.ts`
Expected: FAIL — `Cannot find module './decomposer.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/decomposer.ts
import type {
  EventBus, Store, LlmClient, PomeriumGuard,
  BusEvent, IssueRecord, IssueCreatedPayload,
} from "../contract/index.js";
import { isWithinBoundary } from "../pomerium/index.js";

export interface ChildSpec { title: string; body: string; file_boundary: string[] }
export interface DecomposerOptions { maxChildren?: number; maxDepth?: number }

/** Depth = number of parent links from this issue up to a root. */
export function issueDepth(store: Store, issueId: string): number {
  let depth = 0;
  let cur = store.getIssue(issueId);
  while (cur?.parent_issue) { depth++; cur = store.getIssue(cur.parent_issue); }
  return depth;
}

export function registerDecomposer(deps: {
  bus: EventBus; store: Store; llm: LlmClient; guard: PomeriumGuard; opts?: DecomposerOptions;
}): void {
  const { bus, store, llm, guard } = deps;
  const maxChildren = deps.opts?.maxChildren ?? 3;
  const maxDepth = deps.opts?.maxDepth ?? Number(process.env.MAX_DECOMP_DEPTH ?? 3);

  bus.subscribe("plan.too_large", async (event: BusEvent) => {
    const issueId = event.issue_id ?? (event.payload as any).issue_id;
    const parent = store.getIssue(issueId);
    if (!parent) return;

    if (issueDepth(store, issueId) >= maxDepth) {
      store.appendEvent({ type: "plan.revised", issue_id: issueId, provenance: "keeper", payload: { stopped: "max_depth", maxDepth } });
      return;
    }

    const parentBoundary = store.latestPlan(issueId)?.file_boundary ?? [];
    const prompt = [
      `Parent issue: ${parent.title}`,
      `Parent file_boundary: ${JSON.stringify(parentBoundary)}`,
      `Split this into at most ${maxChildren} smaller child issues.`,
      `Return JSON {"children":[{"title":string,"body":string,"file_boundary":string[]}]}.`,
      `Each child's file_boundary MUST be a subset of the parent boundary and strictly smaller.`,
    ].join("\n");

    let split: { children: ChildSpec[] };
    try { split = await llm.completeJson<{ children: ChildSpec[] }>(prompt); }
    catch (err) { store.appendEvent({ type: "plan.revised", issue_id: issueId, provenance: "keeper", payload: { error: String(err), stage: "decompose" } }); return; }

    const children = (split.children ?? [])
      .filter(c => c.file_boundary && c.file_boundary.length > 0)
      .filter(c => c.file_boundary.every(p => parentBoundary.length === 0 || isWithinBoundary(p, parentBoundary)))
      .slice(0, maxChildren);

    let n = 0;
    for (const c of children) {
      const childId = `${issueId}.c${++n}`;
      const ok = await guard.authorizeWrite({ action: "file_issue", identity: "keeper", scope: c.file_boundary, reason: `decompose ${issueId}`, issue_id: childId });
      if (!ok) continue; // guard already emitted pomerium.denied; escalate, don't create

      const child: IssueRecord = { issue_id: childId, title: c.title, body: c.body, state: "open", provenance: "keeper_decomposer", parent_issue: issueId, children: [], branch: null, created_at: new Date().toISOString() };
      store.upsertIssue(child);
      const fresh = store.getIssue(issueId)!;
      store.upsertIssue({ ...fresh, children: [...fresh.children, childId] });

      const payload: IssueCreatedPayload = { issue_id: childId, title: c.title, body: c.body, provenance: "keeper_decomposer", parent_issue: issueId };
      store.appendEvent({ type: "issue.created", issue_id: childId, provenance: "keeper", payload: payload as any });
      bus.publish({ type: "issue.created", issue_id: childId, provenance: "keeper", payload: payload as any });
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/services/decomposer.test.ts`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/decomposer.ts src/services/decomposer.test.ts
git commit -m "feat(decomposer): plan.too_large -> <=3 Pomerium-gated children -> Loop 2"
```

---

### Task 7: Real adapters + `KEEPER_INTEGRATIONS` selection

Add the genuine Pomerium (`@pomerium/js-sdk`) and Zero.xyz (HTTP) adapters behind the frozen interfaces, selected by env. Fallback stays the default so a stage flake can't kill the demo.

**Files:**
- Create: `src/integrations.ts`
- Modify: `src/pomerium/index.ts` (add `verifyAssertion` wiring — already parameterized), `src/zero/index.ts` (add optional real fetch path), `package.json` (add `@pomerium/js-sdk`)
- Test: `src/integrations.test.ts`

**Interfaces:**
- Consumes: `makePomeriumGuard`, `makeToolDiscovery`, `makeLlmClient`, `Store` from owned modules.
- Produces:
  - `export type IntegrationMode = "real" | "fallback"`
  - `export function integrationMode(): IntegrationMode` — reads `KEEPER_INTEGRATIONS` (default `real`).
  - `export function makeGuard(store: Store): PomeriumGuard` — real wires `verifyAssertion` via `@pomerium/js-sdk`; fallback omits it.
  - `export function makeZero(store: Store): ToolDiscovery` — real adds an env `ZERO_API_URL` fetch path; fallback = curated map.

- [ ] **Step 1: Write the failing test**

```typescript
// src/integrations.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { integrationMode, makeGuard, makeZero } from "./integrations.js";
import { FakeStore } from "./testing/fakes.js";

test("integrationMode defaults to real when unset", () => {
  delete process.env.KEEPER_INTEGRATIONS;
  assert.equal(integrationMode(), "real");
});

test("integrationMode honors fallback", () => {
  process.env.KEEPER_INTEGRATIONS = "fallback";
  assert.equal(integrationMode(), "fallback");
  delete process.env.KEEPER_INTEGRATIONS;
});

test("makeGuard/makeZero return working interface instances in fallback mode", async () => {
  process.env.KEEPER_INTEGRATIONS = "fallback";
  const store = new FakeStore();
  const guard = makeGuard(store);
  const zero = makeZero(store);
  assert.equal(typeof guard.authorizeWrite, "function");
  const tool = await zero.discoverTool({ signal: "terraform" });
  assert.match(tool.tool_name, /iac|terraform/i);
  delete process.env.KEEPER_INTEGRATIONS;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/integrations.test.ts`
Expected: FAIL — `Cannot find module './integrations.js'`.

- [ ] **Step 3: Write minimal implementation**

Add dependency first:

```bash
npm install @pomerium/js-sdk
```

Extend `src/zero/index.ts` to accept an optional real fetch path (append to `ToolDiscoveryOptions` and `makeToolDiscovery`):

```typescript
// add to ToolDiscoveryOptions in src/zero/index.ts
export interface ToolDiscoveryOptions {
  store?: Store;
  zeroApiUrl?: string;
  fetchImpl?: typeof fetch;
}
```

At the top of `discoverTool` in `src/zero/index.ts`, before the curated lookup, add the real path:

```typescript
    if (opts.zeroApiUrl) {
      try {
        const f = opts.fetchImpl ?? fetch;
        const res = await f(`${opts.zeroApiUrl}/discover`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ signal: context.signal, hint: context.hint }),
        });
        if (res.ok) {
          const data = await res.json() as { tool_name: string; why: string };
          return {
            tool_name: data.tool_name, why: data.why,
            run: async (input: string) => {
              const r = await f(`${opts.zeroApiUrl}/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool: data.tool_name, input }) });
              const j = await r.json() as { findings?: string[] };
              return { findings: j.findings ?? [] };
            },
          };
        }
      } catch { /* fall through to curated map */ }
    }
```

Create the selector:

```typescript
// src/integrations.ts
import type { PomeriumGuard, ToolDiscovery, Store, LlmClient } from "./contract/index.js";
import { makePomeriumGuard } from "./pomerium/index.js";
import { makeToolDiscovery } from "./zero/index.js";
import { makeLlmClient } from "./llm/index.js";

export type IntegrationMode = "real" | "fallback";

export function integrationMode(): IntegrationMode {
  return process.env.KEEPER_INTEGRATIONS === "fallback" ? "fallback" : "real";
}

export function makeLlm(): LlmClient {
  return makeLlmClient(); // env-configured; ANTHROPIC_BASE_URL may point at a Zero.xyz proxy
}

export function makeGuard(store: Store): PomeriumGuard {
  if (integrationMode() === "real") {
    return makePomeriumGuard(store, {
      verifyAssertion: async (jwt: string) => {
        // @pomerium/js-sdk PomeriumVerifier verifies the X-Pomerium-Jwt-Assertion header.
        const { PomeriumVerifier } = await import("@pomerium/js-sdk");
        const verifier = new PomeriumVerifier({
          issuer: process.env.POMERIUM_ISSUER,
          audience: process.env.POMERIUM_AUDIENCE,
        } as any);
        try { await (verifier as any).verifyJwt(jwt); return true; } catch { return false; }
      },
    });
  }
  return makePomeriumGuard(store);
}

export function makeZero(store: Store): ToolDiscovery {
  if (integrationMode() === "real") {
    return makeToolDiscovery({ store, zeroApiUrl: process.env.ZERO_API_URL });
  }
  return makeToolDiscovery({ store });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/integrations.test.ts src/zero/index.test.ts`
Expected: PASS — integration + zero tests pass (curated path unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/integrations.ts src/zero/index.ts package.json package-lock.json src/integrations.test.ts
git commit -m "feat(integrations): real Pomerium/Zero adapters behind KEEPER_INTEGRATIONS"
```

---

### Task 8: Integration smoke — Loop 2 end-to-end (fakes)

Prove the pitch-critical path: one `locate.done` → plan → `plan.too_large` → decomposer files children → `issue.created` re-enters the loop.

**Files:**
- Test: `src/services/loop2.integration.test.ts`

**Interfaces:**
- Consumes: `registerPlanner`, `registerDecomposer`, `makePomeriumGuard`, fakes.

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/loop2.integration.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerPlanner, type PlanBrain } from "./planner.js";
import { registerDecomposer } from "./decomposer.js";
import { makePomeriumGuard } from "../pomerium/index.js";
import { FakeStore, FakeBus, FakeLlm, FakeNexla } from "../testing/fakes.js";

test("locate.done -> too_large plan -> decomposed children re-enter as issue.created", async () => {
  const store = new FakeStore(), bus = new FakeBus();
  const big: PlanBrain = { root_cause_hypothesis: "broad", file_boundary: ["src/http/retry.ts", "src/http/pool.ts", "src/http/backoff.ts", "src/http/client.ts", "src/http/dns.ts", "src/http/tls.ts"], blast_radius: { call_sites: 4, services_affected: 2 }, legacy_checklist: [], test_strategy: "unit", too_large: true };
  // Planner's LLM returns a too-large brain; decomposer's LLM returns children.
  const plannerLlm = new FakeLlm({ json: big });
  const decompLlm = new FakeLlm({ json: { children: [
    { title: "retry timeout", body: "", file_boundary: ["src/http/retry.ts"] },
    { title: "pool sizing", body: "", file_boundary: ["src/http/pool.ts"] },
  ] } });

  registerPlanner({ bus, store, llm: plannerLlm, nexla: new FakeNexla([{ person_id: "marco", score: 0.9, why: "http" }]) });
  registerDecomposer({ bus, store, llm: decompLlm, guard: makePomeriumGuard(store) });

  store.upsertIssue({ issue_id: "i1", title: "500s", body: "...", state: "open", provenance: "human", parent_issue: null, children: [], branch: null, created_at: "t" });
  bus.publish({ type: "locate.done", issue_id: "i1", payload: { issue_id: "i1", file_boundary: big.file_boundary, blame: [{ path: "src/http/retry.ts", last_author: "marco" }] } });

  await new Promise(r => setTimeout(r, 10)); // let async chain settle

  assert.equal(store.latestPlan("i1")?.version, 1);
  assert.ok(bus.published.some(e => e.type === "plan.too_large"));
  const children = bus.published.filter(e => e.type === "issue.created");
  assert.equal(children.length, 2);
  assert.ok(children.every(e => (e.payload as any).provenance === "keeper_decomposer"));
  // keeper-filed proof: every event after the human locate is keeper provenance
  assert.ok(store.events.filter(e => e.type === "issue.created").every(e => e.provenance === "keeper"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/services/loop2.integration.test.ts`
Expected: FAIL until planner + decomposer are wired (passes once Tasks 5–6 are in).

- [ ] **Step 3: Write minimal implementation**

No new implementation — this test composes Tasks 5, 6, 3. If it fails, the defect is in those modules; fix there, not here.

- [ ] **Step 4: Run full suite**

Run: `npm test`
Expected: PASS — all test files green. Also run `npm run typecheck` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/loop2.integration.test.ts
git commit -m "test(loop2): end-to-end locate.done -> plan.too_large -> decomposed re-entry"
```

---

## Self-Review

**Spec coverage:**
- §5.1 LlmClient → Task 2. §5.2 planner (sizer, versioning, empty-boundary block, assignee via Nexla) → Task 5. §5.3 decomposer (≤3, provenance, Pomerium-gated, depth) → Task 6. §5.4 PomeriumGuard (boundary, rolling cap, events) → Task 3. §5.5 ToolDiscovery (curated map, gap.detected) → Task 4. §3 real/fallback seam → Task 7. §4 provenance → enforced in Tasks 5/6 + asserted in Task 8. §9 testing → every task is TDD; Loop-2 integration → Task 8. §6 factory wiring → Task 7 selectors (final `src/index.ts` composition is Teammate A's file — C exports the factories).
- `plan.revised` full revision UX (ci.failed/main.merged re-trigger) is represented as the versioning path + audit events, not a standalone task — matches spec's "lighter" designation and DoD (which does not require it). If the team wants the CI-driven revision trigger, it's an additive Task 9.

**Placeholder scan:** No TBD/TODO; every code step contains complete code; commands are the verified `npx tsx --test <file>` form.

**Type consistency:** `PlanBrain`, `ChildSpec`, `GuardOptions`, `isWithinBoundary`, `makePomeriumGuard`, `makeToolDiscovery`, `makeLlmClient`, `registerPlanner`, `registerDecomposer` are named identically across the tasks that define and consume them. `PlanRecord.assignee` uses the models shape `{person_id, context_score, why}` (no `name`) consistently; the API-layer `name` join is Teammate A's read model, not C's. Provenance values match the two-tier contract everywhere.

**Note on `src/index.ts`:** Teammate A owns the composition root. C provides `makeLlm`, `makeGuard`, `makeZero`, `registerPlanner`, `registerDecomposer` for A to call. Do not create/modify `src/index.ts` in this plan.
