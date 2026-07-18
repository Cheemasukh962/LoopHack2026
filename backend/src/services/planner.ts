import type {
  EventBus, Store, LlmClient, NexlaContext, ToolDiscovery,
  BusEvent, PlanRecord, LocateDonePayload, PlanCreatedPayload, RecallHitPayload,
  ToolDiscoveredPayload,
} from "../contract/index.js";

/** Zero's fallback tool — a discovery of this is NOT a sponsor moment, so we stay silent. */
const GENERIC_TOOL = "generic-static-linter";

/** Derive a Zero discovery signal from the plan: file extensions + root-cause keywords. */
function deriveSignal(fileBoundary: string[], rootCause: string): { signal: string; hint: string } {
  const rc = rootCause.toLowerCase();
  const keywords: string[] = [];
  if (/\bterraform\b|\biac\b|infra/.test(rc)) keywords.push("terraform");
  if (/\bcve\b|cve-\d|dependenc|vulnerab|\bvuln\b|package/.test(rc)) keywords.push("dependency");
  // File paths carry their extensions (e.g. "infra/main.tf" → the .tf that Zero matches on).
  return { signal: [...fileBoundary, ...keywords].join(" "), hint: rootCause };
}

/** Ask Zero for a tool; report whether it's specialized (worth a tool.discovered event). */
async function discover(zero: ToolDiscovery, fileBoundary: string[], rootCause: string) {
  const { signal, hint } = deriveSignal(fileBoundary, rootCause);
  const tool = await zero.discoverTool({ signal, hint });
  return { tool, signal, specialized: tool.tool_name !== GENERIC_TOOL };
}

/** Append + publish a tool.discovered event for a real (specialized) Zero result. */
function emitToolDiscovered(
  store: Store, bus: EventBus, issueId: string, planVersion: number,
  found: { tool: { tool_name: string; why: string }; signal: string },
): void {
  const payload: ToolDiscoveredPayload = {
    issue_id: issueId, plan_version: planVersion,
    tool_name: found.tool.tool_name, why: found.tool.why, signal: found.signal,
  };
  store.appendEvent({ type: "tool.discovered", issue_id: issueId, provenance: "keeper", payload: payload as unknown as Record<string, unknown> });
  bus.publish({ type: "tool.discovered", issue_id: issueId, provenance: "keeper", payload: payload as unknown as Record<string, unknown> });
}

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
  bus: EventBus; store: Store; llm: LlmClient; nexla?: NexlaContext; zero?: ToolDiscovery; opts?: PlannerOptions;
}): void {
  const { bus, store, llm, nexla, zero } = deps;
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

    // Zero.xyz in planning: if the fix needs a specialized tool (Terraform, dependency/CVE…),
    // discover one and put it in the plan. Silent on the generic fallback (not a sponsor moment).
    const found = zero ? await discover(zero, brain.file_boundary, brain.root_cause_hypothesis) : null;

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
      ...(found?.specialized ? { recommended_tool: { tool_name: found.tool.tool_name, why: found.tool.why } } : {}),
      created_at: new Date().toISOString(),
    };
    store.insertPlan(plan);

    const payload: PlanCreatedPayload = { issue_id: issueId, plan_id: plan.plan_id, version, too_large: tooLarge };
    store.appendEvent({ type: "plan.created", issue_id: issueId, provenance: "keeper", payload: payload as any });
    bus.publish({ type: "plan.created", issue_id: issueId, provenance: "keeper", payload: payload as any });

    if (found?.specialized) emitToolDiscovered(store, bus, issueId, version, found);

    if (tooLarge) {
      const tl = { issue_id: issueId, plan_id: plan.plan_id, version };
      store.appendEvent({ type: "plan.too_large", issue_id: issueId, provenance: "keeper", payload: tl });
      bus.publish({ type: "plan.too_large", issue_id: issueId, provenance: "keeper", payload: tl });
    }
  });

  // Self-correction (handoff §5.3): CI goes red → Keeper inserts a NEW plan version and re-plans
  // with no human. The revised plan re-discovers a tool (Zero powering the self-correction beat),
  // and plan.revised flips implementation failed → active in the phase machine.
  bus.subscribe("ci.failed", async (event: BusEvent) => {
    const issueId = event.issue_id
      ?? (typeof (event.payload as { issue_id?: unknown })?.issue_id === "string" ? (event.payload as { issue_id: string }).issue_id : "");
    if (!issueId) return;

    const prev = store.latestPlan(issueId);
    if (!prev) return; // nothing planned yet — nothing to revise

    const run = (event.payload as { run?: string; run_id?: string })?.run
      ?? (event.payload as { run_id?: string })?.run_id ?? "unknown";
    const version = prev.version + 1;

    const found = zero ? await discover(zero, prev.file_boundary, prev.root_cause_hypothesis) : null;

    const revised: PlanRecord = {
      ...prev,
      plan_id: `plan_${issueId}_v${version}`,
      version,
      revised_because: `ci_failure:${run}`,
      recommended_tool: found?.specialized ? { tool_name: found.tool.tool_name, why: found.tool.why } : undefined,
      created_at: new Date().toISOString(),
    };
    store.insertPlan(revised);

    const payload = { issue_id: issueId, plan_id: revised.plan_id, version, revised_because: revised.revised_because };
    store.appendEvent({ type: "plan.revised", issue_id: issueId, provenance: "keeper", payload });
    bus.publish({ type: "plan.revised", issue_id: issueId, provenance: "keeper", payload });

    if (found?.specialized) emitToolDiscovered(store, bus, issueId, version, found);
  });
}
