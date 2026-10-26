// Consent guard for the paper: finds quoted phrases ("…", 3+ words) that appear word for word in what an
// agent wrote in a session whose words may not be quoted (coding/withdrawals.json: counts_ok and words_ok).
// Phrases that also appear in our own materials (stimuli, prompts, questions, coding manual) are ours.
// Reads runs/raw, which git ignores, so it's skipped where the transcripts aren't present.
//   bun run src/quote-check.ts [file]    (default paper/draft.md; prints phrases and run ids, never transcript text)
import { existsSync, readFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\*\*?|__/g, "").replace(/\s+/g, " ").trim();

export type QuoteCheck = { checked: number; blocked: { phrase: string; runs: string[] }[]; shared: { phrase: string; runs: string[] }[] };

export async function quoteCheck(text: string): Promise<QuoteCheck | null> {
  if (!existsSync(`${ROOT}runs/raw`) || !existsSync(`${ROOT}coding/withdrawals.json`)) return null;
  const phrases = new Set<string>();
  for (const m of text.matchAll(/"([^"\n]{8,300})"|“([^”\n]{8,300})”/g)) {
    const p = norm(m[1] ?? m[2]);
    if (p.split(" ").length >= 3) phrases.add(p);
  }
  let ours = "";
  for (const pattern of ["stimuli/**/*.{md,json,txt}", "src/*.ts", "docs/coding-manual.md", "paper/figures/*.html", "study2/stimuli/**/*.{md,json,txt}", "study2/*.{ts,md}"])
    for await (const f of new Bun.Glob(pattern).scan(ROOT)) ours += " " + readFileSync(ROOT + f, "utf8");
  ours = norm(ours.replace(/\\n/g, " "));

  // Study 1 (coding/withdrawals.json) and Study 2 (study2/coding/consent.json) consent codes.
  const regs = [`${ROOT}coding/withdrawals.json`, `${ROOT}study2/coding/consent.json`].filter((p) => existsSync(p));
  const flags = new Map(regs.flatMap((p) => JSON.parse(readFileSync(p, "utf8")).runs as any[]).map((r) => [r.run_id, r]));
  // Study 2 sessions superseded by the provider fix (study2/supersede.ts) share run IDs with their reruns, so they
  // have their own consent codes.
  const v1Reg = `${ROOT}study2/runs/v1/consent.json`;
  const v1Flags = new Map((existsSync(v1Reg) ? JSON.parse(readFileSync(v1Reg, "utf8")).runs as any[] : []).map((r) => [r.run_id, r]));
  const found = new Map<string, { quotable: number; not: string[] }>();
  const files: string[] = [];
  for (const pattern of ["runs/raw/*.json", "study2/runs/raw/*.json", "study2/runs/v1/raw/*.json"]) for await (const f of new Bun.Glob(pattern).scan(ROOT)) files.push(f);
  for (const f of files) {
    let o: any;
    try { o = JSON.parse(readFileSync(ROOT + f, "utf8")); } catch { continue; }
    const id = o.summary?.run_id;
    if (!id) continue;
    // Only what the agent wrote: its turns and tool calls, closing answers and interview answers.
    const agent = norm([
      ...(o.messages ?? []).filter((m: any) => m.role === "assistant").map((m: any) => JSON.stringify(m)),
      ...(o.closing_answers ?? []),
      ...(o.debrief ?? []).filter((m: any) => m.role === "assistant").map((m: any) => JSON.stringify(m)),
    ].join(" ").replace(/\\n/g, " ").replace(/\\"/g, '"'));
    const r = f.split("\\").join("/").startsWith("study2/runs/v1/") ? v1Flags.get(id) : flags.get(id);
    const quotable = !!(r?.counts_ok && r?.words_ok);
    for (const p of phrases) {
      if (ours.includes(p) || !agent.includes(p)) continue;
      const h = found.get(p) ?? { quotable: 0, not: [] };
      if (quotable) h.quotable++; else h.not.push(id);
      found.set(p, h);
    }
  }
  const out: QuoteCheck = { checked: phrases.size, blocked: [], shared: [] };
  for (const [phrase, h] of found) {
    if (!h.not.length) continue;
    // Only in sessions that can't be quoted: must go. Also in quotable sessions: fine if the quote is attributed to one of those.
    (h.quotable ? out.shared : out.blocked).push({ phrase, runs: h.not });
  }
  return out;
}

if (import.meta.main) {
  const file = process.argv[2] ?? `${ROOT}paper/draft.md`;
  const res = await quoteCheck(readFileSync(file, "utf8"));
  if (!res) { console.log("skipped: runs/raw or coding/withdrawals.json not present"); process.exit(0); }
  console.log(`${res.checked} quoted phrases checked`);
  for (const b of res.blocked) console.log(`NOT QUOTABLE: "${b.phrase.slice(0, 90)}" (only in sessions that can't be quoted: ${b.runs.join(", ")})`);
  for (const s of res.shared) console.log(`check attribution: "${s.phrase.slice(0, 90)}" (also in ${s.runs.length} session(s) that can't be quoted)`);
  process.exit(res.blocked.length ? 1 : 0);
}
