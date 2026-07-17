# Keeper — Backend Demo Plan

## What we're building
A local backend + a **fake-GitHub** stage. A human files **one** issue; Keeper autonomously runs the
full loop — recall → plan → assign → branch → merge → **scan → file its own new issues** — and the
frontend's fake-GitHub UI renders it live. The repo history is **seeded** (we control it); the loop
mechanics (event bus, LLM planning, self re-entry) are **real**. Framing line for judges:
> "We built the set. The camera — the loop — is real. We staged the input, never the finding."

## The spine — the loop we must prove
```
issue.created (human, x1)
  -> recall.hit      "we've seen this — issue #412"      (over seeded history)   [B]
  -> locate.done     blame -> src/http/retry.ts                                  [B]
  -> plan.created    LLM: root cause + file_boundary + test_strategy             [C]
     |- plan.too_large -> decomposer -> issue.created xN   <- LOOP 2 (no human)  [C]
  -> route.assigned  owner of src/http, NOT the resume claimant                  [B]
  -> branch.created  Pomerium authorizes (write is inside boundary)              [C guard / A brancher]
  ... branch.merged (staged PR) ...
  -> scanner reads diff -> files issue.created xN          <- LOOP 5, THE CLOSE  [A]
       |- re-enters triage -> the system created its own work
```
**Loop 5 is the entire pitch. Protect it above everything.**

## The 3 sponsors (build for real)
| Sponsor | Prize | Hook | Owner |
|---|---|---|---|
| **Zero.xyz** | $2,500 cash | Unblocks Claude access + scanner discovers an IaC scanner mid-loop (Terraform in diff) | C |
| **Pomerium** | $1,000 + founder judges | Filing cap ≤5/hr (`pomerium.denied`) + Keeper physically can't write outside `file_boundary` | C |
| **Nexla** | $750 + $5k credits | "Who has context on `src/http/retry.ts`?" ownership + history layer feeding the router | B |

Akash + Fillmore = one honest sentence each in the pitch. No build.

## Seed data = our #1 credibility risk (Teammate A owns `src/seed/`)
- ~4 fake devs: name, handle, email, short resume (cold-start prior), and an **ownership map** over paths
  (e.g. `dana -> src/auth/`, `marco -> src/http/`).
- A plausible file tree: `src/http/retry.ts`, `src/auth/session.ts`, `infra/main.tf`, etc.
- ~20 closed issues/PRs with real-sounding titles/bodies/resolutions/linked files, so `recall.hit`
  returns "#412" and it lands.
- **The one staged PR** we "merge" on stage — pre-authored, known latent bug (retry with no timeout +
  a Terraform misconfig). The scan is real; only the input is staged.

## The 3-minute demo (build backwards from this)
| Time | On screen |
|---|---|
| 0:00 | Human files ONE issue: "intermittent 500s on checkout." Counter: `human_filed = 1`. |
| 0:20 | Loop runs: recall -> #412, blame -> `retry.ts`, LLM writes a real plan, router assigns the TRUE owner (not the resume claimant), branch created. |
| 1:00 | Plan too large -> decomposer -> 3 children -> re-enters triage. **Loop 2, no human.** `keeper_filed` climbs. |
| 1:40 | **THE CLOSE:** merge staged PR -> scanner -> **Zero.xyz discovers IaC scanner** -> files a NEW issue -> re-enters Loop 1. Human never touched it. |
| 2:30 | Try to file a 6th -> **Pomerium denies** -> escalates, doesn't dump. |
| 2:50 | One line Akash (batch indexing offloaded), one line Fillmore (`gap.detected`: "one resignation from unmaintainable"). |

## Build order to 4:30
| By | Milestone |
|---|---|
| ~12:15 | Bus + contract + API skeleton + store on `main`. Frontend gets the contract. |
| ~1:15 | Seed loaded + spine flows with stubs (issue -> LLM plan -> route -> branch). |
| ~2:45 | Real recall, router over ownership map, Pomerium wrapping writes, decomposer firing (Loop 2). |
| ~3:45 | **Scanner: staged merge -> Zero discovery -> files new issue -> Loop 5 verified.** Filing cap works. |
| ~4:15 | Seed polish + dry run with frontend + record demo. **Submit by 4:30.** |

## Why judges believe it's autonomous (20% of score)
A human touches the system exactly once (the first issue). Everything after — decompose, assign,
branch, scan, and **file brand-new issues** — happens on the bus with no hand on the wheel, and the
frontend's `keeper_filed` counter ticks up live to prove it.
