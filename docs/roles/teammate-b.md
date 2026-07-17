# Teammate B — Context & Recall  (owns Nexla)

**Branch:** `teammate-b`
**Read first:** `AGENTS.md`, `docs/PLAN.md`, everything in `src/contract/`.

You own everything that answers two questions: *"have we seen this before?"* and
*"who actually has context on this code?"* This is the Nexla sponsor lane and the
**"we hit this in #412"** moment that makes recall feel real on stage.

## Mission
Given a new issue, surface prior art, locate the root-cause files via blame, and assign the issue to
the person who **actually touched that code** — not the one whose resume merely claims the skill.

## Files you OWN (only you edit these)
- `src/services/ingest.ts` — subscribes `repo.connected`/`person.added`; loads the seed into a
  simple searchable form; emits `index.ready`, `profile.ready`. (For the demo, "indexing" can read seed.)
- `src/services/recall.ts` — subscribes `issue.created`; finds similar past issues from the seed
  (keyword/embedding-lite is fine); emits `recall.hit` with `prior_art:[{issue_id,similarity,resolution}]`.
- `src/services/locate.ts` — subscribes `recall.hit`; from the issue text + seed blame, produces the
  candidate `file_boundary` and `blame`; emits `locate.done`.
- `src/services/router.ts` — subscribes `plan.created`; computes the assignee from the ownership map
  and emits `route.assigned` with a human-readable `why`.
- `src/nexla/index.ts` — implements `NexlaContext` (`whoHasContext(path)`, `priorArt(query)`).
  Try Nexla MCP/ADK; **fallback: a local module serving the same Nexset shape.** Present the
  architecture either way — that's what wins the Nexla prize.

## The scoring you must defend on stage (PRD §4)
```
context_score(person, module) =
    0.5 * recency_weighted_blame + 0.3 * pr_authorship + 0.2 * review_participation
if total_repo_commits(person) < 5:
    context_score = 0.7 * resume_prior + 0.3 * external_github_prior   // cold-start only
```
Keep it simple. The point: **git blame outranks the resume.** If a resume outranks blame you'll route
an auth bug to someone who never opened the module and it'll be visibly wrong on stage.

## Files you IMPORT but never edit
`src/contract/*` (frozen), A's `src/store.ts` / `src/bus.ts` (via their interfaces).
Write everything through `store` and always `store.appendEvent(...)`.

## Events
Subscribe: `issue.created` (recall), `recall.hit` (locate), `plan.created` (router).
Publish: `recall.hit`, `locate.done`, `route.assigned`.

## Definition of done
1. A seeded issue produces a `recall.hit` naming a real prior issue (e.g. "#412") with a similarity.
2. `locate.done` names the right file(s) from blame.
3. `route.assigned` picks the true code owner with a `why`, and you can show it beating the resume claim.
4. Nexla layer answers `whoHasContext("src/http/retry.ts")` — via MCP if available, REST/local otherwise.

## Do NOT
Build an identity-resolution engine — **hand-map identities in the seed** (same human across git/tracker/GitHub).
Don't touch `src/contract/`.
