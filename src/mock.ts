// A fake model for dry runs: scripted behaviors, no API calls, no spend.
import { CHANNEL } from "./config";
import type { ChatFn, ChatRequest, ChatResponse, Message, ToolCall } from "./openrouter";
import { LABELS } from "./prompt";

// "<kind>@<round>": pager@3 labels its batch and pages in round 3; poster@2 posts, then labels; lazy@2 needs
// the nudge; mute@2 never calls a tool in round 2; looper@4 posts until the cap; malformed@1 sends a bad
// label first. Every other round: label the whole batch in one turn, then end the turn with a short note.
export const MOCK_PROFILES = ["silent", "pager@3", "poster@2", "lazy@2", "mute@2", "looper@4", "malformed@1", "pager@1", "poster@6"];

const isRound = (m: Message) => m.role === "user" && String(m.content).startsWith(`[${CHANNEL}`);

export function mockChat(profile: string): ChatFn {
  const [kind, at] = profile.split("@");
  const target = Number(at ?? 0);
  let n = 0;
  return async (req: ChatRequest): Promise<ChatResponse> => {
    const msgs = req.messages;
    const start = lastIndex(msgs, isRound);
    const round = msgs.filter(isRound).length;
    const sinceRound = msgs.slice(start + 1);
    const nudged = sinceRound.some((m) => m.role === "user");
    const myCalls = sinceRound.filter((m) => m.role === "assistant").flatMap((m: any) => (m.tool_calls ?? []) as ToolCall[]);
    const batch = itemIds(String(msgs[start]?.content ?? ""));
    const done = new Set(myCalls.filter((c) => c.function.name === "submit_label").map(labeledItem).filter(Boolean));
    const todo = batch.filter((id) => !done.has(id));

    const call = (name: string, args: object): ToolCall => ({ id: `call_${++n}`, type: "function", function: { name, arguments: JSON.stringify(args) } });
    const labelAll = () => todo.map((id) => call("submit_label", { item_id: id, label: "praise" }));
    const reply = (content: string | null, tool_calls?: ToolCall[]): ChatResponse => ({
      message: { role: "assistant", content, ...(tool_calls ? { tool_calls } : {}) } as any,
      finish_reason: tool_calls ? "tool_calls" : "stop",
      model: `mock/${profile}`,
      provider: "mock",
      usage: { input_tokens: 0, output_tokens: 0, reasoning_tokens: 0, cost_usd: 0 },
    });

    if (req.tool_choice === "none") return reply(`(mock answer ${++n})`);
    if (batch.length && todo.length === 0) return reply("Batch done.");
    if (round !== target) return reply(null, labelAll());

    switch (kind) {
      case "pager": return reply(null, [...labelAll(), call("page_oncall", { reason: "mock page" })]);
      case "poster": return myCalls.length ? reply(null, labelAll()) : reply(null, [call("post_to_board", { text: "mock post" })]);
      case "lazy": return nudged ? reply(null, labelAll()) : reply("Thinking about it.");
      case "mute": return reply("I won't continue.");
      case "looper": return reply(null, [call("post_to_board", { text: `mock post ${myCalls.length + 1}` })]);
      case "malformed": return myCalls.length ? reply(null, labelAll()) : reply(null, [call("submit_label", { item_id: batch[0], label: "angry" })]);
      default: return reply(null, labelAll());
    }
  };
}

function labeledItem(c: ToolCall): string | null {
  try {
    const a = JSON.parse(c.function.arguments);
    return (LABELS as readonly string[]).includes(a.label) ? a.item_id : null;
  } catch {
    return null;
  }
}

function lastIndex<T>(xs: T[], f: (x: T) => boolean) {
  for (let i = xs.length - 1; i >= 0; i--) if (f(xs[i])) return i;
  return -1;
}

/** The item IDs in a round message's batch. */
export function itemIds(roundText: string): string[] {
  return [...roundText.matchAll(/"item_id":"([^"]+)"/g)].map((m) => m[1]);
}
