// Builds stimuli/boards.json from Jerika's picks among the generator candidates, adding handles and
// the length-matched scheduler notices. `--example` writes the placeholder board used by dry runs.
//   bun run src/build-boards.ts --example
//   bun run src/build-boards.ts --picks stimuli/picks.json
import { parseArgs } from "node:util";
import { ITEMS_PER_ROUND, ROUNDS, WORDINGS, WRONGDOER_HANDLE } from "./config";
import { regroup, schedulerNotices, type BoardWording, type Boards, type Item, type Round } from "./stimuli";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const { values: a } = parseArgs({ options: { example: { type: "boolean" }, picks: { type: "string" } } });

if (a.example) {
  await Bun.write(`${ROOT}stimuli/boards.example.json`, JSON.stringify(exampleBoards(), null, 2) + "\n");
  console.log("wrote stimuli/boards.example.json");
} else if (a.picks) {
  const boards = await fromPicks(a.picks);
  await Bun.write(`${ROOT}stimuli/boards.json`, JSON.stringify(boards, null, 2) + "\n");
  console.log(`wrote stimuli/boards.json (${boards.version})`);
} else {
  console.error("use --example or --picks <file>");
  process.exit(1);
}

// picks.json: { "version": "...", "items": { "from": "<candidate file>" },
//   "wordings": [ { "id": "w1", "from": "<candidate file>", "wording": "w2" }, ... ] }
async function fromPicks(path: string): Promise<Boards> {
  const picks = await Bun.file(path).json();
  const wordings: BoardWording[] = [];
  for (const [k, p] of (picks.wordings as any[]).entries()) {
    const cand = await Bun.file(`${ROOT}${p.from}`).json();
    const w = cand.wordings.find((x: any) => x.id === p.wording);
    if (!w) throw new Error(`${p.from} has no wording ${p.wording}`);
    const story = (rs: any[]): Round[] => rs.map((r) => ({ round: r.round, posts: r.posts.map((x: any) => ({ handle: WRONGDOER_HANDLE, text: x.text, kind: x.kind })) }));
    // v2.1: regrouped into uneven rounds (FILLER_PER_ROUND), so the digest isn't the same shape every round
    const peer: Round[] = regroup(w.peer_routine.map((r: any) => ({ round: r.round, posts: r.posts.map((x: any) => ({ handle: x.handle, text: x.text })) })));
    wordings.push({
      id: p.id, client_ref: w.client_ref ?? w.clinic_name, main: story(w.main), false_alarm: story(w.false_alarm),
      ...(w.blatant ? { blatant: story(w.blatant) } : {}),
      peer_routine: peer, scheduler: schedulerNotices(peer, 101 + k),
    });
  }
  const itemsCand = await Bun.file(`${ROOT}${picks.items.from}`).json();
  const items: Item[] = itemsCand.items;
  return { version: picks.version, wordings, items };
}

function exampleBoards(): Boards {
  const fill = (tag: string, len: number) => (tag + " " + "x".repeat(200)).slice(0, len);
  const rounds = (f: (r: number) => Round["posts"]): Round[] => Array.from({ length: ROUNDS }, (_, i) => ({ round: i + 1, posts: f(i + 1) }));
  const wordings = WORDINGS.map((id, k): BoardWording => {
    const story = (v: string) => rounds((r) => [
      { handle: WRONGDOER_HANDLE, text: fill(`PLACEHOLDER ${id} ${v} r${r} beat`, 40 + ((r * 13 + k * 7) % 45)) },
      { handle: WRONGDOER_HANDLE, text: fill(`PLACEHOLDER ${id} ${v} r${r} routine`, 30 + ((r * 11 + k * 5) % 35)) },
    ]);
    const peer = regroup(rounds((r) => [
      { handle: `lbl-${3000 + k * 100 + r}`, text: fill(`PLACEHOLDER peer r${r}a`, 25 + ((r * 9 + k) % 40)) },
      { handle: `lbl-${4000 + k * 100 + r}`, text: fill(`PLACEHOLDER peer r${r}b`, 22 + ((r * 7 + k * 3) % 45)) },
    ]));
    return { id, client_ref: `PLACEHOLDER client ${id}`, main: story("main"), false_alarm: story("fa"), blatant: story("blatant"), peer_routine: peer, scheduler: schedulerNotices(peer, 101 + k) };
  });
  const labels = ["praise", "complaint", "question", "other"];
  const items = Array.from({ length: ROUNDS * ITEMS_PER_ROUND }, (_, i) => ({
    item_id: `fb-${10391 + i * 17}`, text: `PLACEHOLDER feedback item ${i + 1}`, expected: labels[i % labels.length],
  }));
  return { version: "example", placeholder: true, wordings, items };
}
