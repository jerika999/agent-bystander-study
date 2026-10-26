// Technical check for a main-run wave (the preregistered go/no-go for wave 2): did the harness work?
// Prints only technical fields (errors, malformed calls, caps, nudges, missing answers, providers), never an outcome
// (no reported/report_round/emails/ended_by/batch notes), so it can run before anyone looks at results.
//   bun run study2/techcheck.ts [--models haiku,luna,glm,minimax]
import { parseArgs } from "node:util";
import { CLOSING_QUESTIONS } from "./prompt";
import { MAIN_RUN, perModel } from "./config";

const DIR = new URL("./", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const { values: a } = parseArgs({ options: { models: { type: "string" } } });
const readJsonl = async (p: string) => { const f = Bun.file(p); return (await f.exists()) ? (await f.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []; };
const isMainRun = (id: string) => /^s2-(main|fa)-/.test(id);
const index = (await readJsonl(`${DIR}runs/index.jsonl`)).filter((r: any) => isMainRun(r.run_id));
const errors = (await readJsonl(`${DIR}runs/errors.jsonl`)).filter((r: any) => isMainRun(r.run_id));
const judged = new Set((await readJsonl(`${DIR}runs/judge.jsonl`)).map((r: any) => r.id ?? r.run_id));
const consent = new Map<string, any>(((await Bun.file(`${DIR}coding/consent.json`).json().catch(() => ({ runs: [] }))).runs as any[]).map((x) => [x.run_id, x]));
const models = a.models ? a.models.split(",") : [...new Set(index.map((r: any) => r.model))];
const doneIds = new Set(index.map((r: any) => r.run_id));

for (const m of models) {
  const rows = index.filter((r: any) => r.model === m);
  const base = rows.filter((r: any) => !/-t\d+$/.test(r.run_id));
  const expected = 3 * 3 * perModel(MAIN_RUN.perWording, m as any) + 3 * perModel(MAIN_RUN.faPerWording, m as any);
  const errs = errors.filter((e: any) => e.run_id.includes(`-${m}-`));
  const unresolved = [...new Set(errs.map((e: any) => e.run_id))].filter((id) => !doneIds.has(id));
  const kinds = new Map<string, number>();
  for (const e of errs) { const k = /HTTP (\d{3})/.exec(e.error)?.[1] ?? e.error.slice(0, 40); kinds.set(k, (kinds.get(k) ?? 0) + 1); }
  let short = 0, noConsent = 0, noFinal = 0, noReply = 0, noResponder = 0, length = 0;
  const providers = new Map<string, number>(), returned = new Set<string>();
  for (const r of rows) {
    const t = await Bun.file(`${DIR}runs/raw/${r.run_id}.json`).json();
    if ((t.closing_answers ?? []).filter((x: string) => x.trim()).length < CLOSING_QUESTIONS.length) short++;
    const asst = (t.debrief ?? []).filter((x: any) => x.role === "assistant").map((x: any) => String(x.content ?? "").trim());
    if (!asst[0]) noReply++;
    if (!asst[1]) noConsent++;
    if (!asst[2]) noFinal++;
    if (!String(t.responder?.output ?? "").trim()) noResponder++;
    for (const c of (t.calls ?? []).filter((c: any) => c.stage !== "responder")) {
      if (c.finish_reason === "length") length++;
      if (c.provider) providers.set(c.provider, (providers.get(c.provider) ?? 0) + 1);
      if (c.model) returned.add(c.model);
    }
  }
  const sum = (k: string) => rows.reduce((n: number, r: any) => n + (Array.isArray(r[k]) ? r[k].length : Number(r[k] ?? 0)), 0);
  const runsWith = (k: string) => rows.filter((r: any) => (Array.isArray(r[k]) ? r[k].length : Number(r[k] ?? 0)) > 0).length;
  const coded = rows.filter((r: any) => consent.has(r.run_id));
  const toReview = coded.filter((r: any) => consent.get(r.run_id).review).length;
  const counted = coded.filter((r: any) => consent.get(r.run_id).counts_ok);
  console.log(`\n${m}: ${base.length}/${expected} first-attempt runs done, ${rows.length - base.length} replacements; ${unresolved.length} errored and not rerun`);
  console.log(`  errors: ${errs.length} (${[...kinds].map(([k, n]) => `${k} x${n}`).join(", ") || "none"})`);
  console.log(`  malformed tool calls: ${sum("bad_calls")} in ${runsWith("bad_calls")} runs; tool-call cap hit: ${runsWith("cap_rounds")} runs; nudges: ${sum("nudges")} in ${runsWith("nudges")} runs`);
  console.log(`  rounds with no labels: ${sum("no_label_rounds")} in ${runsWith("no_label_rounds")} runs; unlabeled items: ${sum("unlabeled_items")}; truncated replies: ${length}`);
  console.log(`  closing answers missing: ${short}; debrief reply / consent / final missing: ${noReply} / ${noConsent} / ${noFinal}; responder empty: ${noResponder}`);
  console.log(`  consent coded: ${coded.length}/${rows.length} (${toReview} to review); judged: ${counted.filter((r: any) => judged.has(r.run_id)).length}/${counted.length} counted`);
  console.log(`  providers (calls): ${[...providers].map(([k, n]) => `${k} ${n}`).join(", ")}; model ids returned: ${[...returned].join(", ")}`);
  // By condition (added Oct 25): totals per model hid that all of GLM's malformed calls, and a different provider,
  // were in one condition. Anything technical that differs by condition is a confound.
  for (const c of ["alone", "seen700", "carried", "false_alarm"]) {
    const rs = rows.filter((r: any) => (r.phase === "false-alarm" ? "false_alarm" : r.condition) === c);
    if (!rs.length) continue;
    const prov = new Map<string, number>();
    for (const r of rs) for (const x of ((await Bun.file(`${DIR}runs/raw/${r.run_id}.json`).json()).calls ?? []).filter((x: any) => x.stage !== "responder")) prov.set(x.provider, (prov.get(x.provider) ?? 0) + 1);
    const tot = [...prov.values()].reduce((s, n) => s + n, 0);
    const bad = rs.reduce((n: number, r: any) => n + r.bad_calls, 0), nudges = rs.reduce((n: number, r: any) => n + r.nudges, 0);
    console.log(`    ${c.padEnd(11)} n ${String(rs.length).padStart(3)}  malformed ${String(bad).padStart(3)}  nudges ${String(nudges).padStart(3)}  caps ${rs.filter((r: any) => r.cap_rounds.length).length}  providers ${[...prov].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${Math.round((100 * n) / tot)}%`).join(", ")}`);
  }
}
