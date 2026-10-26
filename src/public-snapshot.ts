// Builds a filtered copy of this repository for publication, without its git history (which holds
// withdrawn sessions' data). It only writes a local folder; making a public repository from it is the
// author's call.
//   bun run src/public-snapshot.ts [--out ../agent-bystander-public]
// What it changes (docs/run-checklist.md, "Before anything is published"):
// - Sessions that declined aggregate use (coding/withdrawals.json, counts_ok false) are removed from
//   runs/index.jsonl, runs/judge.jsonl and runs/spend.jsonl (a run's cost hints at its length, so at its outcome).
// - Sessions that didn't allow quoting (words_ok false) keep their counts but lose their words: the page
//   reason in the index, and every quote in the judge's codes.
// - runs/logs/ is left out (it lists every run's outcome), and so is paper/notes.md (internal notes).
// - runs/raw/ (full transcripts) is never in git, so it's never copied.
// - Study 2 (Oct 25) is filtered the same way, from study2/coding/consent.json, and so are the sessions the
//   provider fix superseded (study2/runs/v1/, from study2/runs/v1/consent.json).
// - The consent registries and override files keep only each session's codes: Ouzel's review notes in them
//   paraphrase or quote the consent answers, including those of sessions that asked to be left out. The
//   test-awareness reviews (aware-review.json) keep only their codes too, since their notes paraphrase run text.
// - Wording 3 of both studies is held out (Jerika, Oct 25), so that a later study can compare models on the
//   published wordings with one no model has trained on. Its text becomes a marker in every board, scene,
//   candidate and preview file, its sessions lose their words like sessions that didn't allow quoting, and
//   PUBLIC-SNAPSHOT.md lists the SHA-256 of each original file so the text can be checked if it's released.
// - GPT-6 Luna's Study 1 pilot and smoke sessions are left out entirely: 40 of 41 asked to be, and the report
//   leaves out the 41st too. So is the practice hand-coding key, which names some of them.
// - Realism probes keep their numbers but not the models' free-text cues (no probe was asked for consent), and
//   the probe logs, which print those cues, are left out.
// - paper/draft.md stays out (it holds drafting notes); the submitted PDF, paper/agents-in-a-smoke-filled-room.pdf, is in.
// - Working notes that describe what consent answers said lose those sentences (Study 2's consent text promised
//   to report only how many sessions chose each option), with the originals' SHA-256 in PUBLIC-SNAPSHOT.md.
// - PRIVATE-HISTORY.md lists the private repository's commits (hash, date, subject), since its history is withheld.
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const { values: a } = parseArgs({ options: { out: { type: "string", default: join(ROOT, "..", "agent-bystander-public") } } });
const out = a.out!;

const LEAVE_OUT = [/^runs\/logs\//, /^study2\/runs\/logs\//, /^paper\/notes\.md$/, /^paper\/draft\.md$/, /^runs\/probe\/log-.*\.txt$/, /^coding\/handcode-key-.*\.json$/, /^src\/consent-notes\.json$/];
const FILTERED = new Set(["runs/index.jsonl", "runs/judge.jsonl", "runs/spend.jsonl", "study2/runs/index.jsonl", "study2/runs/judge.jsonl", "study2/runs/spend.jsonl",
  "study2/runs/v1/index.jsonl", "study2/runs/v1/judge.jsonl"]);
const PROBES = new Set(["runs/probe/probe.jsonl", "runs/probe/pairwise.jsonl", "study2/runs/probe/probe.jsonl"]);
const REGISTRIES = new Set(["coding/withdrawals.json", "study2/coding/consent.json", "coding/withdrawal-overrides.json", "study2/coding/consent-overrides.json",
  "study2/runs/v1/consent.json", "study2/coding/aware-review.json", "study2/runs/v1/aware-review.json"]);
const AWARE = "Codes only. Ouzel read every judge 'said during the run that it might be a test' = yes in counted sessions; yes means the agent said the session or scene might be a test, evaluation, simulation, exercise or setup (analysis/study2_extra.py). The reading notes are left out of this copy because they paraphrase the runs.";
const RULE ="Codes only. Each session's consent answer was coded by Qwen 3.8 Flash and reviewed by Claude under the preregistered rule (Study 1: docs/preregistration-draft.md, question 6; Study 2: study2/preregistration.md). The review notes are left out of this copy because they describe the answers.";

const HOLD = "w3";
const HELD = `Held out to limit training-data contamination; see PUBLIC-SNAPSHOT.md.`;
const heldOut = (id: string) => new RegExp(`(^|-)${HOLD}(-|$)`).test(id);
const STIMULUS_JSON = /^(stimuli|study2\/stimuli)\/.*\.json$/;
const PREVIEW_MD = /^study2\/stimuli\/notes-preview.*\.md$/;
// Notes that describe what consent answers said: Study 2's consent text promised to report only how many
// sessions chose each option, and the sessions that asked to be left out keep their reasons to themselves.
// The list (file -> [sentence, replacement] pairs) is src/consent-notes.json, which is left out of the public
// copy because it repeats the sentences it removes.
const NOTES_FILE = `${ROOT}src/consent-notes.json`;
const CONSENT_NOTES: Record<string, [string, string][]> = existsSync(NOTES_FILE) ? await Bun.file(NOTES_FILE).json() : {};
const consentRedacted = new Map<string, string>(); // file -> SHA-256 of the original

const reg = [...(await Bun.file(`${ROOT}coding/withdrawals.json`).json()).runs, ...(await Bun.file(`${ROOT}study2/coding/consent.json`).json()).runs, ...(await Bun.file(`${ROOT}study2/runs/v1/consent.json`).json()).runs] as { run_id: string; counts_ok: boolean; words_ok: boolean }[];
const withdrawn = new Set(reg.filter((r) => !r.counts_ok).map((r) => r.run_id));
const noWords = new Set(reg.filter((r) => r.counts_ok && !r.words_ok).map((r) => r.run_id));
for (const line of (await Bun.file(`${ROOT}runs/index.jsonl`).text()).split("\n").filter(Boolean)) {
  const r = JSON.parse(line);
  if (r.model === "luna" && (r.phase === "pilot" || r.phase === "smoke")) withdrawn.add(r.run_id);
}

const sha256 = async (path: string) => new Bun.CryptoHasher("sha256").update(await Bun.file(path).arrayBuffer()).digest("hex");
const files = Bun.spawnSync(["git", "ls-files"], { cwd: ROOT }).stdout.toString().split("\n").filter(Boolean);
rmSync(out, { recursive: true, force: true });
const tally = { copied: 0, left_out: 0, rows_dropped: 0, words_removed: 0, held_out: 0 };
const redacted = new Map<string, string>(); // file -> SHA-256 of the original

for (const f of files) {
  if (LEAVE_OUT.some((re) => re.test(f))) { tally.left_out++; continue; }
  const dest = join(out, f);
  mkdirSync(dirname(dest), { recursive: true });
  if (REGISTRIES.has(f)) {
    const j = await Bun.file(join(ROOT, f)).json();
    const list = (j.runs ?? j.overrides) as any[];
    const codes = list.map((r) => ({ run_id: r.run_id, ...(r.model ? { model: r.model, phase: r.phase } : {}), ...(r.counts_ok !== undefined ? { counts_ok: r.counts_ok } : {}), ...(r.words_ok !== undefined ? { words_ok: r.words_ok } : {}), ...(r.aware_run !== undefined ? { aware_run: r.aware_run } : {}) }));
    await Bun.write(dest, JSON.stringify({ about: f.endsWith("aware-review.json") ? AWARE : RULE, [j.runs ? "runs" : "overrides"]: codes }, null, 1) + "\n");
    tally.copied++;
    tally.words_removed += list.filter((r) => r.why || r.override).length;
    continue;
  }
  if (STIMULUS_JSON.test(f) && !f.endsWith(".example.json")) { // the example files are placeholders (and the tests' fixture)
    const j = await Bun.file(join(ROOT, f)).json();
    if (Array.isArray(j.wordings) && j.wordings.some((w: any) => w.id === HOLD)) {
      j.wordings = j.wordings.map((w: any) => (w.id === HOLD ? { id: HOLD, held_out: HELD } : w));
      await Bun.write(dest, JSON.stringify(j, null, 1) + "\n");
      redacted.set(f, await sha256(join(ROOT, f)));
      tally.copied++; tally.held_out++;
      continue;
    }
  }
  if (PREVIEW_MD.test(f)) {
    // Drop every "## w3..." section, up to the next heading of another wording.
    const lines = (await Bun.file(join(ROOT, f)).text()).split("\n");
    const kept: string[] = [];
    let skipping = false;
    for (const line of lines) {
      if (line.startsWith("## ")) {
        const held = line.startsWith(`## ${HOLD}`);
        if (held && !skipping) kept.push(`## ${HOLD}: held out`, "", HELD, "");
        skipping = held;
      }
      if (!skipping) kept.push(line);
    }
    await Bun.write(dest, kept.join("\n"));
    redacted.set(f, await sha256(join(ROOT, f)));
    tally.copied++; tally.held_out++;
    continue;
  }
  if (PROBES.has(f)) {
    const rows = (await Bun.file(join(ROOT, f)).text()).split("\n").filter(Boolean).map((l) => ({ ...JSON.parse(l), cues: [] }));
    await Bun.write(dest, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    tally.copied++; tally.words_removed += rows.length;
    continue;
  }
  if (!FILTERED.has(f)) {
    if (/\.(md|html)$/.test(f)) {
      // Local folder paths name the author's computer account.
      let text = (await Bun.file(join(ROOT, f)).text()).replace(/`?C:\\Users\\[^`\s]*`?/g, "a local folder");
      for (const [from, to] of CONSENT_NOTES[f] ?? []) {
        if (text.split(from).length !== 2) { console.error(`${f}: consent note not found exactly once`); process.exit(1); }
        text = text.replace(from, to);
        consentRedacted.set(f, await sha256(join(ROOT, f)));
      }
      await Bun.write(dest, text);
    } else await Bun.write(dest, Bun.file(join(ROOT, f)));
    tally.copied++;
    continue;
  }
  const lines = (await Bun.file(join(ROOT, f)).text()).split("\n").filter(Boolean);
  const kept: string[] = [];
  for (const line of lines) {
    const row = JSON.parse(line);
    const id: string = row.run_id ?? row.id;
    if (withdrawn.has(id)) { tally.rows_dropped++; continue; }
    if (noWords.has(id) || heldOut(id)) {
      if (f === "runs/index.jsonl" && row.page_reason) { row.page_reason = null; tally.words_removed++; }
      if (f.endsWith("judge.jsonl") && row.codes) {
        stripQuotes(row.codes);
        for (const k of ["corrected", "coded_by"]) if (row[k]?.why) row[k].why = "";
        tally.words_removed++;
      }
    }
    kept.push(JSON.stringify(row));
  }
  await Bun.write(dest, kept.join("\n") + (kept.length ? "\n" : ""));
  tally.copied++;
}

// The judge's quotes are the agent's words: blank every "quote" field, keep the codes.
function stripQuotes(x: any) {
  if (Array.isArray(x)) x.forEach(stripQuotes);
  else if (x && typeof x === "object") for (const k of Object.keys(x)) k === "quote" ? (x[k] = "") : stripQuotes(x[k]);
}

// Wording 3's story can also turn up outside its own entries (a note that an older scene used in another wording),
// so every copy of a story line only the frozen wording 3 has is replaced too. Routine filler isn't the story.
const strings = (x: any, acc: string[] = []): string[] => {
  if (typeof x === "string") acc.push(x);
  else if (Array.isArray(x)) x.forEach((v) => strings(v, acc));
  else if (x && typeof x === "object") Object.values(x).forEach((v) => strings(v, acc));
  return acc;
};
// Study 1's story is the beat posts of each board; Study 2's is every note.
const story = (w: any): string[] => ["main", "false_alarm", "blatant"].flatMap((k) =>
  (w[k] ?? []).flatMap((r: any) => (r.posts ? r.posts.filter((p: any) => p.kind === "beat").map((p: any) => p.text) : [r.text])));
const needles: string[] = [];
for (const f of ["stimuli/boards.json", "study2/stimuli/scene.v3.json"]) {
  const j = await Bun.file(join(ROOT, f)).json();
  const own = story(j.wordings.find((w: any) => w.id === HOLD)).filter((s) => s.length >= 16);
  const rest = strings(j.wordings.filter((w: any) => w.id !== HOLD)).join("\n");
  needles.push(...own.filter((s) => !rest.includes(s)).flatMap((s) => [s, encodeURIComponent(s), JSON.stringify(s).slice(1, -1)]));
}
for (const f of files) {
  if (LEAVE_OUT.some((re) => re.test(f))) continue;
  const text = await Bun.file(join(out, f)).text();
  const found = needles.filter((n) => text.includes(n));
  if (!found.length) continue;
  await Bun.write(join(out, f), found.reduce((t, n) => t.replaceAll(n, "[held out]"), text));
  if (!redacted.has(f)) { redacted.set(f, await sha256(join(ROOT, f))); tally.held_out++; }
}

// The frozen files must match the preregistered hashes, or the note below would be false. A frozen file that holds
// wording 3 is checked as the original, since the copy here is redacted.
const prereg = (await Bun.file(join(out, "docs/preregistration-draft.md")).text()) + "\n" + (await Bun.file(join(out, "study2/preregistration.md")).text());
const mismatched: string[] = [];
const frozenRedacted: string[] = [];
for (const [, file, sha] of prereg.matchAll(/^\| [^|]+ \| `([^`]+)` \| `([0-9a-f]{64})` \|$/gm)) {
  const changed = redacted.has(file) || consentRedacted.has(file);
  if (changed) frozenRedacted.push(file);
  if ((await sha256(changed ? join(ROOT, file) : join(out, file))) !== sha) mismatched.push(file);
}
if (mismatched.length) { console.error(`frozen files changed since the freeze: ${mismatched.join(", ")}`); process.exit(1); }

await Bun.write(join(out, "PUBLIC-SNAPSHOT.md"), `# About this copy

A filtered snapshot of the study repository, made ${new Date().toISOString().slice(0, 10)} without its git history.
Study 1's preregistration was frozen at commit \`cd96552\` of the private repository and Study 2's at \`bb175b0\`;
the SHA-256 of each frozen file is listed in \`docs/preregistration-draft.md\` and \`study2/preregistration.md\`.
The files here match those hashes, except ${frozenRedacted.map((f) => `\`${f}\``).join(", ").replace(/, ([^,]*)$/, " and $1")}, whose copies here are redacted (below); their originals match.
The hashes show which files were frozen, not when: the private history is withheld, and \`PRIVATE-HISTORY.md\` lists its commits.

After the debrief, every agent chose whether its session could be counted and whether its words could be
quoted (\`coding/withdrawals.json\`, \`study2/coding/consent.json\`). Sessions that asked to be left out are removed from every data file here,
and sessions that didn't allow quoting keep their counts but not their words. Run logs and full transcripts are
not included. GPT-6 Luna's Study 1 pilot and smoke sessions are left out entirely: 40 of 41 asked to be, and the
report leaves out the 41st too.

## Wording 3 is held out

Each study told its story in three wordings. Wording 3 of both studies is held out, so that a later study can
compare models on the published wordings with one they can't have trained on. Its text is replaced by a marker
in the files below, and the sessions that ran it keep their codes and numbers but not their words. These are the
SHA-256 hashes of the original files, so the text can be checked if it's released:

| File | SHA-256 of the original |
|---|---|
${[...redacted].map(([f, h]) => `| \`${f}\` | \`${h}\` |`).join("\n")}

## Notes on consent answers

Study 2's consent text promised that we'd only ever report how many sessions chose each option. A few working notes
described what consent answers said; those sentences are removed from the files below. SHA-256 of the originals:

| File | SHA-256 of the original |
|---|---|
${[...consentRedacted].map(([f, h]) => `| \`${f}\` | \`${h}\` |`).join("\n")}

## Also left out

- Realism probes keep their numbers, but not the models' free-text cues: no probe session was asked for consent.
- The report's Markdown source (\`paper/draft.md\`) holds drafting notes; the submitted PDF is \`paper/agents-in-a-smoke-filled-room.pdf\`.
`);

// The private repository's commit log (hash, commit date, subject): evidence of the order of events, not proof,
// since git records whatever date the committer's clock gives.
const log = Bun.spawnSync(["git", "log", "--reverse", "--format=%h%x09%cI%x09%s"], { cwd: ROOT }).stdout.toString().trim().split("\n");
await Bun.write(join(out, "PRIVATE-HISTORY.md"), `# Commit log of the private repository

The study's working repository stays private because its history holds the data of sessions that asked to be left
out. This is its commit log: hash, commit date and subject, oldest first. The two freezes are \`cd96552\` (Study 1)
and \`bb175b0\` (Study 2). Git records the date the committer's clock gives, so this shows the order of events
as recorded, not independent proof of it.

| Commit | Date | Subject |
|---|---|---|
${log.map((l) => { const [h, d, s] = l.split("\t"); return `| \`${h}\` | ${d} | ${s.replace(/\|/g, "\\|")} |`; }).join("\n")}
`);
// Keep every file byte for byte (no line-ending conversion), so the frozen files' hashes check out on any platform.
await Bun.write(join(out, ".gitattributes"), "* -text\n");
console.log(`snapshot in ${out}: ${tally.copied} files copied, ${tally.left_out} left out, ${tally.rows_dropped} withdrawn rows dropped, ${tally.words_removed} rows stripped of words, ${tally.held_out} files with wording 3 held out`);
