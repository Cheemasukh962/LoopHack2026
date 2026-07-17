# Keeper spine and scanner design

## Goal

Deliver Teammate A's self-contained backend lane: a local Express demo service in
which a human-created issue enters the event loop and a merged staged PR causes the
scanner to file a new `keeper_scanner` issue without human intervention.

## Approach

Use an in-memory implementation of the frozen contract. The event bus dispatches
subscribers asynchronously and logs every dispatch. The store owns maps for people,
issues, plans, and branches, plus an append-only event list. All services use the
contract interfaces, allowing Teammates B and C to be integrated later without
changing A-owned code.

The server exposes every `/api/v1` route in the frozen API contract. Read routes
project store records into the documented response shapes; `POST /issues` creates a
human-provenance issue via the gateway so it publishes `issue.created`.

The gateway converts issue posts and demo webhook payloads into bus events, using a
delivery-id set to deduplicate webhook replays. It records every gateway action in
the store event trace.

The scanner subscribes to `branch.merged`. For the seeded staged diff it emits
`scan.started`, derives latent findings, requests a discovered tool for Terraform
signals, emits `scan.found`, authorizes each issue filing through the Pomerium
interface, persists the scanner-provenance issue, and publishes `issue.created`.
That final publish is the explicit re-entry into Loop 1.

## Dependency strategy

`src/index.ts` supplies lightweight, deterministic fallback implementations of the
LLM client, Pomerium guard, and tool discovery interfaces until Teammate C's owned
modules arrive. The scanner receives these dependencies by interface, so production
implementations can replace the fallbacks with no scanner change. B/C service
registration remains optional and safely stubbed until their exports exist.

## Seed and demo path

The seed contains four plausible developers, an ownership map, closed issue/PR
history, an open human issue, and a staged diff. The diff contains a retry-timeout
defect and a Terraform configuration signal. A demo `branch.merged` webhook scans
that diff and creates at least one open `keeper_scanner` issue, visible through
`GET /api/v1/issues?provenance=keeper_scanner` and `/api/v1/events`.

## Validation

Typecheck the project, start the server, submit a human issue, then send a
`branch.merged` demo webhook. Assert that the events include scan lifecycle events,
the scanner issue is queryable, and an `issue.created` event was published for it.
