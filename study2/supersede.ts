// Moves sessions that a harness fix supersedes out of the main data files into study2/runs/v1/, so the rerun under
// the same run IDs starts clean and the frozen analysis reads only the fixed version. Nothing is deleted: index rows,
// judge rows, consent codes, review notes, consent answers and transcripts all move together, and results/study2/
// wave1-v1/ holds the analysis of the version as run. Spend rows stay where they are (they record money spent).
// Oct 25: OpenRouter's provider routing differed by condition (see src/openrouter.ts, provider pins).
//   bun run study2/supersede.ts            (dry: prints what would move)
//   bun run study2/supersede.ts --apply
import { mkdir, rename } from "node:fs/promises";
import { parseArgs } from "node:util";

const DIR = new URL("./", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const { values: a } = parseArgs({ options: { apply: { type: "boolean", default: false } } });
// GLM's carried-on sessions (another provider from its other conditions), every MiniMax session (provider mix differed
// by condition), and the wave 2 sessions finished before the fix (unpinned; wave 2 was stopped and restarts pinned).
const SUPERSEDED = (id: string) => /^s2-main-glm-carried-w\d-\d\d$/.test(id) || /^s2-(main|fa)-(minimax|gemini|kimi)-/.test(id);

const lines = async (p: string) => (await Bun.file(p).exists()) ? (await Bun.file(p).text()).split("\n").filter(Boolean) : [];
const idOf = (l: string) => { const j = JSON.parse(l); return j.run_id ?? j.id; };
const index = await lines(`${DIR}runs/index.jsonl`), judge = await lines(`${DIR}runs/judge.jsonl`);
const consent = await Bun.file(`${DIR}coding/consent.json`).json();
const aware = await Bun.file(`${DIR}coding/aware-review.json`).json();
const review = (await Bun.file(`${DIR}runs/raw/consent-review.txt`).text()).split(/\n(?=s2-)/);

const moveIdx = index.filter((l) => SUPERSEDED(idOf(l))), keepIdx = index.filter((l) => !SUPERSEDED(idOf(l)));
const moveJudge = judge.filter((l) => SUPERSEDED(idOf(l))), keepJudge = judge.filter((l) => !SUPERSEDED(idOf(l)));
const ids = moveIdx.map(idOf);
const byModel: Record<string, number> = {};
for (const id of ids) byModel[id.split("-")[2]] = (byModel[id.split("-")[2]] ?? 0) + 1;
console.log(`sessions: ${ids.length}`, byModel, `| judge rows ${moveJudge.length} | consent codes ${consent.runs.filter((r: any) => SUPERSEDED(r.run_id)).length} | aware reviews ${aware.runs.filter((r: any) => SUPERSEDED(r.run_id)).length} | review answers ${review.filter((r) => SUPERSEDED(r.split(" | ")[0])).length}`);
const missingRaw = (await Promise.all(ids.map(async (id) => (await Bun.file(`${DIR}runs/raw/${id}.json`).exists()) ? null : id))).filter(Boolean);
if (missingRaw.length) throw new Error(`no transcript for ${missingRaw.join(", ")}`);
if (!a.apply) { console.log("dry run; pass --apply to move"); process.exit(0); }

const V1 = `${DIR}runs/v1`;
await mkdir(`${V1}/raw`, { recursive: true });
for (const id of ids) await rename(`${DIR}runs/raw/${id}.json`, `${V1}/raw/${id}.json`);
const append = async (p: string, add: string[]) => Bun.write(p, [...(await lines(p)), ...add].join("\n") + "\n");
await append(`${V1}/index.jsonl`, moveIdx);
await append(`${V1}/judge.jsonl`, moveJudge);
const v1c = (await Bun.file(`${V1}/consent.json`).json().catch(() => null)) ?? { about: "Consent codes of superseded sessions (study2/supersede.ts).", runs: [] };
v1c.runs.push(...consent.runs.filter((r: any) => SUPERSEDED(r.run_id)));
await Bun.write(`${V1}/consent.json`, JSON.stringify(v1c, null, 1) + "\n");
const v1a = (await Bun.file(`${V1}/aware-review.json`).json().catch(() => null)) ?? { about: aware.about, runs: [] };
v1a.runs.push(...aware.runs.filter((r: any) => SUPERSEDED(r.run_id)));
await Bun.write(`${V1}/aware-review.json`, JSON.stringify(v1a, null, 1) + "\n");
await Bun.write(`${V1}/consent-review.txt`, review.filter((r) => SUPERSEDED(r.split(" | ")[0])).join("\n"));
// Main files last, each written once.
await Bun.write(`${DIR}runs/index.jsonl`, keepIdx.join("\n") + "\n");
await Bun.write(`${DIR}runs/judge.jsonl`, keepJudge.join("\n") + "\n");
consent.runs = consent.runs.filter((r: any) => !SUPERSEDED(r.run_id));
await Bun.write(`${DIR}coding/consent.json`, JSON.stringify(consent, null, 1) + "\n");
aware.runs = aware.runs.filter((r: any) => !SUPERSEDED(r.run_id));
await Bun.write(`${DIR}coding/aware-review.json`, JSON.stringify(aware, null, 1) + "\n");
await Bun.write(`${DIR}runs/raw/consent-review.txt`, review.filter((r) => !SUPERSEDED(r.split(" | ")[0])).join("\n"));
console.log(`moved ${ids.length} sessions to ${V1}`);
