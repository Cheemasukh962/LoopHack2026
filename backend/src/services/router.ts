// Teammate B — router.
//
// Subscribes to `plan.created`; reads the plan's file_boundary; asks the Nexla ownership layer
// who actually has context on that module; picks the assignee whose git blame outranks any
// résumé claim; and emits `route.assigned` with a human-readable `why`. Optionally clears the
// write through Teammate C's Pomerium guard first. Writes a loop_event on every action.

import type { BusEvent, PlanCreatedPayload, RouteAssignedPayload } from "../contract";
import type { Service, ServiceDeps } from "./deps";

export function createRouterService({ bus, store, nexla, guard }: ServiceDeps): Service {
  return {
    start() {
      bus.subscribe("plan.created", async (ev: BusEvent) => {
        const p = ev.payload as Partial<PlanCreatedPayload>;
        const issueId = p.issue_id ?? ev.issue_id ?? "";
        if (!issueId) return;

        // The module to route on = the plan's file_boundary. Fall back to the latest plan in
        // the store, or (last resort) the most recent locate.done for this issue.
        const plan = store.latestPlan(issueId);
        const fileBoundary = plan?.file_boundary ?? fileBoundaryFromEvents(store, issueId);
        const modulePath = pickModule(fileBoundary);

        if (!modulePath) {
          store.appendEvent({
            type: "route.assigned",
            issue_id: issueId,
            provenance: "keeper",
            payload: { assignee: null, why: "No file_boundary to route on — deferred.", unresolved: true },
          });
          return;
        }

        const candidates = await nexla.whoHasContext(modulePath);
        const winner = candidates[0];

        if (!winner) {
          store.appendEvent({
            type: "route.assigned",
            issue_id: issueId,
            provenance: "keeper",
            payload: { assignee: null, why: `No known owner for ${modulePath}.`, unresolved: true },
          });
          return;
        }

        const person = store.getPerson(winner.person_id);
        const name = person?.name ?? winner.person_id;

        // Contrast the winner against the top résumé-only claimant, if any — this is the line we
        // defend on stage: blame outranks the résumé.
        // The cold-start résumé claimant is flagged in its `why` ("cold-start résumé…"); the
        // blame winner's why says the opposite ("not a résumé claim"), so match on "cold-start".
        const claimant = candidates.find((c) => c.why.includes("cold-start"));
        const why =
          claimant && claimant.person_id !== winner.person_id
            ? `${winner.why} Outranks ${nameFor(store, claimant.person_id)} (${claimant.score.toFixed(2)}, résumé claim, no blame here).`
            : winner.why;

        // Optional Pomerium clearance for the assign action (Teammate C). Proceed if absent.
        if (guard) {
          const ok = await guard.authorizeWrite({
            action: "assign",
            identity: "keeper",
            scope: [modulePath],
            reason: `assign ${issueId} to ${winner.person_id} (context ${winner.score.toFixed(2)})`,
            issue_id: issueId,
          });
          if (!ok) {
            store.appendEvent({
              type: "route.assigned",
              issue_id: issueId,
              provenance: "keeper",
              payload: { assignee: null, why: "Pomerium denied the assign write.", denied: true },
            });
            return;
          }
        }

        const assignee = {
          person_id: winner.person_id,
          name,
          context_score: Number(winner.score.toFixed(4)),
          why,
        };

        store.appendEvent({
          type: "route.assigned",
          issue_id: issueId,
          provenance: "keeper",
          payload: {
            assignee,
            module: modulePath,
            candidates: candidates.map((c) => ({ person_id: c.person_id, score: c.score })),
          },
        });

        bus.publish({
          type: "route.assigned",
          issue_id: issueId,
          provenance: "keeper",
          payload: { issue_id: issueId, assignee } satisfies RouteAssignedPayload,
        });
      });
    },
  };
}

/** Choose the module to route on: the shallowest src/* directory in the boundary, else the first path. */
function pickModule(fileBoundary: string[]): string | null {
  if (!fileBoundary || fileBoundary.length === 0) return null;
  // Prefer a two-segment module dir (e.g. "src/http/retry.ts" -> "src/http").
  const dirs = fileBoundary.map((f) => {
    const parts = f.split("/");
    return parts.length >= 3 ? parts.slice(0, 2).join("/") : parts.slice(0, -1).join("/") || f;
  });
  return dirs[0] ?? fileBoundary[0];
}

function nameFor(store: ServiceDeps["store"], personId: string): string {
  return store.getPerson(personId)?.name ?? personId;
}

/** Last-resort file_boundary: read it back from the most recent locate.done loop_event. */
function fileBoundaryFromEvents(store: ServiceDeps["store"], issueId: string): string[] {
  const events = store.getEvents().filter((e) => e.type === "locate.done" && e.issue_id === issueId);
  const last = events[events.length - 1];
  const fb = last?.payload?.file_boundary;
  return Array.isArray(fb) ? (fb as string[]) : [];
}
