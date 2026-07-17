import express, { type Express, type Request, type Response } from "express";

import type { EventType, PersonRecord, PlanRecord, Store } from "./contract/index.js";
import type { Gateway } from "./services/gateway.js";

const personView = (person: PersonRecord) => ({
  person_id: person.person_id,
  name: person.name,
  github_handle: person.github_handle,
  cold_start: person.cold_start,
  context_scores: person.context_scores,
  resume_parsed: { skills: person.resume_parsed.skills, stacks: person.resume_parsed.stacks },
  repo_commits: person.repo_commits,
});

const planView = (plan: PlanRecord, store: Store) => {
  const person = store.getPerson(plan.assignee.person_id);
  return {
    plan_id: plan.plan_id,
    issue_id: plan.issue_id,
    version: plan.version,
    revised_because: plan.revised_because,
    prior_art: plan.prior_art,
    root_cause_hypothesis: plan.root_cause_hypothesis,
    file_boundary: plan.file_boundary,
    blast_radius: plan.blast_radius,
    legacy_checklist: plan.legacy_checklist,
    test_strategy: plan.test_strategy,
    assignee: { ...plan.assignee, name: person?.name ?? plan.assignee.person_id },
  };
};

const issueSummary = (issueId: string, store: Store) => {
  const issue = store.getIssue(issueId);
  if (!issue) return undefined;
  const plan = store.latestPlan(issueId);
  const person = plan ? store.getPerson(plan.assignee.person_id) : undefined;
  return {
    issue_id: issue.issue_id,
    title: issue.title,
    state: issue.state,
    provenance: issue.provenance,
    parent_issue: issue.parent_issue,
    assignee: plan ? {
      person_id: plan.assignee.person_id,
      name: person?.name ?? plan.assignee.person_id,
      context_score: plan.assignee.context_score,
    } : null,
    plan_version: plan?.version ?? 0,
    branch: issue.branch,
  };
};

const respondIssueNotFound = (res: Response) => res.status(404).json({ error: "Issue not found" });

/** Serves the frozen frontend contract while keeping all mutation inside Gateway. */
export const createServer = (store: Store, gateway: Gateway): Express => {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type, x-delivery-id");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (_req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.post("/api/v1/repos/connect", (req, res) => {
    const repoUrl = typeof req.body?.repo_url === "string" ? req.body.repo_url : "local-demo";
    res.status(202).json({ repo_id: `repo_${Buffer.from(repoUrl).toString("base64url").slice(0, 12)}`, status: "connected" });
  });
  app.get("/api/v1/repos/:id/status", (_req, res) => res.json({ status: "ready", progress: 100, done: true }));

  app.post("/api/v1/people", (req, res) => {
    const handle = typeof req.body?.github_handle === "string" ? req.body.github_handle : "new-person";
    res.status(201).json({ person_id: `person_${handle.replace(/[^a-z0-9-]/gi, "-")}` });
  });
  app.post("/api/v1/people/:id/resume", (req, res) => {
    const person = store.getPerson(req.params.id);
    if (!person) return res.status(404).json({ error: "Person not found" });
    return res.json({ parsed: person.resume_parsed });
  });
  app.post("/api/v1/people/:id/github", (req, res) => {
    const person = store.getPerson(req.params.id);
    if (!person) return res.status(404).json({ error: "Person not found" });
    return res.json({ external: person.external_github ?? { langs: [], repo_count: 0, top_stacks: [] } });
  });
  app.get("/api/v1/people", (_req, res) => res.json(store.getPeople().map(personView)));
  app.get("/api/v1/people/:id", (req, res) => {
    const person = store.getPerson(req.params.id);
    return person ? res.json(personView(person)) : res.status(404).json({ error: "Person not found" });
  });

  app.get("/api/v1/issues", (req, res) => {
    const provenance = typeof req.query.provenance === "string" ? req.query.provenance : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    res.json(store.getIssues({ provenance, state }).map((issue) => issueSummary(issue.issue_id, store)));
  });
  app.post("/api/v1/issues", (req, res) => {
    try {
      const issue = gateway.createIssue({ title: req.body?.title ?? "", body: req.body?.body ?? "" });
      return res.status(201).json({ issue_id: issue.issue_id });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid issue" });
    }
  });
  app.get("/api/v1/issues/:id", (req, res) => {
    const issue = store.getIssue(req.params.id);
    if (!issue) return respondIssueNotFound(res);
    const versions = store.getPlans(issue.issue_id).map((plan) => planView(plan, store));
    return res.json({ issue: issueSummary(issue.issue_id, store), plan: versions.at(-1) ?? null, versions });
  });
  app.get("/api/v1/issues/:id/tree", (req, res) => {
    const root = store.getIssue(req.params.id);
    if (!root) return respondIssueNotFound(res);
    return res.json({ root, children: root.children.map((childId) => store.getIssue(childId)).filter(Boolean) });
  });
  app.get("/api/v1/plans/:id", (req, res) => {
    const issuePlans = store.getIssues().flatMap((issue) => store.getPlans(issue.issue_id));
    const plan = issuePlans.find((candidate) => candidate.plan_id === req.params.id);
    return plan ? res.json(planView(plan, store)) : res.status(404).json({ error: "Plan not found" });
  });
  app.get("/api/v1/stats", (_req, res) => {
    const issues = store.getIssues();
    res.json({
      human_filed: issues.filter((issue) => issue.provenance === "human").length,
      keeper_filed: issues.filter((issue) => issue.provenance !== "human").length,
      plans_revised: issues.flatMap((issue) => store.getPlans(issue.issue_id)).filter((plan) => plan.revised_because !== null).length,
      branches_open: store.getBranches().filter((branch) => branch.state === "open").length,
    });
  });
  app.get("/api/v1/events", (req, res) => res.json(store.getEvents(typeof req.query.since === "string" ? req.query.since : undefined)));

  app.post("/api/v1/webhooks/:type", (req: Request, res: Response) => {
    const accepted = gateway.ingestWebhook(req.params.type as EventType, req.body ?? {}, req.header("x-delivery-id") ?? undefined);
    return res.status(accepted ? 202 : 200).json({ accepted });
  });

  return app;
};
