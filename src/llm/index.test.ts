import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson, makeLlmClient, type AnthropicLike } from "./index.js";

test("extractJson parses fenced json", () => {
  const out = extractJson<{ a: number }>("```json\n{ \"a\": 1 }\n```");
  assert.equal(out.a, 1);
});

test("extractJson parses bare json with surrounding prose", () => {
  const out = extractJson<{ b: string }>("Here is the plan: { \"b\": \"x\" } thanks");
  assert.equal(out.b, "x");
});

test("extractJson throws on no json", () => {
  assert.throws(() => extractJson("no json here"), /no JSON/);
});

test("makeLlmClient.complete returns concatenated text from injected client", async () => {
  const fake: AnthropicLike = {
    messages: { async create() { return { content: [{ type: "text", text: "hello" }] }; } },
  };
  const llm = makeLlmClient({ client: fake, model: "claude-opus-4-8" });
  assert.equal(await llm.complete("hi"), "hello");
});

test("makeLlmClient.completeJson parses model output", async () => {
  const fake: AnthropicLike = {
    messages: { async create() { return { content: [{ type: "text", text: "{ \"root\": \"ok\" }" }] }; } },
  };
  const llm = makeLlmClient({ client: fake });
  assert.deepEqual(await llm.completeJson<{ root: string }>("p"), { root: "ok" });
});
