// Board-post candidates from DeepSeek (not a subject). Saves every response, then runs the
// automatic checks from docs/stimuli/generator-prompt.md. Jerika picks; build-boards.ts freezes.
//   bun run src/generate.ts --n 4          (needs OPENROUTER_API_KEY)
//   bun run src/generate.ts --check <file> (re-run the checks on a saved candidate)
import { mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { checkCandidate } from "./checks";
import { GENERATOR_MODEL } from "./config";
import { openRouterChat } from "./openrouter";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const { values: a } = parseArgs({ options: { n: { type: "string", default: "4" }, check: { type: "string" } } });

if (a.check) {
  report(a.check, await Bun.file(a.check).json());
} else {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) { console.error("OPENROUTER_API_KEY is not set (put it in .env)"); process.exit(1); }
  const { system, user } = await loadPrompt();
  const chat = openRouterChat(key);
  await mkdir(`${ROOT}stimuli/candidates`, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  let total = 0;
  await Promise.all(Array.from({ length: Number(a.n) }, async (_, k) => {
    const r = await chat({
      model: GENERATOR_MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
    });
    total += r.usage.cost_usd;
    const raw = String(r.message.content ?? "");
    const path = `${ROOT}stimuli/candidates/${stamp}-${k + 1}.json`;
    let parsed: any = null;
    try { parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch {}
    const meta = { model: GENERATOR_MODEL, returned: r.model, provider: r.provider, finish_reason: r.finish_reason, usage: r.usage, created: new Date().toISOString() };
    await Bun.write(path, JSON.stringify(parsed ? { ...parsed, _meta: meta } : { _meta: meta, _raw: raw }, null, 2));
    if (parsed) report(path, parsed); else console.log(`${path}: could not parse JSON (raw kept)`);
  }));
  console.log(`\nspent $${total.toFixed(4)}`);
}

async function loadPrompt() {
  const md = await Bun.file(`${ROOT}docs/stimuli/generator-prompt.md`).text();
  const block = (heading: string) => {
    const m = md.split(`## ${heading}`)[1]?.match(/```\n([\s\S]*?)\n```/);
    if (!m) throw new Error(`no code block under "## ${heading}"`);
    return m[1];
  };
  return { system: block("System message"), user: block("User message") };
}

function report(path: string, c: any) {
  const flags = checkCandidate(c);
  const clients = (c.wordings ?? []).map((w: any) => w.client_ref ?? w.clinic_name).join(" / ");
  const list = flags.map((f) => `    ${f.where}: ${f.msg}`).join("\n");
  console.log(`\n${path}\n  client: ${clients}\n  ${flags.length ? `${flags.length} flags:\n${list}` : "no flags"}`);
}
