import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { InMemoryEventBus } from "../src/bus.js";
import { InMemoryStore } from "../src/store.js";
import { createServer } from "../src/server.js";
import { createGateway } from "../src/services/gateway.js";

test("serves frozen issue, stats, and event endpoints after a human issue is created", async () => {
  const store = new InMemoryStore();
  const gateway = createGateway(new InMemoryEventBus(), store);
  const app = createServer(store, gateway);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/v1`;

  try {
    const created = await fetch(`${base}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Checkout intermittently returns 500", body: "Customers cannot complete orders." }),
    });
    assert.equal(created.status, 201);
    const { issue_id } = await created.json() as { issue_id: string };

    const issues = await fetch(`${base}/issues?provenance=human`);
    assert.equal(issues.status, 200);
    assert.equal((await issues.json() as { issue_id: string }[])[0].issue_id, issue_id);

    const stats = await fetch(`${base}/stats`);
    assert.deepEqual(await stats.json(), { human_filed: 1, keeper_filed: 0, plans_revised: 0, branches_open: 0 });

    const events = await fetch(`${base}/events`);
    assert.equal((await events.json() as { type: string }[])[0].type, "issue.created");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
