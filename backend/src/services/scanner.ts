import type {
  BusEvent,
  EventBus,
  IssueRecord,
  LlmClient,
  PomeriumGuard,
  Store,
  ToolDiscovery,
} from "../contract/index.js";

interface ScannerFinding {
  title: string;
  body: string;
  paths: string[];
}

export interface ScannerDependencies {
  llm: LlmClient;
  guard: PomeriumGuard;
  tools: ToolDiscovery;
  stagedDiff: string;
}

const changedPaths = (diff: string): string[] => [
  ...new Set([...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((match) => match[1])),
];

const stringArray = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string")
  : [];

const findingsFrom = (value: unknown, fallbackPaths: string[]): ScannerFinding[] => {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { findings?: unknown }).findings)
      ? (value as { findings: unknown[] }).findings
      : value && typeof value === "object" && Array.isArray((value as { issues?: unknown }).issues)
        ? (value as { issues: unknown[] }).issues
        : [];

  return raw.flatMap((finding): ScannerFinding[] => {
    if (typeof finding === "string" && finding.trim()) {
      return [{ title: "Scanner finding", body: finding.trim(), paths: fallbackPaths }];
    }
    if (!finding || typeof finding !== "object") return [];
    const record = finding as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (!title) return [];
    const body = typeof record.body === "string"
      ? record.body.trim()
      : typeof record.description === "string"
        ? record.description.trim()
        : title;
    return [{
      title,
      body,
      paths: stringArray(record.paths ?? record.file_boundary).filter(Boolean).length
        ? stringArray(record.paths ?? record.file_boundary).filter(Boolean)
        : fallbackPaths,
    }];
  });
};

const issueIdFor = (store: Store, sourceIssueId: string): string => {
  let sequence = 1;
  let issueId = `SCAN-${sourceIssueId}-${sequence}`;
  while (store.getIssue(issueId)) issueId = `SCAN-${sourceIssueId}-${++sequence}`;
  return issueId;
};

const signalForDiff = (diff: string): { signal: string; hint: string }[] => {
  const signals: { signal: string; hint: string }[] = [];
  if (/^\+\+\+ b\/.*\.tf$/m.test(diff)) {
    signals.push({ signal: "terraform", hint: "Terraform changed in this merged diff" });
  }
  return signals;
};

const scanPrompt = (diff: string): string => `You are Keeper's post-merge risk scanner. Find latent defects and security risks introduced by this diff. Return JSON with a findings array. Each finding must contain title, body, and paths (an array of changed paths). Only report actionable issues.\n\n${diff}`;

/** Registers Loop 5: merged code is scanned and discovered work re-enters issue triage. */
export const registerScanner = (bus: EventBus, store: Store, deps: ScannerDependencies): void => {
  bus.subscribe("branch.merged", async (event: BusEvent) => {
    const payload = event.payload as Record<string, unknown>;
    const diff = typeof payload.diff === "string" ? payload.diff : deps.stagedDiff;
    const sourceIssueId = event.issue_id ?? (typeof payload.issue_id === "string" ? payload.issue_id : "merged-change");
    const paths = changedPaths(diff);

    store.appendEvent({
      type: "scan.started",
      issue_id: sourceIssueId,
      provenance: "keeper",
      payload: { source_issue_id: sourceIssueId, paths },
    });
    bus.publish({
      type: "scan.started",
      issue_id: sourceIssueId,
      provenance: "keeper",
      payload: { source_issue_id: sourceIssueId, paths },
    });

    const llmResult = await deps.llm.completeJson<unknown>(scanPrompt(diff));
    const findings = findingsFrom(llmResult, paths);

    for (const signal of signalForDiff(diff)) {
      const tool = await deps.tools.discoverTool(signal);
      const result = await tool.run(diff);
      findings.push(...findingsFrom(result.findings, paths).map((finding) => ({
        ...finding,
        title: `${tool.tool_name}: ${finding.title}`,
      })));
    }

    for (const finding of findings) {
      const issueId = issueIdFor(store, sourceIssueId);
      const permitted = await deps.guard.authorizeWrite({
        action: "file_issue",
        identity: "keeper",
        scope: finding.paths,
        reason: finding.title,
        issue_id: issueId,
      });
      if (!permitted) continue;

      const issue: IssueRecord = {
        issue_id: issueId,
        title: finding.title,
        body: finding.body,
        state: "open",
        provenance: "keeper_scanner",
        parent_issue: null,
        children: [],
        branch: null,
        created_at: new Date().toISOString(),
      };
      store.upsertIssue(issue);
      store.appendEvent({
        type: "scan.found",
        issue_id: issueId,
        provenance: "keeper",
        payload: { ...finding, issue_id: issueId },
      });
      store.appendEvent({
        type: "issue.created",
        issue_id: issueId,
        provenance: "keeper",
        payload: { ...issue, provenance: "keeper_scanner" },
      });
      bus.publish({
        type: "scan.found",
        issue_id: issueId,
        provenance: "keeper",
        payload: { ...finding, issue_id: issueId },
      });
      bus.publish({
        type: "issue.created",
        issue_id: issueId,
        provenance: "keeper",
        payload: { ...issue, provenance: "keeper_scanner" },
      });
    }
  });
};
