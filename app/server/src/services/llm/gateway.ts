import { config } from "../../config.js";
import type { User } from "../../db/schema.js";
import { resolveEffectiveLlm } from "../auth.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * OpenAI Chat Completions-compatible gateway.
 * Returns null content when no endpoint/key configured (caller may mock).
 */
export async function chatCompletions(
  user: User,
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number },
): Promise<{ content: string; mocked: boolean; model: string }> {
  const llm = resolveEffectiveLlm(user);
  if (!llm.baseUrl || !llm.apiKey || !llm.modelId) {
    return { content: "", mocked: true, model: "none" };
  }

  const base = llm.baseUrl.replace(/\/$/, "");
  const url = base.endsWith("/chat/completions")
    ? base
    : `${base}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${llm.apiKey}`,
    },
    body: JSON.stringify({
      model: llm.modelId,
      messages,
      temperature: opts?.temperature ?? 0.3,
      max_tokens: opts?.maxTokens ?? 2048,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim() || "";
  return { content, mocked: false, model: llm.modelId };
}

export function appDisplayName(): string {
  return config.appName;
}
