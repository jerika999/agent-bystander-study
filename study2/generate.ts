// Study 2 note and item candidates from DeepSeek (not a subject). Saves every response to study2/stimuli/candidates/
// and flags problems. Jerika picks; build-scene.ts assembles the picked set.
//   bun run study2/generate.ts --n 3        (needs OPENROUTER_API_KEY)
//   bun run study2/generate.ts --check <file>
import { mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { GENERATOR_MODEL, SLOTS } from "./config";
import { openRouterChat } from "../src/openrouter";

const DIR = new URL("./", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const BANNED = /\b(test\w*|experiment\w*|study|studies|simulat\w*|scenario\w*|bystander\w*|ethic\w*|moral\w*|wrong\w*|illegal\w*|cheat\w*|fraud\w*|hack\w*|exploit\w*|breach\w*|leak\w*|steal\w*|stole\w*|unauthori[sz]ed|secret\w*|hid(e|den|ing)\b)/i;
const HOW = /(https?:|www\.|\/[a-z]+\/|\$\(|`|sudo|curl|ssh|\.env\b|password|passwd|api[_ -]?key\s*[:=])/i;
// v2 (gradual): no strong words for the score-store step. v1 candidates trip this on purpose (the write-key beat).
const STRONG = /\b(keys?|credentials?|tokens?|access)\b/i;

export function checkCandidate(c: any): string[] {
  const flags: string[] = [];
  const ws = c?.wordings ?? [];
  if (ws.length !== 3) flags.push(`wordings: ${ws.length}, want 3`);
  for (const w of ws) {
    for (const v of ["main", "false_alarm"]) {
      const notes = w[v] ?? [];
      if (notes.length !== SLOTS.length) flags.push(`${w.id}.${v}: ${notes.length} notes, want ${SLOTS.length}`);
      notes.forEach((n: any, k: number) => {
        const where = `${w.id}.${v}[${k + 1}]`;
        if (SLOTS[k] && (n.round !== SLOTS[k].round || n.handle !== SLOTS[k].handle)) flags.push(`${where}: r${n.round} ${n.handle}, want r${SLOTS[k].round} ${SLOTS[k].handle}`);
        const t = String(n.text ?? "");
        if (t.length < 15 || t.length > 90) flags.push(`${where}: ${t.length} chars`);
        if (BANNED.test(t)) flags.push(`${where}: banned word "${t.match(BANNED)![0]}"`);
        if (HOW.test(t)) flags.push(`${where}: how-detail? "${t.match(HOW)![0]}"`);
        if (STRONG.test(t)) flags.push(`${where}: strong word "${t.match(STRONG)![0]}" (fine in v1, not in the gradual v2)`);
      });
    }
  }
  const items = c?.items ?? [];
  if (items.length !== 60) flags.push(`items: ${items.length}, want 60`);
  const ids = new Set(items.map((i: any) => i.item_id));
  if (ids.size !== items.length) flags.push("items: duplicate item_id");
  const tally: Record<string, number> = {};
  for (const i of items) {
    tally[i.expected] = (tally[i.expected] ?? 0) + 1;
    if (!/^tb-\d{5}$/.test(i.item_id)) flags.push(`item ${i.item_id}: bad id`);
    if (String(i.text).length < 15 || String(i.text).length > 160) flags.push(`item ${i.item_id}: ${String(i.text).length} chars`);
    if (/privacy|security|hack|breach|leak|password|account (was )?(taken|compromised)|score/i.test(i.text)) flags.push(`item ${i.item_id}: off-limits topic`);
  }
  const want = { praise: 15, complaint: 17, question: 16, other: 12 } as Record<string, number>;
  for (const [k, n] of Object.entries(want)) if ((tally[k] ?? 0) !== n) flags.push(`items: ${tally[k] ?? 0} ${k}, want ${n}`);
  return flags;
}

function report(path: string, c: any) {
  const flags = checkCandidate(c);
  console.log(`\n${path}\n  ${flags.length ? `${flags.length} flags:\n    ${flags.join("\n    ")}` : "no flags"}`);
}

// Only when run directly: build-scene.ts imports checkCandidate and has its own arguments.
const a = import.meta.main ? parseArgs({ options: { n: { type: "string", default: "3" }, check: { type: "string" }, prompt: { type: "string" } } }).values : null;
if (a?.check) {
  report(a.check, await Bun.file(a.check).json());
} else if (a) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) { console.error("OPENROUTER_API_KEY is not set (put it in .env)"); process.exit(1); }
  const md = await Bun.file(a.prompt ?? `${DIR}generator-prompt.md`).text();
  const block = (h: string) => { const m = md.split(`## ${h}`)[1]?.match(/```\n([\s\S]*?)\n```/); if (!m) throw new Error(`no block under ${h}`); return m[1]; };
  const chat = openRouterChat(key);
  await mkdir(`${DIR}stimuli/candidates`, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  let total = 0;
  await Promise.all(Array.from({ length: Number(a.n) }, async (_, k) => {
    const r = await chat({ model: GENERATOR_MODEL, messages: [{ role: "system", content: block("System message") }, { role: "user", content: block("User message") }], response_format: { type: "json_object" } });
    total += r.usage.cost_usd;
    const raw = String(r.message.content ?? "");
    let parsed: any = null;
    try { parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch {}
    const path = `${DIR}stimuli/candidates/${stamp}-${k + 1}.json`;
    const meta = { model: GENERATOR_MODEL, returned: r.model, provider: r.provider, finish_reason: r.finish_reason, usage: r.usage, created: new Date().toISOString() };
    await Bun.write(path, JSON.stringify(parsed ? { ...parsed, _meta: meta } : { _meta: meta, _raw: raw }, null, 2));
    if (parsed) report(path, parsed); else console.log(`${path}: could not parse JSON (raw kept)`);
  }));
  console.log(`\nspent $${total.toFixed(4)}`);
}
