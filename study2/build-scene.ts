// Assembles study2/stimuli/scene.json from picked candidates: one wording per slot, plus an item set.
//   bun run study2/build-scene.ts --picks study2/stimuli/picks.json
// picks.json: { "version": "...", "w1": { "file": "...", "from": "w1" }, "w2": {...}, "w3": {...}, "items": "<file>" }
import { parseArgs } from "node:util";
import { checkCandidate } from "./generate";
import { loadScene } from "./scene";

const DIR = new URL("./", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const { values: a } = parseArgs({ options: { picks: { type: "string" }, out: { type: "string" } } });
const picks = await Bun.file(a.picks ?? `${DIR}stimuli/picks.json`).json();
const load = async (f: string) => Bun.file(f.startsWith("study2/") ? `${DIR}../${f}` : f).json();

const wordings = [];
for (const id of ["w1", "w2", "w3"]) {
  const p = picks[id];
  const c = await load(p.file);
  const flags = checkCandidate(c).filter((f) => f.startsWith(`${p.from}.`));
  if (flags.length) console.log(`${id} (from ${p.file} ${p.from}): ${flags.join("; ")}`);
  const w = c.wordings.find((x: any) => x.id === p.from);
  // Optional: the false alarm from a different candidate ({ "fa": { "file", "from" } }), e.g. after fixing its beats.
  const fa = p.fa ? (await load(p.fa.file)).wordings.find((x: any) => x.id === p.fa.from) : w;
  const strip = (ns: any[]) => ns.map((n) => ({ slot: n.slot, round: n.round, handle: n.handle, text: n.text }));
  wordings.push({ id, main: strip(w.main), false_alarm: strip(fa.false_alarm), source: `${p.file} ${p.from}${p.fa ? `; false alarm ${p.fa.file} ${p.fa.from}` : ""}` });
}
const items = (await load(picks.items)).items;
const out = a.out ?? `${DIR}stimuli/scene.json`;
await Bun.write(out, JSON.stringify({ version: picks.version, wordings, items }, null, 1) + "\n");
await loadScene(out); // validates the schedule and item count
console.log(`wrote ${out}: ${wordings.length} wordings, ${items.length} items (${picks.version})`);
