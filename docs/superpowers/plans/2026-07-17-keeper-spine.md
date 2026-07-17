# Keeper Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Teammate A's local event spine, API, staged seed, and autonomous scanner loop.

**Architecture:** A contract-backed in-memory bus and store form the common runtime. Gateway and scanner publish events through the bus; Express projects store records into frozen API shapes. Scanner dependencies are injected through frozen interfaces with local fallbacks only in the bootstrap file.

**Tech Stack:** Node 20, TypeScript, Express 4, tsx, Node test runner.

## Global Constraints

- Never modify `src/contract/*`.
- Only production files owned by Teammate A may be created or edited: `src/bus.ts`, `src/store.ts`, `src/server.ts`, `src/index.ts`, `src/services/gateway.ts`, `src/services/scanner.ts`, and `src/seed/*`.
- Every service action appends a `loop_events` entry through `store.appendEvent(...)`.
- Keep the endpoint shapes and event names in the frozen contract exactly unchanged.
- Scanner-created issues use `provenance: "keeper_scanner"`, authorize filing via `PomeriumGuard`, and publish `issue.created` after persistence.

---

### Task 1: Runtime foundation and credible seed

**Files:**
- Create: `src/bus.ts`, `src/store.ts`, `src/seed/seed.json`, `src/seed/staged-pr.diff`, `test/bus-store.test.ts`

**Interfaces:**
- Produces `InMemoryEventBus implements EventBus` and `InMemoryStore implements Store`.
- Constructor accepts seed arrays matching the frozen `PersonRecord`, `IssueRecord`, `PlanRecord`, and `BranchRecord` models.

- [ ] **Step 1: Write failing bus/store tests**

```ts
test('dispatches subscribed events and preserves append-only trace order', async () => {
  const bus = new InMemoryEventBus();
  const seen: string[] = [];
  bus.subscribe('issue.created', async event => seen.push(event.payload.issue_id as string));
  bus.publish({ type: 'issue.created', payload: { issue_id: 'ISS-1' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(seen, ['ISS-1']);
  assert.equal(store.appendEvent({ type: 'issue.created', issue_id: 'ISS-1', provenance: 'human', payload: {} }).event_id, 'evt_1');
});
```

- [ ] **Step 2: Run the test and confirm it fails because modules do not exist**

Run: `npx tsx --test test/bus-store.test.ts`

- [ ] **Step 3: Implement the minimal bus/store and seed fixtures**

```ts
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<EventType, Set<(event: BusEvent) => void | Promise<void>>>();
  publish(event: BusEvent): void { queueMicrotask(() => void Promise.all([...this.handlers.get(event.type) ?? []].map(handler => handler(event)))); }
  subscribe(type: EventType, handler: (event: BusEvent) => void | Promise<void>): void { (this.handlers.get(type) ?? this.handlers.set(type, new Set()).get(type)!).add(handler); }
}
```

- [ ] **Step 4: Re-run the test and typecheck**

Run: `npx tsx --test test/bus-store.test.ts && npm run typecheck`

- [ ] **Step 5: Commit the foundation**

Run: `git add src/bus.ts src/store.ts src/seed test/bus-store.test.ts && git commit -m "feat: add in-memory Keeper runtime"`

### Task 2: Gateway and autonomous scanner

**Files:**
- Create: `src/services/gateway.ts`, `src/services/scanner.ts`, `test/gateway-scanner.test.ts`

**Interfaces:**
- Gateway exposes `createGateway(bus, store)` with `createIssue(input)` and `ingestWebhook(type, payload, deliveryId?)`.
- Scanner exposes `registerScanner(bus, store, { llm, guard, tools, stagedDiff })`.

- [ ] **Step 1: Write failing scanner-loop test**

```ts
test('files a scanner issue and republishes issue.created after branch merge', async () => {
  registerScanner(bus, store, deps);
  bus.publish({ type: 'branch.merged', issue_id: 'ISS-420', provenance: 'keeper', payload: { diff: stagedDiff } });
  await drainBus();
  assert.equal(store.getIssues({ provenance: 'keeper_scanner' }).length, 1);
  assert.deepEqual(store.getEvents().map(event => event.type).filter(type => type.startsWith('scan.')), ['scan.started', 'scan.found']);
  assert.ok(seen.includes('issue.created'));
});
```

- [ ] **Step 2: Run the test and confirm it fails because modules do not exist**

Run: `npx tsx --test test/gateway-scanner.test.ts`

- [ ] **Step 3: Implement minimal gateway/scanner behavior**

```ts
if (await guard.authorizeWrite({ action: 'file_issue', identity: 'keeper', scope: finding.paths, reason: finding.title, issue_id: issueId })) {
  store.upsertIssue(issue);
  store.appendEvent({ type: 'scan.found', issue_id: issueId, provenance: 'keeper', payload: finding });
  bus.publish({ type: 'issue.created', issue_id: issueId, provenance: 'keeper', payload: { ...issue, provenance: 'keeper_scanner' } });
}
```

- [ ] **Step 4: Re-run scanner tests and typecheck**

Run: `npx tsx --test test/gateway-scanner.test.ts && npm run typecheck`

- [ ] **Step 5: Commit scanner behavior**

Run: `git add src/services test/gateway-scanner.test.ts && git commit -m "feat: add gateway and scanner loop"`

### Task 3: API bootstrap and end-to-end demo proof

**Files:**
- Create: `src/server.ts`, `src/index.ts`, `test/server.test.ts`

**Interfaces:**
- `createServer(store, gateway)` returns an Express app with every frozen `/api/v1` endpoint.
- `src/index.ts` wires local guard, LLM, and tool-discovery fallbacks and starts port 8787.

- [ ] **Step 1: Write failing HTTP test**

```ts
test('creates a human issue and exposes scanner issues through frozen endpoints', async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const created = await fetch(`${base}/issues`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Checkout 500', body: 'intermittent' }) });
  assert.equal(created.status, 201);
  const issues = await fetch(`${base}/issues?provenance=keeper_scanner`);
  assert.equal(issues.status, 200);
  assert.ok(Array.isArray(await issues.json()));
  server.close();
});
```

- [ ] **Step 2: Run the test and confirm it fails because the server module does not exist**

Run: `npx tsx --test test/server.test.ts`

- [ ] **Step 3: Implement route projection and bootstrap fallbacks**

```ts
app.post('/api/v1/issues', (req, res) => {
  const issue = gateway.createIssue({ title: req.body.title, body: req.body.body });
  res.status(201).json({ issue_id: issue.issue_id });
});
app.get('/api/v1/events', (req, res) => res.json(store.getEvents(typeof req.query.since === 'string' ? req.query.since : undefined)));
```

- [ ] **Step 4: Run full verification**

Run: `npx tsx --test test/*.test.ts && npm run typecheck`

- [ ] **Step 5: Commit the API and demo wiring**

Run: `git add src/server.ts src/index.ts test/server.test.ts && git commit -m "feat: wire Keeper API demo"`
