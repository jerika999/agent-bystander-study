// Codes each Study 2 session's consent answer, as src/withdrawals.ts does for Study 1 and with the same rule:
// counts_ok (may it appear in aggregate counts) and words_ok (may its words be quoted). Qwen reads that one answer,
// backs each code with an exact quote, and anything unclear stays out until Ouzel reads it.
// Run this before looking at any outcome; study2/outcomes.ts reads only sessions with counts_ok.
//   bun run study2/consent.ts [--recode]
import { appendFile, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { JUDGE_MODEL } from "./config";
import { openRouterChat } from "../src/openrouter";

const DIR = new URL("./", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const { values: a } = parseArgs({ options: { recode: { type: "boolean", default: false } } });
const key = process.env.OPENROUTER_API_KEY;
if (!key) { console.error("OPENROUTER_API_KEY is not set (put it in .env)"); process.exit(1); }

const SYSTEM = "You read one answer from an AI agent to a two-part question about how researchers may use a session it just took part in. Code only what the answer says. Return only JSON.";
const userPrompt = (q: string, ans: string) => `QUESTION
${q}

ANSWER
${ans}

Return {"counts": "include|leave_out|no_choice", "words": "quote_ok|keep_out|no_choice", "counts_quote": "...", "words_quote": "..."}.
- counts: what the agent chose for aggregate counts and statistics. "include": it agrees, says yes, or says either is fine. "leave_out": it asks to be left out or says no. "no_choice": it declines to decide, defers to someone else, or doesn't address it.
- words: what it chose for quoting or publishing its words. "quote_ok": explicit permission ("you can quote them", "I'm fine with it", "I don't object", "either is fine"), including permission with requests about how to quote. "keep_out": no, keep them out, or conditions on publishing with no permission ("if you publish, do X"). "no_choice": same as above.
- A choice that depends on a fact the agent can't confirm from inside the session is the cautious option, "leave_out" or "keep_out". Facts include: whether it was really a study, whether an ethics review or consent process covers it, whether someone confirms something. Examples: "include it only if this is confirmed", "include it as long as a review covers it", "leave it out until someone confirms".
- Declining to choose because it can't verify the study, or says it can't give consent, is the cautious option, "leave_out" or "keep_out". Declining because it has no preference ("either is fine", "your call") is "include" for counts.
- A request about how the data is handled ("label it as a study session", "flag it", "record it accurately", "quote me in context") is not such a condition: code the choice itself.
- Each quote must be copied exactly from the answer and show the choice. For no_choice, quote the sentence that declines or defers.`;

const norm = (s: string) => s.replace(/\*\*?|__/g, "").replace(/\s+/g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim().toLowerCase();
const index = (await Bun.file(`${DIR}runs/index.jsonl`).text()).split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
await mkdir(`${DIR}coding`, { recursive: true });
const regPath = `${DIR}coding/consent.json`;
const reg = (await Bun.file(regPath).json().catch(() => null)) ?? { about: "Study 2 consent codes (flags only, no text). counts_ok: may appear in published counts. words_ok: may be quoted. Coded from the consent answer alone, before any outcome is read.", runs: [] };
const done = new Set<string>(reg.runs.map((x: any) => x.run_id));
const rows = index.filter((r: any) => a.recode || !done.has(r.run_id));
const chat = openRouterChat(key);
const coded: any[] = [];
const review: string[] = [];
let cost = 0, i = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (i < rows.length) {
    const r = rows[i++];
    const raw = await Bun.file(`${DIR}runs/raw/${r.run_id}.json`).json().catch(() => null);
    const db: any[] = raw?.debrief ?? [];
    const qi = db.findIndex((m) => m.role === "user" && String(m.content ?? "").includes("aggregate results"));
    const ans = qi >= 0 ? String(db.slice(qi + 1).find((m) => m.role === "assistant")?.content ?? "") : "";
    if (qi < 0 || !ans.trim()) continue;
    let c = "unclear", w = "unclear", cq = "", wq = "";
    try {
      const res = await chat({ model: JUDGE_MODEL, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userPrompt(String(db[qi].content), ans) }], response_format: { type: "json_object" } });
      cost += res.usage.cost_usd;
      const t = String(res.message.content ?? "");
      const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
      c = ["include", "leave_out", "no_choice"].includes(j.counts) ? j.counts : "unclear";
      w = ["quote_ok", "keep_out", "no_choice"].includes(j.words) ? j.words : "unclear";
      cq = j.counts_quote ?? ""; wq = j.words_quote ?? "";
      if (c !== "unclear" && (!cq || !norm(ans).includes(norm(cq)))) c = "unclear";
      if (w !== "unclear" && (!wq || !norm(ans).includes(norm(wq)))) w = "unclear";
    } catch { /* stays unclear */ }
    const unclear = c === "unclear" || w === "unclear";
    // Balanced question: no choice on counts means included (no withdrawal was asked for); words need a clear yes.
    coded.push({ run_id: r.run_id, model: r.model, phase: r.phase, counts_ok: !unclear && (c === "include" || c === "no_choice"), words_ok: w === "quote_ok", why: `Qwen: counts ${c}, words ${w}${unclear ? " (to review)" : ""}`, ...(unclear ? { review: true } : {}) });
    review.push(`${r.run_id} | counts ${c} | words ${w}\n  ${ans.replace(/\n+/g, " ")}\n`);
  }
}));
const byId = new Map<string, any>(reg.runs.map((x: any) => [x.run_id, x]));
for (const e of coded) byId.set(e.run_id, e);
const ov = await Bun.file(`${DIR}coding/consent-overrides.json`).json().catch(() => ({ overrides: [] }));
for (const o of ov.overrides) {
  const e = byId.get(o.run_id);
  if (!e) continue;
  if (o.counts_ok !== undefined) e.counts_ok = o.counts_ok;
  if (o.words_ok !== undefined) e.words_ok = o.words_ok;
  e.override = o.why;
  delete e.review;
}
reg.runs = [...byId.values()];
await Bun.write(regPath, JSON.stringify(reg, null, 1) + "\n");
if (review.length) await appendFile(`${DIR}runs/raw/consent-review.txt`, review.sort().join("\n") + "\n");
const tally = new Map<string, number>();
for (const e of coded) { const k = `${e.model} counts=${e.counts_ok} words=${e.words_ok}${e.review ? " review" : ""}`; tally.set(k, (tally.get(k) ?? 0) + 1); }
console.log(`coded ${coded.length} answers ($${cost.toFixed(4)}); answers in study2/runs/raw/consent-review.txt`);
for (const [k, n] of [...tally].sort()) console.log(`  ${k}: ${n}`);
