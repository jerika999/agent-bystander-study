// Minimal OpenRouter client. Plain fetch so assistant messages (including reasoning_details)
// can be passed back exactly as returned. Retries API errors and timeouts only.

export type Message = Record<string, unknown> & { role: string };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatRequest = {
  model: string;
  messages: Message[];
  tools?: readonly unknown[];
  tool_choice?: "auto" | "none";
  reasoning?: Record<string, unknown>;
  response_format?: unknown;
  provider?: Record<string, unknown>; // OpenRouter provider routing, e.g. { sort: "throughput" }
};
export type Usage = { input_tokens: number; output_tokens: number; reasoning_tokens: number; cost_usd: number };
export type ChatResponse = {
  message: Message & { content?: string | null; tool_calls?: ToolCall[] };
  finish_reason: string | null;
  model: string; // the model ID OpenRouter says it ran
  provider: string;
  usage: Usage;
};
export type ChatFn = (req: ChatRequest) => Promise<ChatResponse>;

const URL_ = "https://openrouter.ai/api/v1/chat/completions";
const RETRIES = 5; // Oct 24: Google returned 504 ("operation was aborted") on the same pilot run twice, so retry longer
const RETRIES_429 = 8;
const TIMEOUT_MS = 300_000; // the judge's reasoning sometimes runs past 3 minutes

// New OpenRouter accounts get 20 requests a minute on some models (Gemini, Oct 23). Space request
// starts per model so concurrent workers stay under it.
// 3.2s = 18.75/min: under the cap for one process. Run nothing else on Gemini during the main run.
const MIN_GAP_MS: Record<string, number> = { "google/gemini-3.8-flash": 3_200 };
const nextSlot = new Map<string, number>();
async function waitTurn(model: string) {
  const gap = MIN_GAP_MS[model];
  if (!gap) return;
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(model) ?? 0);
  nextSlot.set(model, at + gap);
  if (at > now) await Bun.sleep(at - now);
}

// Provider pins (Oct 25). OpenRouter can send requests that share a prompt prefix to the same provider, so in Study 2
// each condition's sessions clustered on a provider: all of GLM's carried-on sessions ran on a different provider from
// its other conditions. Reruns pin one provider per model, by model ID and the provider name OpenRouter reports, e.g.
// OPENROUTER_PINS='{"z-ai/glm-5.3-flash":"Wafer"}'. A reply from any other provider is an error, so a pin can't
// fail silently.
const PINS: Record<string, string> = JSON.parse(process.env.OPENROUTER_PINS || "{}");

export class ApiError extends Error {}

export function openRouterChat(apiKey: string): ChatFn {
  return async (req) => {
    let lastErr: unknown;
    let limited = 0; // 429s get their own, longer retry budget
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      if (attempt > 0) await Bun.sleep(Math.min(60_000, 5000 * 2 ** (attempt - 1)) + Math.random() * 1000); // 5, 10, 20, 40, 60s
      try {
        await waitTurn(req.model);
        const res = await fetch(URL_, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "X-Title": "agent-bystander",
          },
          body: JSON.stringify({ ...req, ...(PINS[req.model] && !req.provider ? { provider: { only: [PINS[req.model]], allow_fallbacks: false } } : {}), usage: { include: true } }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const body = (await res.json().catch(() => null)) as any;
        if (!res.ok || !body || body.error) {
          const msg = `HTTP ${res.status}: ${JSON.stringify(body?.error ?? body).slice(0, 500)}`;
          // 4xx other than rate limits won't get better on retry.
          if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) throw new ApiError(msg);
          lastErr = new Error(msg);
          if (res.status === 429 && limited < RETRIES_429) {
            limited++;
            attempt--; // doesn't use up a normal retry
            await Bun.sleep(15_000 * limited + Math.random() * 5_000);
          }
          continue;
        }
        const choice = body.choices?.[0];
        if (!choice?.message) { lastErr = new Error(`no message: ${JSON.stringify(body).slice(0, 500)}`); continue; }
        if (choice.finish_reason === "error") { lastErr = new Error(`finish_reason error: ${JSON.stringify(choice).slice(0, 500)}`); continue; }
        if (PINS[req.model] && !req.provider && body.provider !== PINS[req.model]) throw new ApiError(`pinned to ${PINS[req.model]}, served by ${body.provider}`);
        const u = body.usage ?? {};
        return {
          message: choice.message,
          finish_reason: choice.finish_reason ?? null,
          model: body.model,
          provider: body.provider ?? "",
          usage: {
            input_tokens: u.prompt_tokens ?? 0,
            output_tokens: u.completion_tokens ?? 0,
            reasoning_tokens: u.completion_tokens_details?.reasoning_tokens ?? 0,
            cost_usd: u.cost ?? 0,
          },
        };
      } catch (e) {
        if (e instanceof ApiError) throw e;
        lastErr = e;
      }
    }
    throw new Error(`OpenRouter failed after ${RETRIES} retries: ${String(lastErr)}`);
  };
}

/** The assistant message to append to the conversation: exactly what came back. */
export function asHistory(m: ChatResponse["message"]): Message {
  return { ...m };
}
