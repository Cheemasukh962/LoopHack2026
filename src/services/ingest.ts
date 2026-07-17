// Teammate B — ingest.
//
// Subscribes to `repo.connected` / `person.added`, loads the seed into a simple searchable
// form (for the demo, "indexing" = making sure people/index are in the store), and emits
// `index.ready` / `profile.ready`. Writes a loop_event on every action — no event = invisible
// on the frontend trace.

import type { BusEvent, PersonRecord } from "../contract";
import type { Service, ServiceDeps } from "./deps";

export function createIngestService({ bus, store }: ServiceDeps): Service {
  return {
    start() {
      // Repo connected -> build/refresh the searchable index over the seed.
      bus.subscribe("repo.connected", async (ev: BusEvent) => {
        const repoUrl = (ev.payload?.repo_url as string) ?? "seed://local";

        // If the store has no people yet (A hasn't seeded, or we're running my lane solo),
        // hydrate people from the Nexla ownership Nexset so recall/router have data to work on.
        if (store.getPeople().length === 0) {
          for (const p of ROSTER) store.upsertPerson(p);
        }

        const people = store.getPeople();
        const paths = uniquePaths(people);

        store.appendEvent({
          type: "index.ready",
          issue_id: "",
          provenance: "keeper",
          payload: {
            repo_url: repoUrl,
            people_indexed: people.length,
            paths_indexed: paths.length,
            source: "nexla_ownership_nexset",
          },
        });

        bus.publish({
          type: "index.ready",
          provenance: "keeper",
          payload: { repo_url: repoUrl, people_indexed: people.length, paths_indexed: paths.length },
        });
      });

      // A person was added -> mark their profile searchable.
      bus.subscribe("person.added", async (ev: BusEvent) => {
        const personId = (ev.payload?.person_id as string) ?? "";
        const person = personId ? store.getPerson(personId) : undefined;

        store.appendEvent({
          type: "profile.ready",
          issue_id: "",
          provenance: "keeper",
          payload: {
            person_id: personId,
            name: person?.name ?? null,
            cold_start: person?.cold_start ?? null,
          },
        });

        bus.publish({
          type: "profile.ready",
          provenance: "keeper",
          payload: { person_id: personId },
        });
      });
    },
  };
}

/** Distinct context-score paths across all people (the module index). */
function uniquePaths(people: PersonRecord[]): string[] {
  const s = new Set<string>();
  for (const p of people) for (const path of Object.keys(p.context_scores ?? {})) s.add(path);
  return [...s];
}

// A minimal roster mirroring the Nexla ownership Nexset. Kept here (not in A's seed) so the
// ingest service can stand up the store when running the B lane in isolation. When A's real
// seed is present, the store already has people and this is never used.
const ROSTER: PersonRecord[] = [
  {
    person_id: "p_marco", name: "Marco Reyes", github_handle: "marco", email: "marco@keeper.dev",
    resume_parsed: { skills: ["http", "reliability"], stacks: ["node", "go"] },
    external_github: { langs: ["ts", "go"], repo_count: 18, top_stacks: ["http", "distsys"] },
    repo_commits: 47, context_scores: { "src/http": 0.79 }, cold_start: false,
  },
  {
    person_id: "p_dana", name: "Dana Okafor", github_handle: "dana", email: "dana@keeper.dev",
    resume_parsed: { skills: ["auth", "security"], stacks: ["node"] },
    external_github: { langs: ["ts"], repo_count: 9, top_stacks: ["auth"] },
    repo_commits: 33, context_scores: { "src/auth": 0.78 }, cold_start: false,
  },
  {
    person_id: "p_priya", name: "Priya Nair", github_handle: "priya", email: "priya@keeper.dev",
    resume_parsed: { skills: ["terraform", "aws"], stacks: ["infra"] },
    external_github: { langs: ["hcl"], repo_count: 6, top_stacks: ["infra"] },
    repo_commits: 21, context_scores: { infra: 0.76 }, cold_start: false,
  },
  {
    person_id: "p_lee", name: "Lee Zhou", github_handle: "lee", email: "lee@keeper.dev",
    resume_parsed: { skills: ["http", "review"], stacks: ["node"] },
    external_github: { langs: ["ts"], repo_count: 4, top_stacks: ["http"] },
    repo_commits: 12, context_scores: { "src/http": 0.28 }, cold_start: false,
  },
  {
    // The résumé claimant: CV screams HTTP expertise, but 0 commits in src/http.
    person_id: "p_sam", name: "Sam Delgado", github_handle: "samd", email: "sam@keeper.dev",
    resume_parsed: { skills: ["http", "networking", "reliability", "sre"], stacks: ["node", "python"] },
    external_github: { langs: ["py", "ts"], repo_count: 22, top_stacks: ["http", "sre"] },
    repo_commits: 1, context_scores: {}, cold_start: true,
  },
];
