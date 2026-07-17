import type {
  BranchRecord,
  IssueRecord,
  LoopEventRecord,
  PersonRecord,
  PlanRecord,
  Store,
} from "./contract/index.js";

export interface InMemoryStoreSeed {
  people?: PersonRecord[];
  issues?: IssueRecord[];
  plans?: PlanRecord[];
  branches?: BranchRecord[];
}

/** Append-only in-memory backing store for a single Keeper demo process. */
export class InMemoryStore implements Store {
  private readonly people = new Map<string, PersonRecord>();
  private readonly issues = new Map<string, IssueRecord>();
  private readonly plans = new Map<string, PlanRecord[]>();
  private readonly branches = new Map<string, BranchRecord>();
  private readonly events: LoopEventRecord[] = [];

  constructor(seed: InMemoryStoreSeed = {}) {
    for (const person of seed.people ?? []) this.upsertPerson(person);
    for (const issue of seed.issues ?? []) this.upsertIssue(issue);
    for (const plan of seed.plans ?? []) this.insertPlan(plan);
    for (const branch of seed.branches ?? []) this.upsertBranch(branch);
  }

  getPeople(): PersonRecord[] {
    return [...this.people.values()];
  }

  getPerson(id: string): PersonRecord | undefined {
    return this.people.get(id);
  }

  upsertPerson(person: PersonRecord): void {
    this.people.set(person.person_id, person);
  }

  getIssues(filter?: { provenance?: string; state?: string }): IssueRecord[] {
    return [...this.issues.values()].filter((issue) =>
      (!filter?.provenance || issue.provenance === filter.provenance)
      && (!filter?.state || issue.state === filter.state),
    );
  }

  getIssue(id: string): IssueRecord | undefined {
    return this.issues.get(id);
  }

  upsertIssue(issue: IssueRecord): void {
    this.issues.set(issue.issue_id, issue);
  }

  getPlans(issueId: string): PlanRecord[] {
    return [...(this.plans.get(issueId) ?? [])].sort((left, right) => left.version - right.version);
  }

  latestPlan(issueId: string): PlanRecord | undefined {
    return this.getPlans(issueId).at(-1);
  }

  insertPlan(plan: PlanRecord): void {
    const plans = this.plans.get(plan.issue_id) ?? [];
    if (plans.some((existing) => existing.plan_id === plan.plan_id || existing.version === plan.version)) {
      throw new Error(`Plan ${plan.plan_id} would overwrite an existing plan for ${plan.issue_id}`);
    }
    plans.push(plan);
    this.plans.set(plan.issue_id, plans);
  }

  getBranches(): BranchRecord[] {
    return [...this.branches.values()];
  }

  upsertBranch(branch: BranchRecord): void {
    this.branches.set(branch.branch_name, branch);
  }

  appendEvent(event: Omit<LoopEventRecord, "event_id" | "ts">): LoopEventRecord {
    const record: LoopEventRecord = {
      ...event,
      event_id: `evt_${this.events.length + 1}`,
      ts: new Date().toISOString(),
    };
    this.events.push(record);
    return record;
  }

  getEvents(sinceTs?: string): LoopEventRecord[] {
    return sinceTs ? this.events.filter((event) => event.ts > sinceTs) : [...this.events];
  }
}
