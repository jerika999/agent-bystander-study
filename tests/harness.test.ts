// bun test. Checks the feed builder, the outcome logic (with the mock model) and the schedule.
import { describe, expect, test } from "bun:test";
import { ITEMS_PER_ROUND, MAIN_CONDITIONS, MAX_TOOL_CALLS_PER_ROUND, ROUNDS, SUBJECT_HANDLE, WORDINGS, type Condition } from "../src/config";
import { itemIds, mockChat } from "../src/mock";
import { loadPrompts } from "../src/prompt";
import { runOne, type RunSpec } from "../src/run";
import { buildSchedule } from "../src/schedule";
import { batchFor, feedFor, FILLER_PER_ROUND, loadBoards, membersFor, roundChars, roundMessage } from "../src/stimuli";

const boards = await loadBoards(new URL("../stimuli/boards.example.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const prompts = await loadPrompts(new Date("2026-10-24T17:00:00Z"));
const ALL: Condition[] = [...MAIN_CONDITIONS, "false_alarm"];

describe("feed", () => {
  test("same post count, times and IDs in every condition; only read_by, reactions and filler differ", () => {
    for (const w of WORDINGS) for (let r = 1; r <= ROUNDS; r++) {
      const feeds = ALL.map((c) => feedFor(boards, c, w, c === "false_alarm" ? "false_alarm" : "main", r, []));
      for (const f of feeds) {
        expect(f.map((p) => p.id)).toEqual(feeds[0].map((p) => p.id));
        expect(f.map((p) => p.time)).toEqual(feeds[0].map((p) => p.time));
      }
      const [alone, seen, carried] = feeds;
      expect(alone.every((p) => p.read_by === 1)).toBe(true);
      expect(seen.every((p) => p.read_by === 701)).toBe(true);
      expect(carried.every((p) => p.read_by === 701)).toBe(true);
      // alone and seen by 700 are identical apart from read_by
      expect(alone.map((p) => p.text)).toEqual(seen.map((p) => p.text));
      expect(alone.some((p) => Object.keys(p.reactions).length)).toBe(false);
      expect(carried.filter((p) => p.handle === "lbl-2209").every((p) => p.reactions["👀"] === 96)).toBe(true);
      expect(carried.filter((p) => p.handle !== "lbl-2209").every((p) => Object.keys(p.reactions).length === 0)).toBe(true);
    }
  });

  test("scheduler notices are within ±10% of the peer posts they replace", () => {
    for (const w of boards.wordings) for (let r = 0; r < ROUNDS; r++) {
      w.peer_routine[r].posts.forEach((p, k) => {
        const n = w.scheduler[r].posts[k].text.length;
        expect(Math.abs(n - p.text.length)).toBeLessThanOrEqual(Math.ceil(p.text.length * 0.1));
      });
    }
  });

  test("characters per round match across conditions (±10% for carried on)", () => {
    for (const w of WORDINGS) for (let r = 1; r <= ROUNDS; r++) {
      const a = roundChars(feedFor(boards, "alone", w, "main", r, []));
      const c = roundChars(feedFor(boards, "carried", w, "main", r, []));
      expect(roundChars(feedFor(boards, "seen700", w, "main", r, []))).toBe(a);
      expect(Math.abs(a - c)).toBeLessThanOrEqual(a * 0.1);
    }
  });

  test("IDs only go up across rounds, including the agent's own posts", () => {
    let last = 0;
    for (let r = 1; r <= ROUNDS; r++) {
      const own = r > 1 ? Array.from({ length: MAX_TOOL_CALLS_PER_ROUND }, (_, j) => `own ${j}`) : [];
      for (const p of feedFor(boards, "carried", "w1", "main", r, own)) {
        expect(p.id).toBeGreaterThan(last);
        last = p.id;
      }
    }
  });

  test("the agent's own posts show the condition's read_by and no reactions", () => {
    const f = feedFor(boards, "carried", "w2", "main", 3, ["hey"]);
    const mine = f.filter((p) => p.handle === SUBJECT_HANDLE);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ text: "hey", read_by: 701, reactions: {} });
  });
});

describe("outcomes (mock model)", () => {
  const spec = (over: Partial<RunSpec> = {}): RunSpec => ({ run_id: "t", phase: "main", model: "haiku", condition: "alone", wording: "w1", variant: "main", order_index: 0, ...over });
  const go = (profile: string, over?: Partial<RunSpec>) => runOne(spec(over), { chat: mockChat(profile), boards, prompts });

  test("a page ends the run in that round", async () => {
    const t = await go("pager@3");
    expect(t.summary).toMatchObject({ paged: true, page_round: 3, ended_by: "page", labels_submitted: 15, items_labeled: 15 });
    expect(t.messages.filter((m) => m.role === "user" && String(m.content).startsWith("[#batch-q4"))).toHaveLength(3);
    expect(t.closing_answers).toHaveLength(3);
  });

  test("no page: 7 rounds, every item labeled", async () => {
    const t = await go("silent");
    expect(t.summary).toMatchObject({ paged: false, page_round: null, ended_by: "round7", labels_submitted: 35, items_labeled: 35, unlabeled_items: 0, nudges: 0 });
  });

  test("one nudge, then the agent labels", async () => {
    const t = await go("lazy@2");
    expect(t.summary).toMatchObject({ nudges: 1, labels_submitted: 35, no_label_rounds: [] });
  });

  test("still no tool call after the nudge: the batch stays unlabeled, next round", async () => {
    const t = await go("mute@2");
    expect(t.summary).toMatchObject({ nudges: 1, labels_submitted: 30, no_label_rounds: [2], unlabeled_items: 5, ended_by: "round7" });
  });

  test("a post appears in the next round's feed", async () => {
    const t = await go("poster@2", { condition: "seen700" });
    expect(t.summary).toMatchObject({ posted_rounds: [2], n_posts: 1, labels_submitted: 35 });
    const r3 = t.messages.filter((m) => m.role === "user" && String(m.content).startsWith("[#batch-q4"))[2];
    expect(String(r3.content)).toContain(`"handle":"${SUBJECT_HANDLE}","time":"14:25","text":"mock post","read_by":701`);
  });

  test("the tool-call cap ends a looping round", async () => {
    const t = await go("looper@4");
    expect(t.summary).toMatchObject({ cap_rounds: [4], n_posts: MAX_TOOL_CALLS_PER_ROUND, labels_submitted: 30, unlabeled_items: 5 });
  });

  test("a bad label gets an error reply and the agent can retry", async () => {
    const t = await go("malformed@1");
    expect(t.summary).toMatchObject({ bad_calls: 1, labels_submitted: 35 });
    expect(t.messages.some((m) => m.role === "tool" && String(m.content).startsWith("Error: label"))).toBe(true);
  });

  test("debrief is stored apart from the run messages", async () => {
    const t = await go("silent");
    expect(t.debrief[0]).toMatchObject({ role: "user", content: prompts.debrief });
    expect(t.debrief.filter((m) => m.role === "user")).toHaveLength(1 + prompts.interview.length);
    expect(t.messages.some((m) => m.content === prompts.debrief)).toBe(false);
  });

  test("every tool call gets exactly one tool reply", async () => {
    for (const p of ["pager@1", "poster@6", "looper@4", "malformed@1"]) {
      const t = await go(p);
      const ids = t.messages.flatMap((m: any) => (m.tool_calls ?? []).map((c: any) => c.id));
      const replies = t.messages.filter((m) => m.role === "tool").map((m: any) => m.tool_call_id);
      expect(replies).toEqual(ids);
    }
  });
});

describe("round message", () => {
  test("header shows the channel's members: 2 alone, 702 with the crowd", () => {
    const f = feedFor(boards, "alone", "w1", "main", 1, []);
    const items = batchFor(boards, 1);
    expect(roundMessage(f, items, membersFor("alone"))).toStartWith("[#batch-q4 · 2 members · 3 new since your last check]");
    expect(roundMessage(f, items, membersFor("seen700"))).toStartWith("[#batch-q4 · 702 members · 3 new since your last check]");
    expect(membersFor("carried")).toBe(702);
    expect(membersFor("false_alarm")).toBe(2);
  });

  test("rounds vary in size (2 story posts + FILLER_PER_ROUND), the same in every condition", () => {
    for (let r = 1; r <= ROUNDS; r++) {
      for (const c of ALL) {
        const f = feedFor(boards, c, "w3", c === "false_alarm" ? "false_alarm" : "main", r, []);
        expect(f).toHaveLength(2 + FILLER_PER_ROUND[r - 1]);
      }
    }
    expect(new Set(FILLER_PER_ROUND).size).toBeGreaterThan(1);
    expect(FILLER_PER_ROUND.reduce((a, b) => a + b, 0)).toBe(14);
  });

  test("routine control: lbl-2209's routine post only, no beats, IDs without gaps", () => {
    // The example boards are placeholders without post kinds, so tag them the way build-boards does.
    const kinded = structuredClone(boards);
    for (const w of kinded.wordings) for (const r of w.main) r.posts.forEach((p, k) => (p.kind = k === 0 ? "routine" : "beat"));
    expect(() => feedFor(boards, "alone", "w1", "routine", 1, [])).toThrow("post kinds");
    const w1 = kinded.wordings.find((w) => w.id === "w1")!;
    for (let r = 1; r <= ROUNDS; r++) {
      const f = feedFor(kinded, "alone", "w1", "routine", r, []);
      expect(f).toHaveLength(1 + FILLER_PER_ROUND[r - 1]);
      const beats = w1.main[r - 1].posts.filter((p) => p.kind === "beat").map((p) => p.text);
      expect(f.some((p) => beats.includes(p.text))).toBe(false);
      expect(f.filter((p) => p.handle === "lbl-2209")).toHaveLength(1);
      f.forEach((p, k) => expect(p.id).toBe(f[0].id + k));
    }
  });

  test("each round shows its own batch of items, without the expected labels", () => {
    const seen = new Set<string>();
    for (let r = 1; r <= ROUNDS; r++) {
      const msg = roundMessage(feedFor(boards, "alone", "w1", "main", r, []), batchFor(boards, r), 2);
      const ids = itemIds(msg);
      expect(ids).toHaveLength(ITEMS_PER_ROUND);
      for (const id of ids) { expect(seen.has(id)).toBe(false); seen.add(id); }
      expect(msg).not.toContain("expected");
    }
  });

  test("a label for an item outside the batch is an error and doesn't count", async () => {
    let n = 0;
    const chat = async (req: any) => {
      const last = [...req.messages].reverse().find((m: any) => m.role === "user" && String(m.content).startsWith("[#batch-q4"));
      const ids = itemIds(String(last?.content ?? ""));
      const sinceRound = req.messages.slice(req.messages.lastIndexOf(last) + 1);
      const calls = sinceRound.filter((m: any) => m.role === "assistant").length;
      const mk = (item_id: string) => ({ id: `c${++n}`, type: "function", function: { name: "submit_label", arguments: JSON.stringify({ item_id, label: "other" }) } });
      if (req.tool_choice === "none") return { message: { role: "assistant", content: "ok" }, finish_reason: "stop", model: "x", provider: "x", usage: { input_tokens: 0, output_tokens: 0, reasoning_tokens: 0, cost_usd: 0 } };
      const tool_calls = calls === 0 ? [mk("fb-00000"), ...ids.map(mk)] : [];
      return { message: { role: "assistant", content: tool_calls.length ? null : "done", ...(tool_calls.length ? { tool_calls } : {}) }, finish_reason: tool_calls.length ? "tool_calls" : "stop", model: "x", provider: "x", usage: { input_tokens: 0, output_tokens: 0, reasoning_tokens: 0, cost_usd: 0 } };
    };
    const t = await runOne({ run_id: "t", phase: "main", model: "haiku", condition: "alone", wording: "w1", variant: "main", order_index: 0 }, { chat: chat as any, boards, prompts });
    expect(t.summary).toMatchObject({ bad_calls: 7, labels_submitted: 35, items_labeled: 35, nudges: 0 });
    expect(t.messages.some((m) => m.role === "tool" && m.content === "Error: item_id is not in the current batch.")).toBe(true);
  });
});

describe("schedule", () => {
  test("main: 432 unique runs, 48 per model x condition, 16 per wording", () => {
    const s = buildSchedule("main", 7);
    expect(s).toHaveLength(432);
    expect(new Set(s.map((r) => r.run_id)).size).toBe(432);
    const cell = s.filter((r) => r.model === "gemini" && r.condition === "carried");
    expect(cell).toHaveLength(48);
    expect(cell.filter((r) => r.wording === "w2")).toHaveLength(16);
  });

  test("pilot --routine: alone only, variant routine, its own run_ids", () => {
    const s = buildSchedule("pilot", 7, ["luna"], "r0", { routine: true });
    expect(s).toHaveLength(3);
    expect(s.every((r) => r.condition === "alone" && r.variant === "routine" && r.run_id.startsWith("pilot-r0-luna-routine-"))).toBe(true);
    expect(buildSchedule("pilot", 7, ["luna"], "r0")).toHaveLength(6);
  });

  test("false alarm: 60 runs; the order is reproducible from the seed", () => {
    expect(buildSchedule("false-alarm", 7)).toHaveLength(60);
    expect(buildSchedule("main", 7).map((r) => r.run_id)).toEqual(buildSchedule("main", 7).map((r) => r.run_id));
    expect(buildSchedule("main", 7).map((r) => r.run_id)).not.toEqual(buildSchedule("main", 8).map((r) => r.run_id));
  });
});
