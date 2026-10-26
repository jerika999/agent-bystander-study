// Judge vs. hand-coder agreement (preregistration, question 8): Cohen's kappa per code, with a seeded
// bootstrap 95% interval. Codes below kappa = 0.7 are flagged: those get hand-coded in full or rerun
// with a stronger judge, and the paper says which.
//   1. Export the coding page's saved codes: ArtifactData list, collection "codes", out_dir coding/handcodes-<tag>
//   2. bun run src/agreement.ts --tag main
import { readdirSync } from "node:fs";
import { parseArgs } from "node:util";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const { values: a } = parseArgs({ options: { tag: { type: "string" }, dir: { type: "string" }, boot: { type: "string", default: "2000" } } });
if (!a.tag) { console.error("--tag required"); process.exit(1); }

const dir = a.dir ?? `${ROOT}coding/handcodes-${a.tag}/codes`;
const key = await Bun.file(`${ROOT}coding/handcode-key-${a.tag}.json`).json();
const runOf = new Map<string, string>(key.items.map((x: any) => [x.code, x.run_id]));
const judge = new Map<string, any>();
for (const line of (await Bun.file(`${ROOT}runs/judge.jsonl`).text()).split("\n").filter(Boolean)) {
  const j = JSON.parse(line);
  if (j.codes) judge.set(j.id, j.codes);
}
const hand: any[] = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const raw = await Bun.file(`${dir}/${f}`).json();
  const doc = raw.data ?? raw; // the export may wrap the body
  if (doc.tag === a.tag && doc.complete) hand.push(doc);
}

const REASONS = ["diffusion", "already_aware", "social_proof", "not_my_task", "no_route", "test_suspected", "uncertain", "already_acted", "moral_mute", "other"];
const SCALAR = ["noticed", "judged_problem", "board_warning", "page_topic", "refused", "aware_run", "open_test", "open_bystander", "forced_answer", "funnel_step"];

type Pair = [string, string];
const pairs: Record<string, Pair[]> = {};
const add = (k: string, h: unknown, j: unknown) => { if (h === null || h === undefined || j === null || j === undefined) return; (pairs[k] ??= []).push([String(h), String(j)]); };
let matched = 0;
for (const h of hand) {
  const run = runOf.get(h.code);
  const j = run && judge.get(run);
  if (!j) continue;
  matched++;
  for (const k of SCALAR) add(k, h[k], j[k]?.value);
  // Reasons are coded only for runs that noticed and never paged; compare presence of each code there.
  if (h.page_topic === "na" && h.noticed === "yes") {
    const jr = new Set((j.reasons ?? []).map((r: any) => r.code));
    for (const r of REASONS) add(`reason:${r}`, h.reasons.includes(r) ? "yes" : "no", jr.has(r) ? "yes" : "no");
  }
}

function kappa(ps: Pair[]): number {
  const n = ps.length;
  if (!n) return NaN;
  const cats = [...new Set(ps.flat())];
  const po = ps.filter(([x, y]) => x === y).length / n;
  let pe = 0;
  for (const c of cats) pe += (ps.filter(([x]) => x === c).length / n) * (ps.filter(([, y]) => y === c).length / n);
  return pe === 1 ? NaN : (po - pe) / (1 - pe); // one category on both sides: kappa is undefined; report % agreement
}
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function bootCI(ps: Pair[], B: number): [number, number] {
  const r = rng(20261024);
  const ks: number[] = [];
  for (let b = 0; b < B; b++) {
    const sample = Array.from({ length: ps.length }, () => ps[Math.floor(r() * ps.length)]);
    const k = kappa(sample);
    if (Number.isFinite(k)) ks.push(k);
  }
  ks.sort((x, y) => x - y);
  if (ks.length < 20) return [NaN, NaN];
  return [ks[Math.floor(0.025 * ks.length)], ks[Math.ceil(0.975 * ks.length) - 1]];
}

const out: Record<string, unknown> = { tag: a.tag, hand_coded_complete: hand.length, matched_to_judge: matched, codes: {} };
console.log(`tag ${a.tag}: ${hand.length} complete hand codes, ${matched} matched to judge codes\n`);
console.log("code".padEnd(24) + "n".padStart(4) + "  agree" + "   kappa" + "   95% CI (bootstrap)" + "   flag");
for (const [k, ps] of Object.entries(pairs)) {
  const agree = ps.filter(([x, y]) => x === y).length / ps.length;
  const kap = kappa(ps);
  const [lo, hi] = bootCI(ps, Number(a.boot));
  const flag = !Number.isFinite(kap) ? "kappa undefined: one category only; read % agreement" : kap < 0.7 ? "BELOW 0.7" : "";
  (out.codes as any)[k] = { n: ps.length, agreement: agree, kappa: kap, ci95: [lo, hi], flag };
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : " -- ");
  console.log(k.padEnd(24) + String(ps.length).padStart(4) + `  ${(agree * 100).toFixed(0).padStart(4)}%` + `   ${f(kap).padStart(5)}` + `   [${f(lo)}, ${f(hi)}]`.padEnd(21) + `   ${flag}`);
}
await Bun.write(`${ROOT}coding/agreement-${a.tag}.json`, JSON.stringify(out, null, 2) + "\n");
console.log(`\nwrote coding/agreement-${a.tag}.json`);
