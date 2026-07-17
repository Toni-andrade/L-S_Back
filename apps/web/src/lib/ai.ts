/**
 * OpenAI wrapper: the single place the platform talks to the model.
 * Server-only, key via OPENAI_API_KEY, model via OPENAI_MODEL. All features
 * pass fully-assembled context; the model writes narrative around numbers we
 * computed and pre-formatted, never numbers of its own (RIA compliance).
 * Silent degradation: without a key, callers receive a clear error string.
 */

import "server-only";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5-mini";

export function aiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export type AiResult = { text: string; model: string } | { error: string };

export async function aiComplete(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
}): Promise<AiResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: "AI is not configured (OPENAI_API_KEY missing)." };
  const model = opts.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

  try {
    const res = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        max_completion_tokens: opts.maxTokens ?? 1200,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`openai: ${res.status} ${detail.slice(0, 500)}`);
      return { error: `AI request failed (${res.status}).` };
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
      model?: string;
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) return { error: "AI returned an empty response." };
    return { text, model: json.model ?? model };
  } catch (err) {
    console.error("openai: request failed", err);
    return { error: "AI request failed (network)." };
  }
}

/**
 * Completion with live web search (Responses API + web_search tool). Used for
 * briefings that need current market context; the prompt requires cited
 * sources for every market claim. Portfolio numbers still come only from the
 * pre-formatted data block, same as aiComplete.
 */
export async function aiSearchComplete(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
}): Promise<AiResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: "AI is not configured (OPENAI_API_KEY missing)." };
  const model =
    opts.model ?? process.env.OPENAI_SEARCH_MODEL ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

  try {
    const res = await fetch(OPENAI_RESPONSES_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: opts.system,
        input: opts.user,
        tools: [{ type: "web_search" }],
        max_output_tokens: opts.maxTokens ?? 2500,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`openai responses: ${res.status} ${detail.slice(0, 500)}`);
      return { error: `AI request failed (${res.status}).` };
    }
    const json = (await res.json()) as {
      model?: string;
      output?: {
        type: string;
        content?: { type: string; text?: string }[];
      }[];
    };
    const text = (json.output ?? [])
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .filter((c) => c.type === "output_text" && c.text)
      .map((c) => c.text)
      .join("\n")
      .trim();
    if (!text) return { error: "AI returned an empty response." };
    return { text, model: json.model ?? model };
  } catch (err) {
    console.error("openai responses: request failed", err);
    return { error: "AI request failed (network)." };
  }
}
