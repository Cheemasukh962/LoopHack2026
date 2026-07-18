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
  async complete(_prompt: string, _opts?: { system?: string; model?: string }) { return this.canned.text ?? ""; }
  async completeJson<T>(_prompt: string, _opts?: { system?: string; model?: string }) { return (this.canned.json ?? {}) as T; }
}

export class FakeNexla implements NexlaContext {
  constructor(private owners: { person_id: string; score: number; why: string }[]) {}
  async whoHasContext(_path: string) { return this.owners; }
  async priorArt(_query: string) { return []; }
}
