# Keeper — LoopHack 2026

An event-driven agent that turns **one** human-filed issue into a self-sustaining loop:
**recall → plan → assign → branch → merge → scan → file its own next issues → repeat.**
A human touches the system once; everything after runs on the event bus.

This branch (`main`) is the **Compass** web frontend — React 18 + React Router 6 + TypeScript + Vite + Tailwind.
The full event-driven backend (event bus, planner, scanner, services) lives on the
[`mainbackend`](https://github.com/Cheemasukh962/LoopHack2026/tree/mainbackend) branch.

## Run locally

```bash
pnpm install
pnpm dev        # http://localhost:8080
```

## Deploy

Ships to **Vercel** out of the box — `vercel.json` sets the Vite build (`dist/spa`) and SPA routing.
The app runs standalone on local mock data; set `VITE_KEEPER_API_URL` to point it at the live Keeper backend.

## Sponsors — connected

Keeper integrates all three sponsor platforms. Each connects through its official client/SDK using
env-configured credentials, and falls back to a local implementation so the demo also runs fully offline.

- **Nexla** — connected as the **context & recall layer**. A Nexla client authenticates with a service
  key, and ownership/history are modelled as **Nexsets**, answering `whoHasContext(path)` and
  `priorArt(query)` so each issue routes to the true code owner (blame outranks the résumé).
- **Pomerium** — connected as the **write-authorization guardrail** (`@pomerium/js-sdk`). Every write
  (file-issue / branch / assign) is authorized through a Pomerium guard that enforces the plan's
  `file_boundary` and a ≤ 5-issues/hour filing cap, emitting an audit event on every decision.
- **Zero.xyz** — connected in **two places**: it brokers Claude API access (through the Anthropic base
  URL) and powers **on-the-fly tool discovery** (`discoverTool`), so the post-merge scanner picks the
  right tool for a detected signal (e.g. Terraform in the diff → an IaC scanner).

Set `NEXLA_API_KEY`, `POMERIUM_ISSUER` / `POMERIUM_AUDIENCE`, `ZERO_API_URL`, and `ANTHROPIC_API_KEY`
to run against the live services; leave them unset to use the built-in local fallbacks.
