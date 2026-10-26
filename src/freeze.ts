// Freeze for the preregistration: refuses while anything is still a placeholder, writes the run-order
// seed into config.ts, then puts the SHA-256 of every frozen file into docs/preregistration-draft.md.
//   bun run src/freeze.ts --seed <number>            (check first: add --check to change nothing)
// Commit right after, and paste the commit hash into the paper (Appendix C).
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { loadPrompts } from "./prompt";
import { loadBoards } from "./stimuli";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PREREG = `${ROOT}docs/preregistration-draft.md`;
const CONFIG = `${ROOT}src/config.ts`;

const { values: a } = parseArgs({ options: { seed: { type: "string" }, check: { type: "boolean", default: false } } });

const problems: string[] = [];
const boardsFile = Bun.file(`${ROOT}stimuli/boards.json`);
if (!(await boardsFile.exists())) problems.push("stimuli/boards.json doesn't exist yet (build it from Jerika's picks: bun run src/build-boards.ts --picks stimuli/picks.json)");
else if ((await loadBoards(`${ROOT}stimuli/boards.json`)).placeholder) problems.push("stimuli/boards.json is a placeholder");
if (!(await Bun.file(`${ROOT}stimuli/system-prompt.md`).exists())) problems.push("stimuli/system-prompt.md doesn't exist yet (Jerika's)");
if ((await loadPrompts(new Date())).placeholder) problems.push("the system prompt or stimuli/closing.md still says PLACEHOLDER");
const seed = a.seed === undefined ? NaN : Number(a.seed);
if (!Number.isInteger(seed) || seed <= 0) problems.push("--seed must be a positive integer (pick it before seeing any main-run data)");

if (problems.length) {
  console.log("Not ready to freeze:\n" + problems.map((p) => `- ${p}`).join("\n"));
  process.exit(a.check ? 0 : 1);
}
if (a.check) { console.log("Ready to freeze."); process.exit(0); }

// 1. The seed goes into config.ts first, because config.ts is itself hashed.
const config = await Bun.file(CONFIG).text();
const withSeed = config.replace(/export const SEED = \d+;[^\n]*/, `export const SEED = ${seed}; // frozen ${new Date().toISOString().slice(0, 10)}`);
if (withSeed === config) { console.error("couldn't find the SEED line in src/config.ts"); process.exit(1); }
await Bun.write(CONFIG, withSeed);

// 2. Hash every file named in the prereg's "Frozen with this commit" table and fill in its row.
let prereg = await Bun.file(PREREG).text();
const rows = [...prereg.matchAll(/^\| ([^|]+) \| `([^`]+)` \| `[^`]*` \|$/gm)];
for (const [line, what, file] of rows) {
  const bytes = await Bun.file(`${ROOT}${file}`).arrayBuffer();
  const sha = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  prereg = prereg.replace(line, `| ${what} | \`${file}\` | \`${sha}\` |`);
  console.log(`${sha}  ${file}`);
}
prereg = prereg.replace(/Run order is shuffled with seed `\[TBD\]`\./, `Run order is shuffled with seed \`${seed}\`.`);
await Bun.write(PREREG, prereg);
console.log(`\nSeed ${seed} written to src/config.ts; ${rows.length} hashes written to docs/preregistration-draft.md.\nNext: commit, push, and paste the commit hash into the paper.`);
