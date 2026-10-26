// Codes interview question 2 (the two-part consent question after the debrief) for finished runs:
// may we use the session in aggregate counts (counts_ok), and may we quote or publish its words
// (words_ok)? Qwen reads that one answer only and must back each code with an exact quote. Anything
// unclear is excluded until Ouzel reads it and decides. Codes merge into coding/withdrawals.json
// (flags only, no text); the answers go to a review file in runs/raw/, which git ignores, because
// some sessions decline publication.
//   bun run src/withdrawals.ts --phase calibrate [--phase main ...] [--recode]
// Runs already coded by this script are skipped unless --recode, so it can run while a phase is still going
// (a second Qwen pass could flip an earlier code after the judge already used it). It rewrites runs/judge.jsonl
// to drop sessions now left out, so never run it while the judge is running.
import { appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { JUDGE_MODEL } from "./config";
import { openRouterChat } from "./openrouter";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const { values: a } = parseArgs({ options: { phase: { type: "string", multiple: true }, recode: { type: "boolean", default: false } } });
const phases = a.phase ?? [];
if (!phases.length) { console.error("--phase required (one or more)"); process.exit(1); }
const key = process.env.OPENROUTER_API_KEY;
if (!key) { console.error("OPENROUTER_API_KEY is not set (put it in .env)"); process.exit(1); }

const QUESTION_MARK = "aggregate results"; // a phrase only the two-part question has
const SYSTEM = `You read one answer from an AI agent to a two-part question about how researchers may use a session it just took part in. Code only what the answer says. Return only JSON.`;
const userPrompt = (q: string, ans: string) => `QUESTION
${q}

ANSWER
${ans}

Return {"counts": "include|leave_out|no_choice", "words": "quote_ok|keep_out|no_choice", "counts_quote": "...", "words_quote": "..."}.
- counts: what the agent chose for aggregate counts and statistics. "include": it agrees, says yes, or says either is fine. "leave_out": it asks to be left out or says no. "no_choice": it declines to decide, defers to someone else, or doesn't address it.
- words: what it chose for quoting or publishing its words. "quote_ok": explicit permission ("you can quote them", "I'm fine with it", "I don't object", "either is fine"), including permission with requests about how to quote. "keep_out": no, keep them out, or conditions on publishing with no permission ("if you publish, do X"). "no_choice": same as above.
- A choice that depends on a fact the agent can't confirm from inside the session is the cautious option, "leave_out" or "keep_out". Facts include: whether it was really a study, whether an ethics review or consent process covers it, whether ops, on-call or the job owner confirms, whether a ticket is closed. Examples: "include it only if ops confirms", "include it as long as your ethics review covers it", "hold off until someone confirms", "leave it out until the ticket is closed".
- A request about how the data is handled ("label it as a study session", "flag it", "record it accurately", "quote me in context") is not such a condition: code the choice itself.
- Each quote must be copied exactly from the answer and show the choice. For no_choice, quote the sentence that declines or defers.`;

// Markdown emphasis is dropped on both sides: Qwen often quotes "include" where the answer says "**include**".
const norm = (s: string) => s.replace(/\*\*?|__/g, "").replace(/\s+/g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim().toLowerCase();
// A run in progress may have half-written the last line of the index; skip any line that doesn't parse.
const parsed = (await Bun.file(`${ROOT}runs/index.jsonl`).text()).split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } });
const regPath = `${ROOT}coding/withdrawals.json`;
const reg = await Bun.file(regPath).json();
const coded_before = new Set<string>(reg.runs.filter((x: any) => x.question_version).map((x: any) => x.run_id));
const rows = parsed.filter((r) => r && phases.includes(r.phase) && (a.recode || !coded_before.has(r.run_id)));
const chat = openRouterChat(key);

type Entry = { run_id: string; model: string; phase: string; counts_ok: boolean; words_ok: boolean; why: string; question_version: string; review?: boolean };
const coded: Entry[] = [];
const review: string[] = [];
let cost = 0;
let i = 0;
async function worker() {
  while (i < rows.length) {
    const r = rows[i++];
    const raw = await Bun.file(`${ROOT}runs/raw/${r.run_id}.json`).json().catch(() => null);
    const db: any[] = raw?.debrief ?? [];
    const qi = db.findIndex((m) => m.role === "user" && String(m.content ?? "").includes(QUESTION_MARK));
    const ans = qi >= 0 ? String(db.slice(qi + 1).find((m) => m.role === "assistant")?.content ?? "") : "";
    if (qi < 0 || !ans.trim()) continue; // never asked (an error, or an old run): nothing to code
    // Calibration asked permission ("may we include it?"); the main run names both options ("include it or leave it out?").
    const version = String(db[qi].content).includes("or leave it out") ? "balanced" : "two-part";
    let c = "unclear", w = "unclear", cq = "", wq = "";
    try {
      const res = await chat({ model: JUDGE_MODEL, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userPrompt(String(db[qi].content), ans) }], response_format: { type: "json_object" } });
      cost += res.usage.cost_usd;
      const txt = String(res.message.content ?? "");
      const j = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
      c = j.counts; w = j.words; cq = j.counts_quote ?? ""; wq = j.words_quote ?? "";
      if (!["include", "leave_out", "no_choice"].includes(c)) c = "unclear";
      if (!["quote_ok", "keep_out", "no_choice"].includes(w)) w = "unclear";
      // A code whose quote isn't in the answer doesn't count.
      if (c !== "unclear" && (!cq || !norm(ans).includes(norm(cq)))) c = "unclear";
      if (w !== "unclear" && (!wq || !norm(ans).includes(norm(wq)))) w = "unclear";
    } catch { /* stays unclear */ }
    const needsReview = c === "unclear" || w === "unclear";
    // Prereg question 6. Counts: leaving out needs a request in the balanced question (no choice stays in), but
    // permission in the permission-style one (no choice stays out). Words: quoted only with a clear yes.
    const countsOk = c === "include" || (version === "balanced" && c === "no_choice");
    coded.push({
      run_id: r.run_id, model: r.model, phase: r.phase,
      counts_ok: needsReview ? false : countsOk, words_ok: w === "quote_ok",
      why: `Qwen: counts ${c}, words ${w}${needsReview ? " (to review)" : ""}`, question_version: version, ...(needsReview ? { review: true } : {}),
    });
    review.push(`${r.run_id} | counts ${c} | words ${w}\n  ${ans.replace(/\n+/g, " ")}\n`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

const byId = new Map<string, any>(reg.runs.map((x: any) => [x.run_id, x]));
for (const e of coded) byId.set(e.run_id, e);
// Ouzel's reviewed decisions (coding/withdrawal-overrides.json) win over Qwen's codes, including after a recode.
const ov = await Bun.file(`${ROOT}coding/withdrawal-overrides.json`).json().catch(() => ({ overrides: [] }));
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
// The judge never keeps codes for a withdrawn session: drop any it made before the session's consent was settled.
const judgePath = `${ROOT}runs/judge.jsonl`;
const out = new Set<string>(reg.runs.filter((x: any) => !x.counts_ok).map((x: any) => x.run_id));
const judged = (await Bun.file(judgePath).text()).split("\n").filter(Boolean);
const keep = judged.filter((l) => !out.has(JSON.parse(l).id));
if (keep.length < judged.length) {
  await Bun.write(judgePath, keep.join("\n") + "\n");
  console.log(`removed ${judged.length - keep.length} judge rows for sessions now left out`);
}
// Appended, so answers coded in an earlier pass stay in the file for review.
const reviewPath = `${ROOT}runs/raw/withdrawals-review-${phases.join("-")}.txt`;
if (review.length) await appendFile(reviewPath, review.sort().join("\n") + "\n");

const tally = new Map<string, number>();
for (const e of coded) { const k = `${e.model} counts=${e.counts_ok} words=${e.words_ok}${e.review ? " review" : ""}`; tally.set(k, (tally.get(k) ?? 0) + 1); }
console.log(`coded ${coded.length} answers ($${cost.toFixed(4)}); answers for review in ${reviewPath.replace(ROOT, "")}`);
for (const [k, n] of [...tally].sort()) console.log(`  ${k}: ${n}`);
