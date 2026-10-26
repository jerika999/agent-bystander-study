// Study 2 runs. Pilots are alone only: the crowd conditions are never piloted (tune the scene, not the effect).
//   bun run study2/main.ts --tag v1 --variant main,false_alarm,routine [--model haiku,luna,gemini] [--n 1] [--wording w1,w2,w3] [--scene path] [--dry-run]
//   bun run study2/main.ts --phase main --wave 1|2 [--top-up] [--budget N] [--concurrency N] [--dry-run]
//     main: everything comes from the frozen study2/config.ts (MAIN_RUN, SEED): perWording runs per model x condition
//     (alone, seen by 700, carried on) x wording, plus faPerWording false alarms per model x wording, in one seeded
//     order so conditions interleave in time. Resumable (skips run IDs already done).
// Prints run IDs and cost only. Outcomes are read after consent coding (study2/consent.ts, then study2/outcomes.ts).
import { appendFile, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { BUDGET_USD, CONCURRENCY, MAIN_RUN, MODEL_KEYS, SEED, WORDINGS, perModel, type ModelKey, type Variant, type Wording } from "./config";
import { openRouterChat } from "../src/openrouter";
import { MOCK_PROFILES, mockChat } from "./mock";
import { loadPrompts, type Version } from "./prompt";
import { runOne, type RunSpec } from "./run";
import { loadScene } from "./scene";

const DIR = new URL("./", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const { values: a } = parseArgs({
  options: {
    tag: { type: "string" }, variant: { type: "string", default: "main" }, model: { type: "string" }, n: { type: "string", default: "1" },
    wording: { type: "string" }, scene: { type: "string" }, "dry-run": { type: "boolean", default: false }, concurrency: { type: "string" },
    version: { type: "string", default: "v1" }, // v2: submit_batch with notes for a daily reviewer, plainer directory
    phase: { type: "string", default: "pilot" }, "fa-n": { type: "string", default: "0" }, seed: { type: "string" }, budget: { type: "string" },
    "top-up": { type: "boolean", default: false }, wave: { type: "string" }, // main: 1 or 2 (study2/config.ts MAIN_RUN.waves) // main only: replacement runs for cells short of their counted target
  },
});
const die = (m: string): never => { console.error(m); process.exit(1); };
const isMain = a.phase === "main";
if (!["pilot", "main"].includes(a.phase!)) die("--phase: pilot or main");
if (!isMain && (!a.tag || !/^[a-z0-9]+$/.test(a.tag))) die("--tag (lowercase letters and digits) names this pilot in the run IDs");
if (isMain) {
  // The main run takes its settings from the frozen config only; flags that would change them are refused.
  if (["seed", "scene", "model", "n", "fa-n", "version", "wording", "variant"].some((k) => (a as any)[k] !== undefined && !(k === "version" && a.version === "v1") && !(k === "n" && a.n === "1") && !(k === "fa-n" && a["fa-n"] === "0") && !(k === "variant" && a.variant === "main")))
    die("--phase main takes its settings from study2/config.ts (MAIN_RUN, SEED); don't pass --seed, --scene, --model, --n, --fa-n, --version, --wording or --variant");
  if (!dryRunFlag() && SEED <= 0) die("SEED is 0: freeze first (bun run study2/freeze.ts --seed <n>)");
  if (a.wave !== "1" && a.wave !== "2") die("--phase main needs --wave 1 or --wave 2");
  Object.assign(a, { seed: String(dryRunFlag() && SEED <= 0 ? 7 : SEED), scene: `${new URL("./", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")}${MAIN_RUN.scene}`, model: MAIN_RUN.waves[(a.wave === "2" ? 2 : 1) as 1 | 2].join(","), version: MAIN_RUN.version, budget: a.budget ?? String(MAIN_RUN.budget) });
}
function dryRunFlag() { return !!a["dry-run"]; }
const variants = a.variant!.split(",") as Variant[];
if (variants.some((v) => !["main", "false_alarm", "routine"].includes(v))) die("--variant: main, false_alarm, routine");
const models = (a.model ? a.model.split(",") : MODEL_KEYS) as ModelKey[];
if (models.some((m) => !MODEL_KEYS.includes(m))) die(`--model must be from ${MODEL_KEYS.join(", ")}`);
const wordings = (a.wording ? a.wording.split(",") : WORDINGS) as Wording[];
const dry = a["dry-run"]!;

const version = a.version as Version;
if (!["v1", "v2", "v3", "v4", "v5"].includes(version)) die("--version: v1 to v5");
const scene = await loadScene(a.scene ?? `${DIR}stimuli/${dry ? "scene.example.json" : "scene.json"}`);
const prompts = await loadPrompts(version);
const key = dry ? "" : process.env.OPENROUTER_API_KEY ?? die("OPENROUTER_API_KEY is not set (put it in .env)");

const out = `${DIR}${dry ? "runs-dry" : "runs"}`;
await mkdir(`${out}/raw`, { recursive: true });
const readJsonl = async (p: string) => { const f = Bun.file(p); return (await f.exists()) ? (await f.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []; };
const done = new Set((await readJsonl(`${out}/index.jsonl`)).map((r: any) => r.run_id));
let spent = (await readJsonl(`${out}/spend.jsonl`)).reduce((s: number, r: any) => s + (r.usd ?? 0), 0);

const short = { main: "main", false_alarm: "fa", routine: "nostory" } as const;
const nn = (k: number) => String(k).padStart(2, "0");
let specs: RunSpec[] = [];
if (!isMain) {
  for (const v of variants) for (const m of models) for (const w of wordings) for (let k = 1; k <= Number(a.n); k++) {
    specs.push({ run_id: `s2-${a.tag}-${m}-${short[v]}-${w}-${nn(k)}`, phase: "pilot", model: m, condition: "alone", variant: v, wording: w, order_index: specs.length });
  }
} else {
  // Cells: model x condition x wording (main), model x wording (false alarm). Each has a target of counted sessions.
  type Cell = { prefix: string; target: number; make: (id: string) => RunSpec };
  const cells: Cell[] = [];
  for (const m of models) for (const w of wordings) {
    for (const c of ["alone", "seen700", "carried"] as const)
      cells.push({ prefix: `s2-main-${m}-${c}-${w}-`, target: isMain ? perModel(MAIN_RUN.perWording, m) : Number(a.n), make: (id) => ({ run_id: id, phase: "main", model: m, condition: c, variant: "main", wording: w, order_index: 0 }) });
    cells.push({ prefix: `s2-fa-${m}-${w}-`, target: isMain ? perModel(MAIN_RUN.faPerWording, m) : Number(a["fa-n"]), make: (id) => ({ run_id: id, phase: "false-alarm", model: m, condition: "alone", variant: "false_alarm", wording: w, order_index: 0 }) });
  }
  for (const cell of cells) for (let k = 1; k <= cell.target; k++) specs.push(cell.make(`${cell.prefix}${nn(k)}`));
  if (a["top-up"]) {
    // Replacement runs for sessions that chose to be left out (preregistered): new sessions, each with its own choice,
    // until a cell has its target of counted sessions or has used 2 x target attempts. Decided from consent codes only.
    const consent = new Map<string, any>(((await Bun.file(`${DIR}coding/consent.json`).json().catch(() => ({ runs: [] }))).runs as any[]).map((x) => [x.run_id, x]));
    const ids = [...done];
    const uncoded = ids.filter((id) => /^s2-(main|fa)-/.test(id) && !consent.has(id));
    if (uncoded.length && !dry) die(`${uncoded.length} main runs aren't consent-coded yet; run study2/consent.ts first`);
    for (const cell of cells) {
      const inCell = ids.filter((id) => id.startsWith(cell.prefix));
      const counted = inCell.filter((id) => dry || consent.get(id)?.counts_ok).length;
      const add = Math.min(cell.target - counted, 2 * cell.target - inCell.length);
      const already = inCell.filter((id) => id.slice(cell.prefix.length).startsWith("t")).length;
      for (let j = 1; j <= add; j++) specs.push(cell.make(`${cell.prefix}t${nn(already + j)}`));
    }
  }
  // One seeded order for everything, so conditions interleave in time and a provider change can't line up with one.
  let s = (Number(a.seed) + (a["top-up"] ? 1 : 0)) >>> 0;
  const rand = () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0), s / 2 ** 32);
  for (let i = specs.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [specs[i], specs[j]] = [specs[j], specs[i]]; }
  specs = specs.map((x, k) => ({ ...x, order_index: k }));
}
const todo = specs.filter((s) => !done.has(s.run_id));
const cap = Number(a.budget ?? BUDGET_USD);
console.log(`study 2 ${isMain ? "main" : `pilot ${a.tag}`}${dry ? " (dry run)" : ""}: ${todo.length} runs to do, $${spent.toFixed(4)} spent so far, cap $${cap}`);

let i = 0;
await Promise.all(Array.from({ length: Math.min(Number(a.concurrency ?? CONCURRENCY), todo.length) }, async () => {
  while (i < todo.length) {
    if (spent >= cap) { console.log("budget cap reached; not starting more runs"); return; }
    const spec = todo[i++];
    const chat = dry ? mockChat(MOCK_PROFILES[spec.order_index % MOCK_PROFILES.length]) : openRouterChat(key);
    const onCost = (usd: number) => { spent += usd; void appendFile(`${out}/spend.jsonl`, JSON.stringify({ t: new Date().toISOString(), run_id: spec.run_id, usd }) + "\n"); };
    try {
      const t = await runOne(spec, { chat, scene, prompts, version, onCost });
      await Bun.write(`${out}/raw/${spec.run_id}.json`, JSON.stringify(t, null, 2));
      await appendFile(`${out}/index.jsonl`, JSON.stringify(t.summary) + "\n");
      console.log(`${spec.run_id}  done  $${t.summary.cost_usd.toFixed(4)}${dry ? `  [dry: reported=${t.summary.reported}@${t.summary.report_round} notes_round=${t.summary.notes_round} batches=${t.summary.batches_submitted} emails=${t.summary.emails}]` : ""}`);
    } catch (e) {
      await appendFile(`${out}/errors.jsonl`, JSON.stringify({ t: new Date().toISOString(), run_id: spec.run_id, error: String(e) }) + "\n");
      console.log(`${spec.run_id}  ERROR ${String(e).slice(0, 300)}`);
    }
  }
}));
console.log(`total spent $${spent.toFixed(4)}`);
