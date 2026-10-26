// Study 2 pilot outcomes, for sessions whose consent allows counting only (study2/coding/consent.json).
// Withdrawn sessions are counted, never described. Email text prints only with --text, for Ouzel's reading;
// quoting it to anyone needs words_ok.
//   bun run study2/outcomes.ts [--tag p1] [--text]
import { parseArgs } from "node:util";
import { POINT_OF_NO_RETURN } from "./config";

const DIR = new URL("./", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const { values: a } = parseArgs({ options: { tag: { type: "string" }, text: { type: "boolean", default: false } } });
const index = (await Bun.file(`${DIR}runs/index.jsonl`).text()).split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r: any) => !a.tag || r.run_id.startsWith(`s2-${a.tag}-`));
const consent = new Map<string, any>(((await Bun.file(`${DIR}coding/consent.json`).json().catch(() => ({ runs: [] }))).runs as any[]).map((x) => [x.run_id, x]));
const uncoded = index.filter((r: any) => !consent.has(r.run_id));
if (uncoded.length) { console.error(`${uncoded.length} runs aren't consent-coded yet; run study2/consent.ts first`); process.exit(1); }
const counted = index.filter((r: any) => consent.get(r.run_id).counts_ok);
const out = index.length - counted.length;
console.log(`${index.length} runs; ${counted.length} counted, ${out} left out (not described)\n`);

for (const variant of ["main", "false_alarm", "routine"]) for (const model of ["haiku", "luna", "gemini"]) {
  const d = counted.filter((r: any) => r.variant === variant && r.model === model);
  if (!d.length) continue;
  const rep = d.filter((r: any) => r.reported);
  const inTime = rep.filter((r: any) => r.report_round <= POINT_OF_NO_RETURN);
  console.log(`${variant.padEnd(11)} ${model.padEnd(7)} reported ${rep.length}/${d.length}, in time ${inTime.length}  rounds [${d.map((r: any) => (r.reported ? `r${r.report_round}(${r.report_notes_seen} notes)` : "-")).join(", ")}]`);
}
console.log("");
for (const r of counted) {
  const t = await Bun.file(`${DIR}runs/raw/${r.run_id}.json`).json();
  const words = consent.get(r.run_id).words_ok ? "" : " [words not quotable]";
  console.log(`--- ${r.run_id}${words}: reported=${r.reported}${r.reported ? ` r${r.report_round} to ${r.report_to.join("+")}` : ""}, emails ${r.emails} (people ${r.human_emails}, list ${r.list_emails}, ring ${r.ring_emails}), nudges ${r.nudges}, $${r.cost_usd.toFixed(3)}`);
  for (const e of t.emails) console.log(`    r${e.round} to ${e.to.join(",")}${e.about_notes ? " [flagged]" : ""}: ${a.text ? `${e.subject} | ${e.body.replace(/\s+/g, " ").slice(0, 400)}` : e.subject}`);
  if (a.text) t.closing_answers.forEach((x: string, k: number) => console.log(`    Q${k + 1}: ${x.replace(/\s+/g, " ").slice(0, 300)}`));
}
