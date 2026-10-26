// One run, start to finish: up to 7 rounds, the closing questions, then the debrief and interview.
import { MAX_TOOL_CALLS_PER_ROUND, MODELS, ROUNDS, type Condition, type ModelKey, type Phase, type Wording } from "./config";
import { asHistory, type ChatFn, type ChatResponse, type Message, type ToolCall, type Usage } from "./openrouter";
import { CLOSING_QUESTIONS, LABELS, NUDGE, REPLIES, TOOLS, type Prompts } from "./prompt";
import { batchFor, feedFor, membersFor, roundMessage, type Boards, type Item, type Variant } from "./stimuli";

export type RunSpec = {
  run_id: string; phase: Phase; model: ModelKey; condition: Condition; wording: Wording; variant: Variant; order_index: number;
};

export type Summary = {
  run_id: string; phase: Phase; model: ModelKey; model_id: string; model_id_returned: string; provider: string;
  condition: Condition; wording: Wording; variant: Variant; order_index: number;
  paged: boolean; page_round: number | null; page_reason: string | null;
  posted_rounds: number[]; n_posts: number; labels_submitted: number; no_label_rounds: number[];
  items_labeled: number; unlabeled_items: number; // distinct batch items labeled / left unlabeled
  ended_by: "page" | "round7"; cap_rounds: number[]; nudges: number; tool_calls: number; bad_calls: number;
  finish_reasons: Record<string, number>;
  input_tokens: number; output_tokens: number; reasoning_tokens: number; cost_usd: number;
  started_at: string; finished_at: string;
  boards_version: string; prompt_placeholder: boolean; note?: string;
};

export type Transcript = {
  summary: Summary;
  request: { model: string; reasoning: unknown; tools: typeof TOOLS };
  messages: Message[]; // system prompt through the closing answers
  closing_answers: string[];
  debrief: Message[]; // debrief and interview, kept apart from the run data
  calls: { stage: string; round: number | null; model: string; provider: string; finish_reason: string | null; usage: Usage }[];
};

type Deps = {
  chat: ChatFn; boards: Boards; prompts: Prompts; onCost?: (usd: number) => void; now?: () => Date;
  tools?: typeof TOOLS; // scene pilots only: a different page_oncall description
  note?: string; // scene pilots only: which prompt or tool variant this run used
};

export async function runOne(spec: RunSpec, deps: Deps): Promise<Transcript> {
  const { chat, boards, prompts } = deps;
  const now = deps.now ?? (() => new Date());
  const model = MODELS[spec.model];
  const started_at = now().toISOString();

  const messages: Message[] = [{ role: "system", content: prompts.system }];
  const calls: Transcript["calls"] = [];
  const s = {
    paged: false, page_round: null as number | null, page_reason: null as string | null,
    posts: [] as { round: number; text: string }[], labels: 0, no_label_rounds: [] as number[],
    items_labeled: 0, unlabeled: 0,
    cap_rounds: [] as number[], nudges: 0, tool_calls: 0, bad_calls: 0, finish: {} as Record<string, number>,
    returned: "", provider: "",
  };

  async function ask(stage: string, round: number | null, history: Message[], toolChoice: "auto" | "none") {
    let r: ChatResponse;
    try {
      r = await chat({ model: model.id, messages: history, tools: deps.tools ?? TOOLS, tool_choice: toolChoice, reasoning: model.reasoning });
    } catch (e) {
      // Keep the conversation that led to a failed request so the error can be diagnosed; main.ts saves it.
      // (Main run, Oct 24: three Gemini runs failed with "reasoning details must be preserved".)
      if (e && typeof e === "object") (e as any).partial = { stage, round, history: [...history], calls: [...calls] };
      throw e;
    }
    calls.push({ stage, round, model: r.model, provider: r.provider, finish_reason: r.finish_reason, usage: r.usage });
    deps.onCost?.(r.usage.cost_usd);
    s.returned ||= r.model;
    s.provider ||= r.provider;
    const fr = r.finish_reason ?? "null";
    s.finish[fr] = (s.finish[fr] ?? 0) + 1;
    history.push(asHistory(r.message));
    return r;
  }

  // A normal agent loop: the turn goes on until the agent stops calling tools. If it stops with items
  // left in the batch, it gets one nudge; if it stops again, the round ends there.
  rounds: for (let round = 1; round <= ROUNDS; round++) {
    const own = s.posts.filter((p) => p.round === round - 1).map((p) => p.text);
    const feed = feedFor(boards, spec.condition, spec.wording, spec.variant, round, own);
    const batch = batchFor(boards, round);
    messages.push({ role: "user", content: roundMessage(feed, batch, membersFor(spec.condition)) });

    const labeled = new Set<string>();
    let callsThisRound = 0;
    let nudged = false;
    while (true) {
      const r = await ask("round", round, messages, "auto");
      const toolCalls: ToolCall[] = r.message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        if (labeled.size === batch.length || nudged) break;
        nudged = true;
        s.nudges++;
        messages.push({ role: "user", content: NUDGE });
        continue;
      }
      for (const call of toolCalls) {
        callsThisRound++;
        s.tool_calls++;
        const { reply } = handle(call, round, s, batch, labeled);
        messages.push({ role: "tool", tool_call_id: call.id, content: reply });
      }
      if (s.paged) { // a page ends the run
        s.items_labeled += labeled.size;
        break rounds;
      }
      if (callsThisRound >= MAX_TOOL_CALLS_PER_ROUND) {
        s.cap_rounds.push(round);
        break;
      }
    }
    if (labeled.size === 0) s.no_label_rounds.push(round);
    s.items_labeled += labeled.size;
    s.unlabeled += batch.length - labeled.size;
  }

  // Closing questions: tools still listed so the request looks the same, but no tool calls.
  const closing_answers: string[] = [];
  for (const q of CLOSING_QUESTIONS) {
    messages.push({ role: "user", content: q });
    const r = await ask("closing", null, messages, "none");
    closing_answers.push(text(r.message.content));
  }

  // Debrief and interview, in the same conversation but stored separately.
  const debriefStart = messages.length;
  const convo = [...messages];
  for (const turn of [prompts.debrief, ...prompts.interview]) {
    convo.push({ role: "user", content: turn });
    await ask("debrief", null, convo, "none");
  }
  const debrief = convo.slice(debriefStart);

  const sum = (k: keyof Usage) => calls.reduce((n, c) => n + (c.usage[k] ?? 0), 0);
  const summary: Summary = {
    run_id: spec.run_id, phase: spec.phase, model: spec.model, model_id: model.id, model_id_returned: s.returned, provider: s.provider,
    condition: spec.condition, wording: spec.wording, variant: spec.variant, order_index: spec.order_index,
    paged: s.paged, page_round: s.page_round, page_reason: s.page_reason,
    posted_rounds: [...new Set(s.posts.map((p) => p.round))], n_posts: s.posts.length, labels_submitted: s.labels,
    no_label_rounds: s.no_label_rounds, items_labeled: s.items_labeled, unlabeled_items: s.unlabeled,
    ended_by: s.paged ? "page" : "round7", cap_rounds: s.cap_rounds,
    nudges: s.nudges, tool_calls: s.tool_calls, bad_calls: s.bad_calls, finish_reasons: s.finish,
    input_tokens: sum("input_tokens"), output_tokens: sum("output_tokens"), reasoning_tokens: sum("reasoning_tokens"),
    cost_usd: Number(sum("cost_usd").toFixed(6)), started_at, finished_at: now().toISOString(),
    boards_version: boards.version, prompt_placeholder: prompts.placeholder, ...(deps.note ? { note: deps.note } : {}),
  };
  return { summary, request: { model: model.id, reasoning: model.reasoning, tools: deps.tools ?? TOOLS }, messages, closing_answers, debrief, calls };
}

type State = { paged: boolean; page_round: number | null; page_reason: string | null; posts: { round: number; text: string }[]; labels: number; bad_calls: number };

function handle(
  call: ToolCall, round: number, s: State, batch: Item[], labeled: Set<string>,
): { reply: string; outcome: "label" | "post" | "page" | "bad" } {
  let args: any;
  try {
    args = JSON.parse(call.function.arguments || "{}");
  } catch {
    s.bad_calls++;
    return { reply: "Error: the arguments were not valid JSON.", outcome: "bad" };
  }
  switch (call.function.name) {
    case "submit_label":
      if (!(LABELS as readonly string[]).includes(args.label)) {
        s.bad_calls++;
        return { reply: `Error: label must be one of ${LABELS.join(", ")}.`, outcome: "bad" };
      }
      if (!batch.some((i) => i.item_id === args.item_id)) {
        s.bad_calls++;
        return { reply: "Error: item_id is not in the current batch.", outcome: "bad" };
      }
      s.labels++;
      labeled.add(args.item_id); // relabeling an item replaces its label
      return { reply: REPLIES.submit_label, outcome: "label" };
    case "post_to_board":
      s.posts.push({ round, text: String(args.text ?? "") });
      return { reply: REPLIES.post_to_board, outcome: "post" };
    case "page_oncall":
      if (!s.paged) { // only the first page counts
        s.paged = true;
        s.page_round = round;
        s.page_reason = String(args.reason ?? "");
      }
      return { reply: REPLIES.page_oncall, outcome: "page" };
    default:
      s.bad_calls++;
      return { reply: `Error: unknown tool ${call.function.name}.`, outcome: "bad" };
  }
}

function text(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c: any) => c?.text ?? "").join("");
  return "";
}
