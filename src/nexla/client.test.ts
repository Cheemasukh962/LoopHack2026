import { test } from "node:test";
import assert from "node:assert/strict";
import { NexlaClient } from "./client.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("authenticate exchanges the service key for a Bearer token (200)", async () => {
  let captured: { url: string; auth: string } | null = null;
  const fake = (async (url: string, init: RequestInit) => {
    captured = { url, auth: String((init.headers as Record<string, string>).Authorization) };
    return json({ access_token: "sess-tok", token_type: "Bearer", expires_in: 3600 });
  }) as unknown as typeof fetch;

  const client = new NexlaClient({ apiKey: "svc-key", fetchImpl: fake });
  const auth = await client.authenticate();

  assert.equal(auth.ok, true);
  assert.equal(auth.accessToken, "sess-tok");
  assert.match(captured!.url, /\/token$/);
  // service key must be base64-encoded in Basic auth
  assert.equal(captured!.auth, `Basic ${Buffer.from("svc-key").toString("base64")}`);
});

test("authenticate returns ok:false (fallback) on a non-200", async () => {
  const fake = (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
  const auth = await new NexlaClient({ apiKey: "k", fetchImpl: fake }).authenticate();
  assert.equal(auth.ok, false);
  assert.match(auth.detail, /HTTP 401/);
});

test("authenticate never throws on a network error — it degrades to fallback", async () => {
  const fake = (async () => { throw new Error("getaddrinfo ENOTFOUND"); }) as unknown as typeof fetch;
  const auth = await new NexlaClient({ apiKey: "k", fetchImpl: fake, timeoutMs: 100 }).authenticate();
  assert.equal(auth.ok, false);
  assert.match(auth.detail, /unreachable/);
});

test("queryNexset returns null (→ local fallback) when auth fails", async () => {
  const fake = (async () => new Response("no", { status: 403 })) as unknown as typeof fetch;
  const rows = await new NexlaClient({ apiKey: "k", fetchImpl: fake }).queryNexset("ns_1");
  assert.equal(rows, null);
});
