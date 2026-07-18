import type { EventBus, EventType, IssueRecord, Store } from "../contract/index.js";

export interface CreateIssueInput {
  title: string;
  body: string;
  issue_id?: string;
  parent_issue?: string | null;
}

export interface Gateway {
  createIssue(input: CreateIssueInput): IssueRecord;
  ingestWebhook(type: EventType, payload: Record<string, unknown>, deliveryId?: string): boolean;
}

/** Converts human input and GitHub-style webhook deliveries into Keeper bus events. */
export const createGateway = (bus: EventBus, store: Store): Gateway => {
  const handledDeliveries = new Set<string>();

  const nextIssueId = (): string => {
    const highest = store.getIssues().reduce((current, issue) => {
      const match = /^ISS-(\d+)$/.exec(issue.issue_id);
      return match ? Math.max(current, Number(match[1])) : current;
    }, 0);
    return `ISS-${highest + 1}`;
  };

  const createIssue = (input: CreateIssueInput): IssueRecord => {
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || !body) throw new Error("Issue title and body are required");

    const issue: IssueRecord = {
      issue_id: input.issue_id ?? nextIssueId(),
      title,
      body,
      state: "open",
      provenance: "human",
      parent_issue: input.parent_issue ?? null,
      children: [],
      branch: null,
      created_at: new Date().toISOString(),
    };
    store.upsertIssue(issue);
    store.appendEvent({
      type: "issue.created",
      issue_id: issue.issue_id,
      provenance: "human",
      payload: { ...issue },
    });
    bus.publish({
      type: "issue.created",
      issue_id: issue.issue_id,
      provenance: "human",
      payload: { ...issue, provenance: "human" },
    });
    return issue;
  };

  const ingestWebhook = (type: EventType, payload: Record<string, unknown>, deliveryId?: string): boolean => {
    if (deliveryId && handledDeliveries.has(deliveryId)) return false;
    if (deliveryId) handledDeliveries.add(deliveryId);

    const issueId = typeof payload.issue_id === "string" ? payload.issue_id : "";
    const provenance = payload.provenance === "human"
      ? "human"
      : typeof payload.provenance === "string" && payload.provenance.startsWith("keeper")
        ? "keeper"
        : null;
    store.appendEvent({ type, issue_id: issueId, provenance, payload });
    bus.publish({ type, issue_id: issueId || undefined, provenance, payload });
    return true;
  };

  return { createIssue, ingestWebhook };
};
