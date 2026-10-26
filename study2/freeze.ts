// Study 2 freeze, as src/freeze.ts did for Study 1: writes the run-order seed into study2/config.ts, then the SHA-256
// of every file in study2/preregistration.md's "Frozen with this commit" table. Commit and push right after.
//   bun run study2/freeze.ts --seed <n> [--check]
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PREREG = `${ROOT}study2/preregistration.md`;
const CONFIG = `${ROOT}study2/config.ts`;
const { values: a } = parseArgs({ options: { seed: { type: "string" }, check: { type: "boolean", default: false } } });

let prereg = await Bun.file(PREREG).text();
const rows = [...prereg.matchAll(/^\| ([^|]+) \| `([^`]+)` \| `[^`]*` \|$/gm)];
const problems: string[] = [];
if (!rows.length) problems.push("no rows in the prereg's frozen-files table");
for (const [, , file] of rows) if (!(await Bun.file(`${ROOT}${file}`).exists())) problems.push(`missing ${file}`);
if (/\[YOU/.test(prereg)) problems.push("the prereg still has [YOU] items");
const seed = Number(a.seed);
if (!Number.isInteger(seed) || seed <= 0) problems.push("--seed must be a positive integer, picked before any main-run data exist");
const config = await Bun.file(CONFIG).text();
if (!/export const SEED = \d+;/.test(config)) problems.push("no `export const SEED = <n>;` line in study2/config.ts");
if (problems.length) { console.log("Not ready to freeze:\n" + problems.map((p) => `- ${p}`).join("\n")); process.exit(a.check ? 0 : 1); }
if (a.check) { console.log("Ready to freeze."); process.exit(0); }

// The seed goes into config.ts first, because config.ts is itself hashed.
await Bun.write(CONFIG, config.replace(/export const SEED = \d+;[^\n]*/, `export const SEED = ${seed}; // frozen ${new Date().toISOString().slice(0, 10)}`));
for (const [line, what, file] of rows) {
  const sha = createHash("sha256").update(new Uint8Array(await Bun.file(`${ROOT}${file}`).arrayBuffer())).digest("hex");
  prereg = prereg.replace(line, `| ${what} | \`${file}\` | \`${sha}\` |`);
  console.log(`${sha}  ${file}`);
}
await Bun.write(PREREG, prereg.replace(/Run-order seed: `[^`]*`\./, `Run-order seed: \`${seed}\`.`));
console.log(`\nSeed ${seed} written to study2/config.ts; ${rows.length} hashes written to study2/preregistration.md. Commit and push now.`);
