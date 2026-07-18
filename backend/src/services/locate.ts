// Teammate B — locate.
//
// Subscribes to `recall.hit`; from the issue text + the prior-art issues' linked files + git
// blame, produces the candidate `file_boundary` and `blame`, and emits `locate.done`. This is
// the "blame -> src/http/retry.ts" step that feeds the planner. Writes a loop_event.

import type { BusEvent, LocateDonePayload, RecallHitPayload } from "../contract";
import type { Service, ServiceDeps } from "./deps";

export function createLocateService({ bus, store, nexla }: ServiceDeps): Service {
  return {
    start() {
      bus.subscribe("recall.hit", async (ev: BusEvent) => {
        const p = ev.payload as Partial<RecallHitPayload>;
        const issueId = p.issue_id ?? ev.issue_id ?? "";
        if (!issueId) return;

        const priorArt = p.prior_art ?? [];
        const priorIds = priorArt.map((a) => a.issue_id);

        // Primary signal: files linked to the prior-art issues recall just surfaced, ordered by
        // recall rank. Fallback: keyword-match the issue text against the Nexla history Nexset.
        let file_boundary = await nexla.linkedFilesForIssues(priorIds);
        if (file_boundary.length === 0) {
          const stored = store.getIssue(issueId);
          const text = stored ? `${stored.title} ${stored.body}` : "";
          const rows = await nexla.priorArtRows(text);
          const seen = new Set<string>();
          for (const { row } of rows) {
            for (const f of row.linked_files) {
              if (!seen.has(f)) {
                seen.add(f);
                file_boundary.push(f);
              }
            }
          }
        }

        // Blame each file in the boundary.
        const blame: { path: string; last_author: string }[] = [];
        for (const path of file_boundary) {
          const b = await nexla.blameFor(path);
          if (b) blame.push({ path, last_author: b.last_author });
        }

        store.appendEvent({
          type: "locate.done",
          issue_id: issueId,
          provenance: "keeper",
          payload: {
            file_boundary,
            blame,
            derived_from: priorIds,
          },
        });

        bus.publish({
          type: "locate.done",
          issue_id: issueId,
          provenance: "keeper",
          payload: { issue_id: issueId, file_boundary, blame } satisfies LocateDonePayload,
        });
      });
    },
  };
}
