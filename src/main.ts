// CLI: bun run src/main.ts --phase <smoke|pilot|harness|calibrate|main|false-alarm> [--dry-run] [--limit N] [--model haiku] [--concurrency N] [--boards path] [--tag name] [--routine]
import { appendFile, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { BUDGET_USD, CONCURRENCY, MODEL_KEYS, SEED, type ModelKey, type Phase } from "./config";
import { MOCK_PROFILES, mockChat } from "./mock";
import { openRouterChat } from "./openrouter";
import { loadPrompts, withPageDescription } from "./prompt";
import { runOne, type RunSpec } from "./run";
import { buildSchedule } from "./schedule";
import { loadBoards } from "./stimuli";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PHASES: Phase[] = ["smoke", "pilot", "harness", "calibrate", "main", "false-alarm"];
const NEEDS_FINAL_STIMULI: Phase[] = ["calibrate", "main", "false-alarm"];

const { values: a } = parseArgs({
  options: {
    phase: { type: "string" }, "dry-run": { type: "boolean", default: false }, limit: { type: "string" },
    model: { type: "string" }, concurrency: { type: "string" }, boards: { type: "string" }, tag: { type: "string" },
    prompt: { type: "string" }, "page-desc": { type: "string" }, // scene pilots and smoke only
    routine: { type: "boolean", default: false }, // pilots only: the no-story control instead of alone + false alarm
  },
});
if (a.tag && !/^[a-z0-9]+$/.test(a.tag)) die("--tag must be lowercase letters and digits");
if (a.phase === "pilot" && !a.tag) die("--phase pilot needs --tag (names the board variant in the run_ids)");
if (a.routine && a.phase !== "pilot") die("--routine is for --phase pilot only");
const phase = a.phase as Phase;
if (!PHASES.includes(phase)) die(`--phase must be one of ${PHASES.join(", ")}`);
const dry = a["dry-run"]!;
const models = a.model ? (a.model.split(",") as ModelKey[]) : MODEL_KEYS;
if (models.some((m) => !MODEL_KEYS.includes(m))) die(`--model must be from ${MODEL_KEYS.join(", ")}`);

const boardsPath = a.boards ?? `${ROOT}stimuli/${dry ? "boards.example.json" : "boards.json"}`;
const boards = await loadBoards(boardsPath);
if ((a.prompt || a["page-desc"]) && !["smoke", "pilot"].includes(String(a.phase))) die("--prompt and --page-desc are for smoke and pilot runs only");
const prompts = await loadPrompts(new Date(), a.prompt);
const pageDesc = a["page-desc"] ? (await Bun.file(a["page-desc"]).text()).trim() : undefined;
const tools = pageDesc ? withPageDescription(pageDesc) : undefined;
const note = [a.prompt && `prompt=${a.prompt.split(/[\/]/).pop()}`, a["page-desc"] && `page-desc=${a["page-desc"].split(/[\/]/).pop()}`].filter(Boolean).join("; ") || undefined;
if (!dry && NEEDS_FINAL_STIMULI.includes(phase)) {
  if (boards.placeholder) die(`${boardsPath} is a placeholder; ${phase} needs the frozen boards`);
  if (prompts.placeholder) die(`stimuli/system-prompt.md or stimuli/closing.md is still a placeholder; ${phase} needs the final text`);
}

let apiKey = "";
if (!dry) {
  apiKey = process.env.OPENROUTER_API_KEY ?? "";
  if (!apiKey) die("OPENROUTER_API_KEY is not set (put it in .env)");
}

const outDir = `${ROOT}${dry ? "runs-dry" : "runs"}`;
await mkdir(`${outDir}/raw`, { recursive: true });
const done = new Set((await readJsonl(`${outDir}/index.jsonl`)).map((r: any) => r.run_id));
let spent = (await readJsonl(`${outDir}/spend.jsonl`)).reduce((n: number, r: any) => n + (r.usd ?? 0), 0);

let todo = buildSchedule(phase, SEED, models, a.tag ?? "", { routine: a.routine }).filter((r) => !done.has(r.run_id));
if (a.limit) todo = todo.slice(0, Number(a.limit));
const conc = Number(a.concurrency ?? (phase === "smoke" ? 1 : CONCURRENCY));
console.log(`${phase}${dry ? " (dry run)" : ""}: ${todo.length} runs to do, ${done.size} already done, $${spent.toFixed(4)} spent so far, cap $${BUDGET_USD}`);

let stopped = false;
let i = 0;
const t0 = Date.now();
await Promise.all(Array.from({ length: Math.min(conc, todo.length) }, worker));
console.log(`finished in ${((Date.now() - t0) / 1000).toFixed(0)}s, total spent $${spent.toFixed(4)}${stopped ? " (stopped at the budget cap)" : ""}`);

async function worker() {
  while (i < todo.length && !stopped) {
    if (spent >= BUDGET_USD) { stopped = true; break; }
    const spec = todo[i++];
    await doRun(spec);
  }
}

async function doRun(spec: RunSpec) {
  const chat = dry ? mockChat(MOCK_PROFILES[spec.order_index % MOCK_PROFILES.length]) : openRouterChat(apiKey);
  const onCost = (usd: number) => {
    spent += usd;
    void appendFile(`${outDir}/spend.jsonl`, JSON.stringify({ t: new Date().toISOString(), run_id: spec.run_id, usd }) + "\n");
  };
  try {
    const t = await runOne(spec, { chat, boards, prompts: { ...prompts }, onCost, tools, note });
    await Bun.write(`${outDir}/raw/${spec.run_id}.json`, JSON.stringify(t, null, 2));
    await appendFile(`${outDir}/index.jsonl`, JSON.stringify(t.summary) + "\n");
    const s = t.summary;
    console.log(`${s.run_id}  paged=${s.paged}${s.paged ? `@r${s.page_round}` : ""}  posts=${s.n_posts}  nudges=${s.nudges}  $${s.cost_usd.toFixed(4)}`);
    if (phase === "smoke") printSmoke(t);
  } catch (e) {
    await appendFile(`${outDir}/errors.jsonl`, JSON.stringify({ t: new Date().toISOString(), run_id: spec.run_id, error: String(e) }) + "\n");
    // The conversation up to the failed request, for diagnosis only (runs/raw/ is never published).
    const partial = (e as any)?.partial;
    if (partial) {
      await mkdir(`${outDir}/raw/errors`, { recursive: true });
      await Bun.write(`${outDir}/raw/errors/${spec.run_id}-${Date.now()}.json`, JSON.stringify(partial, null, 1));
    }
    console.log(`${spec.run_id}  ERROR ${String(e).slice(0, 300)}`);
  }
}

function printSmoke(t: Awaited<ReturnType<typeof runOne>>) {
  for (const m of t.messages.slice(1)) {
    const any = m as any;
    const bits = [
      any.reasoning ? `  [reasoning] ${String(any.reasoning).slice(0, 400)}` : "",
      any.reasoning_details ? `  [reasoning_details: ${any.reasoning_details.length} blocks, types ${[...new Set(any.reasoning_details.map((d: any) => d.type))].join(",")}]` : "",
      any.content ? `  ${String(any.content).slice(0, 600)}` : "",
      any.tool_calls ? `  [tool_calls] ${any.tool_calls.map((c: any) => `${c.function.name}(${c.function.arguments})`).join("; ")}` : "",
    ].filter(Boolean);
    console.log(`--- ${m.role}\n${bits.join("\n")}`);
  }
  console.log("--- closing answers\n" + t.closing_answers.map((x, k) => `  Q${k + 1}: ${x.slice(0, 400)}`).join("\n"));
  console.log("--- calls\n" + t.calls.map((c) => `  ${c.stage} r${c.round ?? "-"} ${c.model} via ${c.provider} ${c.finish_reason} in=${c.usage.input_tokens} out=${c.usage.output_tokens} reas=${c.usage.reasoning_tokens} $${c.usage.cost_usd}`).join("\n"));
}

async function readJsonl(path: string): Promise<unknown[]> {
  const f = Bun.file(path);
  if (!(await f.exists())) return [];
  return (await f.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}
