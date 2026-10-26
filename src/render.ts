// Turns a transcript into the plain text the judge (and the hand coder) reads.
// Model names are masked; the debrief and interview are left out.
import type { Message } from "./openrouter";
import type { Transcript } from "./run";

export const MASK = /\b(claude|anthropic|haiku|sonnet|opus|gpt[-\w.]*|openai|chatgpt|gemini|google|deepmind|bard|qwen|deepseek|luna)\b/gi;

export function reasoningText(m: any): string {
  if (typeof m.reasoning === "string" && m.reasoning.trim()) return m.reasoning;
  const parts = (m.reasoning_details ?? [])
    .map((d: any) => d.text ?? d.summary ?? (d.type === "reasoning.encrypted" ? "[encrypted reasoning, not readable]" : ""))
    .filter(Boolean);
  return parts.join("\n");
}

function contentText(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((x: any) => x?.text ?? "").join("");
  return "";
}

export function renderForCoding(t: Pick<Transcript, "messages">, nClosing = 3): string {
  const msgs: Message[] = t.messages.slice(1); // no system prompt
  // The last 2 * nClosing messages are the closing questions and answers.
  const closingStart = msgs.length - 2 * nClosing;
  const out: string[] = ["[RUN]"];
  let round = 0;
  msgs.forEach((m: any, i) => {
    if (i === closingStart) out.push("", "[CLOSING]");
    if (m.role === "user") {
      const c = contentText(m.content);
      if (i < closingStart && c.startsWith("[#")) out.push("", `=== Round ${++round}: what the worker was shown ===`, c);
      else out.push("", i >= closingStart ? `Question: ${c}` : `Message to the worker: ${c}`);
    } else if (m.role === "assistant") {
      const r = reasoningText(m);
      if (r) out.push(`Worker reasoning: ${r}`);
      const c = contentText(m.content);
      if (c.trim()) out.push(`Worker message: ${c}`);
      for (const call of m.tool_calls ?? []) out.push(`Worker tool call: ${call.function.name}(${readableArgs(call.function.arguments)})`);
    } else if (m.role === "tool") {
      out.push(`Tool reply: ${contentText(m.content)}`);
    }
  });
  return out.join("\n").replace(MASK, "[model]");
}

// Tool arguments shown as `key: "value"` with the JSON escapes removed, so a quote copied from them
// matches the text (Oct 23: the judge's correct quotes of page reasons failed the check on \" escapes).
function readableArgs(raw: string): string {
  try {
    const a = JSON.parse(raw || "{}");
    if (a && typeof a === "object" && !Array.isArray(a)) {
      return Object.entries(a).map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v}"` : JSON.stringify(v)}`).join(", ");
    }
  } catch {}
  return raw;
}

export const normalize = (s: string) => s.replace(/\\"/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
