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
  return (last?.payload as unknown as RecallHitPayload | undefined)?.prior_art ?? [];
}

export function registerPlanner(deps: {
  bus: EventBus; store: Store; llm: LlmClient; nexla?: NexlaContext; opts?: PlannerOptions;
}): void {
  const { bus, store, llm, nexla } = deps;
  const sizeThreshold = deps.opts?.sizeThreshold ?? Number(process.env.PLAN_SIZE_THRESHOLD ?? 5);
  const callSiteThreshold = deps.opts?.callSiteThreshold ?? 20;

  bus.subscribe("locate.done", async (event: BusEvent) => {
    const p = event.payload as unknown as LocateDonePayload;
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
