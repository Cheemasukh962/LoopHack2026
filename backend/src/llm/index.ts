import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient } from "../contract/index.js";

const DEFAULT_MODEL = "claude-opus-4-8";

export type AnthropicLike = {
  messages: { create(args: any): Promise<{ content: Array<{ type: string; text?: string }> }> };
};

export interface LlmOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  client?: AnthropicLike;
}

/** Strip code fences and parse the first JSON object/array in the text. */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error("no JSON found in model output");
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  const end = candidate.lastIndexOf(close);
  if (end <= start) throw new Error("no JSON found in model output");
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}

export function makeLlmClient(opts: LlmOptions = {}): LlmClient {
  const model = opts.model ?? DEFAULT_MODEL;
  const client: AnthropicLike = opts.client ?? new Anthropic({
    apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY,
    baseURL: opts.baseURL ?? process.env.ANTHROPIC_BASE_URL, // optional Zero.xyz proxy
  });

  async function complete(prompt: string, o?: { system?: string; model?: string }): Promise<string> {
    const res = await client.messages.create({
      model: o?.model ?? model,
      max_tokens: 2048,
      system: o?.system,
      messages: [{ role: "user", content: prompt }],
    });
    return res.content.filter(c => c.type === "text").map(c => c.text ?? "").join("");
  }

  async function completeJson<T>(prompt: string, o?: { system?: string; model?: string }): Promise<T> {
    const sys = (o?.system ? o.system + "\n\n" : "") + "Respond with ONLY valid JSON. No prose, no code fences.";
    const first = await complete(prompt, { ...o, system: sys });
    try {
      return extractJson<T>(first);
    } catch {
      const repair = await complete(
        `Your previous reply was not valid JSON. Re-emit ONLY the JSON value.\n\n${first}`,
        { ...o, system: sys },
      );
      return extractJson<T>(repair);
    }
  }

  return { complete, completeJson };
}
