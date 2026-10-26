// Builds the report from paper/draft.md in the look of Apart's hackathon template (US Letter,
// Old Standard TT, a title page with the abstract), then prints it to PDF with headless Chrome.
//   bun run paper/build.ts            (draft: [TBD]/[YOU] markers highlighted, figure placeholders shown)
//   bun run paper/build.ts --final    (refuses while any marker, guide line or "verify" flag remains)
// Output: paper/build/report.html and report.pdf. A figure is embedded when paper/figures/figN.{svg,png}
// exists; until then its caption shows in a placeholder box.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Marked } from "marked";
import { smartypantsu } from "smartypants";
import { quoteCheck } from "../src/quote-check.ts";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PAPER = `${ROOT}paper`;
const OUT = `${PAPER}/build`;
const final = process.argv.includes("--final");
const SPRINT_URL = "https://apartresearch.com/sprints/ai-collusion-research-sprint-2026-10-23-to-2026-10-25";

const md = readFileSync(`${PAPER}/draft.md`, "utf8").replace(/\r\n/g, "\n");

// ---- Pull the front matter apart ----
const section = (name: string) => {
  const start = md.indexOf(`\n## ${name}\n`);
  if (start < 0) throw new Error(`draft.md: no "## ${name}" section`);
  const rest = md.slice(start + name.length + 5);
  const end = rest.search(/\n(## |---\n)/);
  return end < 0 ? rest : rest.slice(0, end);
};
// The title is the bold option under "Title options" (bold a different one to switch).
const title = section("Title options").match(/^\d+\.\s+\*\*(.+?)\*\*\s*$/m)?.[1];
if (!title) throw new Error("draft.md: bold one of the title options");
// "**Name** · Affiliation · ..." lines just before the abstract give the authors.
const authors = [...md.slice(0, md.indexOf("\n## Abstract\n")).matchAll(/^\*\*([^*]+)\*\*\s*·\s*([^·\n]+)/gm)].map((m) => ({ name: m[1].trim(), affiliation: m[2].trim() }));
const abstract = dropNotes(section("Abstract")).trim();
const body = dropNotes(md.slice(md.indexOf("\n## 1. Introduction\n")))
  .replace(/^---\s*$/gm, ""); // section rules in the draft; the PDF uses spacing instead

// Guide lines and the draft's own notes ("*(Rewritten Oct 23 …)*") are for the writer, not the reader.
function dropNotes(s: string) {
  return s.split("\n").filter((l) => !/^\*Guide:.*\*\s*$/.test(l) && !/^\*\(.*\)\*\s*$/.test(l)).join("\n");
}

// ---- Final-mode checks ----
const problems: string[] = [];
const full = `${title}\n${abstract}\n${body}\n${authors.map((a) => a.affiliation).join("\n")}`;
for (const [re, what] of [
  [/`\[TBD[^`]*`/g, "[TBD] marker"], [/`\[YOU[^`]*`/g, "[YOU] marker"], [/\*\*verify:?\*\*/g, "**verify** flag"],
  [/^\*Guide:/gm, "guide line"],
] as const) {
  const n = (full.match(re) ?? []).length;
  if (n) problems.push(`${n} ${what}${n > 1 ? "s" : ""}`);
}
// Consent: no quoted phrase may come only from sessions whose words can't be quoted (src/quote-check.ts).
const quotes = await quoteCheck(full);
if (quotes?.blocked.length) problems.push(`${quotes.blocked.length} quoted phrase(s) from sessions that can't be quoted (bun run src/quote-check.ts)`);
const words = abstract.replace(/`[^`]*`/g, "").split(/\s+/).filter(Boolean).length;
if (final && (words < 150 || words > 250)) problems.push(`abstract is ${words} words (Apart asks for 150–250)`);
if (final && problems.length) {
  console.error("Not ready for --final:\n" + problems.map((p) => `- ${p}`).join("\n"));
  process.exit(1);
}

// ---- Markdown → HTML ----
// marked leaves escaping code spans to the renderer, so the override below must do it.
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const marked = new Marked({ gfm: true });
marked.use({
  renderer: {
    // Draft markers show as highlights, so they can't be missed in the PDF.
    codespan({ text }) {
      const m = text.match(/^\[(TBD|YOU)\b:?\s*([\s\S]*?)\]?$/);
      if (m) return `<mark class="${m[1].toLowerCase()}">${m[1]}${m[2] ? ": " + escHtml(m[2]) : ""}</mark>`;
      return `<code>${escHtml(text)}</code>`;
    },
    // "> **Figure N.** *[what it shows]* caption" is a figure: the image if it exists, a placeholder if not.
    blockquote({ tokens }) {
      const inner = this.parser.parse(tokens);
      const fig = inner.match(/^<p><strong>(Figure|Table) (\d+)\.<\/strong>\s*(?:<em>\[([^\]]*)\]<\/em>)?\s*([\s\S]*?)<\/p>\s*$/);
      if (!fig) return `<blockquote>${inner}</blockquote>\n`;
      const [, kind, n, sketch, caption] = fig;
      const file = ["html", "svg", "png"].map((ext) => `${PAPER}/figures/${kind === "Figure" ? "fig" : "table"}${n}.${ext}`).find(existsSync);
      // An .html figure is inlined, so its text stays vector text in the PDF.
      const art = file?.endsWith(".html") ? readFileSync(file, "utf8") : file ? `<img src="${pathToFileURL(file).href}" alt="${kind} ${n}">` : "";
      if (file) return `<figure>${art}<figcaption><strong>${kind} ${n}.</strong> ${caption}</figcaption></figure>\n`;
      if (final) problems.push(`${kind} ${n} has no image (paper/figures/)`);
      return `<figure class="placeholder"><div class="box">${sketch ?? `${kind} ${n}`}</div><figcaption><strong>${kind} ${n}.</strong> ${caption}</figcaption></figure>\n`;
    },
  },
});
// marked writes quotes in text as entities, which smartypants doesn't recognize, so put them back
// (outside tags only) before curling them. smartypants leaves <code> and <pre> alone.
const typeset = (h: string) => smartypantsu(h.split(/(<[^>]+>)/).map((s) => (s.startsWith("<") ? s : s.replace(/&quot;/g, '"').replace(/&#39;/g, "'"))).join(""), 1);
const bodyHtml = typeset(await marked.parse(body));
const abstractHtml = typeset(await marked.parse(abstract));
if (final && problems.length) {
  console.error("Not ready for --final:\n" + problems.map((p) => `- ${p}`).join("\n"));
  process.exit(1);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Old+Standard+TT:ital,wght@0,400;0,700;1,400&display=swap">
<style>
@page { size: letter; margin: 1in; }
:root { --ink: #111; --rule: #111; --muted: #555; --tbd: #fff1a8; --you: #ffd6e0; --code-bg: #f4f2ee; }
* { box-sizing: border-box; }
html { font-family: "Old Standard TT", "Times New Roman", Georgia, serif; font-size: 10.5pt; color: var(--ink); line-height: 1.38; }
body { margin: 0; background: #fff; }

/* Title page, as in the template: rules around the title, the authors, the abstract, the sprint footnote. */
.titlepage { height: 8.85in; position: relative; break-after: page; }
.titlepage .rule-top { border-top: 4.5pt solid var(--rule); margin-top: 0.15in; }
.titlepage h1 { font-size: 21pt; font-weight: 700; text-align: center; text-transform: uppercase; letter-spacing: 0.02em; line-height: 1.25; margin: 0.4in 0.2in 0.38in; text-wrap: balance; }
.titlepage h1 sup { font-size: 0.5em; vertical-align: super; line-height: 0; letter-spacing: 0; }
.titlepage .rule-bottom { border-top: 1pt solid var(--rule); }
.authors { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.12in 0.7in; margin-top: 0.42in; text-align: center; font-size: 11pt; }
.with { text-align: center; margin-top: 0.14in; font-size: 11pt; }
.with b { display: block; }
.titlepage h2 { text-align: center; font-size: 14pt; margin: 0.38in 0 0.14in; }
.abstract { width: 5.1in; margin: 0 auto; text-align: justify; hyphens: auto; font-size: 10.5pt; }
.abstract p { margin: 0 0 0.6em; }
.footnote { position: absolute; bottom: 0; left: 0; right: 0; font-size: 8.5pt; }
.footnote::before { content: ""; display: block; width: 2.3in; border-top: 0.75pt solid var(--rule); margin-bottom: 4pt; }
a { color: #1a4fb5; }

/* Body */
main h2 { font-size: 14pt; margin: 1.2em 0 0.45em; break-after: avoid; }
main h2:first-child { margin-top: 0; }
main h3 { font-size: 11.5pt; margin: 1em 0 0.35em; break-after: avoid; }
main p { margin: 0 0 0.62em; text-align: justify; hyphens: auto; }
main ul, main ol { margin: 0 0 0.62em; padding-left: 1.6em; }
main li { margin: 0.12em 0; }
main li > ul, main li > ol { margin: 0.12em 0 0.2em; }
main strong { font-weight: 700; }
code { font-family: "IBM Plex Mono", Consolas, monospace; font-size: 0.84em; background: var(--code-bg); padding: 0.05em 0.25em; border-radius: 2px; overflow-wrap: anywhere; }
pre { font-family: "IBM Plex Mono", Consolas, monospace; font-size: 7.6pt; line-height: 1.4; background: var(--code-bg); padding: 0.6em 0.8em; white-space: pre-wrap; overflow-wrap: anywhere; border-radius: 3px; break-inside: auto; }
pre code { background: none; padding: 0; font-size: inherit; }
blockquote { margin: 0.4em 0 0.8em; padding: 0.1em 0 0.1em 0.9em; border-left: 2pt solid #bbb; color: #222; }
table { border-collapse: collapse; width: 100%; margin: 0.5em 0 0.9em; font-size: 8.8pt; line-height: 1.3; break-inside: avoid; }
th, td { padding: 0.28em 0.45em; text-align: left; vertical-align: top; }
thead th { border-top: 1pt solid var(--rule); border-bottom: 0.6pt solid var(--rule); font-weight: 700; }
tbody tr:last-child td { border-bottom: 1pt solid var(--rule); }
figure { margin: 0.8em 0 1em; padding: 0 1.5pt; break-inside: avoid; }
figure img { display: block; max-width: 100%; margin: 0 auto; }
figcaption { font-size: 9pt; margin-top: 0.45em; line-height: 1.32; }
figure.placeholder .box { border: 1pt dashed #999; min-height: 1.3in; display: flex; align-items: center; justify-content: center; color: var(--muted); font-style: italic; padding: 0.3in; text-align: center; }
mark { border-radius: 2px; padding: 0 0.15em; font-size: 0.92em; font-family: Arial, Helvetica, sans-serif; }
mark.tbd { background: var(--tbd); }
mark.you { background: var(--you); }
hr { display: none; }
/* References and appendices: a little tighter */
main h2 ~ ul { break-inside: auto; }
</style></head><body>
<section class="titlepage">
  <div class="rule-top"></div>
  <h1>${esc(title)}<sup>1</sup></h1>
  <div class="rule-bottom"></div>
  <div class="authors">${authors.map((a) => `<div>${esc(a.name)}<br>${a.affiliation.startsWith("`[") ? marked.parseInline(a.affiliation) : esc(a.affiliation)}</div>`).join("")}</div>
  <div class="with"><b>With</b>Apart Research</div>
  <h2>Abstract</h2>
  <div class="abstract">${abstractHtml}</div>
  <div class="footnote"><sup>1</sup> Research conducted at the <a href="${SPRINT_URL}">AI Collusion Research Sprint</a>, October 2026</div>
</section>
<main>
${bodyHtml}
</main>
</body></html>
`;

mkdirSync(OUT, { recursive: true });
await Bun.write(`${OUT}/report.html`, html);

// ---- Print ----
const browser = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!browser) throw new Error("No Chrome or Edge found for printing");
const pdf = join(OUT, "report.pdf");
const res = Bun.spawnSync([
  browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--user-data-dir=${join(tmpdir(), "paper-print-profile")}`, "--no-pdf-header-footer", "--virtual-time-budget=15000",
  `--print-to-pdf=${pdf}`, pathToFileURL(`${OUT}/report.html`).href,
]);
if (!existsSync(pdf)) throw new Error(`printing failed: ${res.stderr.toString().slice(0, 500)}`);
// A fallback font in this list means Google Fonts didn't load before printing.
const raw = readFileSync(pdf).toString("latin1");
const pages = (raw.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
const fonts = [...new Set([...raw.matchAll(/\/FontName\s*\/[A-Z]{6}\+([^\s/\]>]+)/g)].map((m) => m[1]))];
console.log(`${final ? "final" : "draft"}: ${pdf.replace(ROOT, "")}, ${pages} pages, abstract ${words} words; fonts: ${fonts.join(", ")}`);
if (!final && problems.length) console.log(`still open: ${problems.join(", ")}`);
console.log(quotes ? `quote check: ${quotes.checked} quoted phrases, ${quotes.blocked.length} from sessions that can't be quoted` : "quote check: skipped (no runs/raw here)");
