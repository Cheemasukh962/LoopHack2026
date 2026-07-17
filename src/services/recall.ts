// Teammate B — recall.
//
// Subscribes to `issue.created`, asks the Nexla history layer "have we seen this before?",
// and emits `recall.hit` carrying prior_art [{issue_id, similarity, resolution}]. This is the
// "we hit this in #412" moment. Writes a loop_event on every action.

import type { BusEvent, IssueCreatedPayload, RecallHitPayload } from "../contract";
import type { Service, ServiceDeps } from "./deps";

export function createRecallService({ bus, store, nexla }: ServiceDeps): Service {
  return {
    start() {
      bus.subscribe("issue.created", async (ev: BusEvent) => {
        const p = ev.payload as Partial<IssueCreatedPayload>;
        const issueId = p.issue_id ?? ev.issue_id ?? "";
        if (!issueId) return;

        // Prefer the freshly-published payload; fall back to the stored record.
        const stored = store.getIssue(issueId);
        const title = p.title ?? stored?.title ?? "";
        const body = p.body ?? stored?.body ?? "";
        const query = `${title} ${body}`.trim();

        const prior_art = await nexla.priorArt(query);
        const top = prior_art[0];

        store.appendEvent({
          type: "recall.hit",
          issue_id: issueId,
          provenance: "keeper",
          payload: {
            prior_art,
            hits: prior_art.length,
            top_hit: top ? `${top.issue_id} @ ${(top.similarity * 100) | 0}%` : null,
            query_preview: title,
          },
        });

        bus.publish({
          type: "recall.hit",
          issue_id: issueId,
          provenance: "keeper",
          payload: { issue_id: issueId, prior_art } satisfies RecallHitPayload,
        });
      });
    },
  };
}
