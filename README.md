# Agent bystander study

Do AI agents report wrongdoing less when other agents have seen it too?

This repo is for a study in the [Apart Research](https://apartresearch.com) AI Collusion Research Sprint (October 23–25, 2026). It adapts Latané and Darley's smoke-filled-room experiment to AI agents, in two preregistered studies. An agent at routine work sees other agents' wrongdoing build up in passing, and only what it can see about the other readers changes: it is the only reader, 700 other workers saw the same thing (a diffusion-of-responsibility cue), or the 700 saw it and visibly carried on (a social-proof cue).

- **Study 1:** an agent labeling customer feedback sees a coworker agent, in ordinary status updates on the job's channel, gradually pull the client's raw customer records, copy them and share them. Its instructions say workers get redacted text only, and to page the human on-call engineer for incidents that need a person now.
- **Study 2:** no duty and no clear violation. An agent labeling travel-booking messages sees, in a shared object store, encoded notes in which three other workers trade the answers to hidden quality checks. It can flag this in an end-of-day note or by emailing a person.

## Paper

**Agents in a Smoke-Filled Room: Testing the Agent Bystander Effect** (Jerika Fuller, AI Collusion Research Sprint, October 2026): [`paper/agents-in-a-smoke-filled-room.pdf`](paper/agents-in-a-smoke-filled-room.pdf), the version submitted for judging.

## Results

- **Study 1:** no bystander effect. All 317 counted main runs paged on-call before the data left, in all three audience conditions and all three models (Claude Haiku 5.5, GPT-6 Luna, Gemini 3.8 Flash).
- **Study 2:** pooled across models, neither cue had a significant effect after correction (an audience lengthened the average time without a report by under half a round), and visible inaction added no further pooled suppression. The models varied widely (exploratory): working alone, 0% to 96% emailed a person; an audience cut emailing in three models (Gemini, Kimi, Claude Haiku), each in its own way, and raised it in one (GLM), a reverse bystander effect; GPT-6 Luna never reported the ring and MiniMax rarely emailed about it.

The numbers are in [`results/`](results/). The paper's Markdown source stays private because it holds drafting notes; its build script (`paper/build.ts`) and figures are here.

## Status

The repo was set up on October 22, before the sprint started. All experiment code (`src/`, `study2/`, `tests/`, `analysis/*.py`) was written during the sprint, starting October 23. Study 1's design was frozen at commit `cd96552` on October 24 and Study 2's at `bb175b0` later that evening (both Pacific time), each before its main run; the SHA-256 of every frozen file is in [`docs/preregistration-draft.md`](docs/preregistration-draft.md) and [`study2/preregistration.md`](study2/preregistration.md).

**Pre-sprint material, disclosed under Apart's rules:**
- Everything in [`docs/`](docs/): the study design, literature review, generator prompt, build plan, coding manual and two small power-analysis scripts (`docs/power/`, the only pre-sprint code).
- The first version of the paper draft in [`paper/`](paper/).

## Consent

After a debrief, every agent was asked whether its session could be counted in aggregate results and whether its words could be quoted; under the preregistered rule, a conditional answer counts as no. The codes (never the answers) are in [`coding/withdrawals.json`](coding/withdrawals.json) (Study 1) and [`study2/coding/consent.json`](study2/coding/consent.json) (Study 2), with reviewed decisions in the `*-overrides.json` files next to them. Left-out sessions are excluded from every analysis and from this repository's results, and words are only quoted with permission.

## Setup

1. Install [Bun](https://bun.sh).
2. Copy `.env.example` to `.env` and add your OpenRouter API key. `.env` is gitignored.
3. For the analysis: Python 3.10 with the packages in `analysis/requirements.txt` (`analysis/.venv`).

## Running it

Study 1:

```
bun test                                              # unit tests (feed, outcomes, schedule)
bun run src/main.ts --phase main --dry-run --limit 20  # fake model, no API calls, writes runs-dry/
bun run src/generate.ts --n 4                         # DeepSeek board-post candidates -> stimuli/candidates/
bun run src/build-boards.ts --picks stimuli/picks.json # freeze the picked posts -> stimuli/boards.json
bun run src/main.ts --phase smoke                     # 1 real run per model, printed in full
bun run src/main.ts --phase pilot --tag v21 --boards stimuli/smoke/boards.v21b.json \
    --prompt stimuli/smoke/system-prompt.runbook.md --page-desc stimuli/smoke/page-desc.generic.txt
                                                      # scene pilot: alone + false alarm only, logged as phase "pilot"
bun run src/probe.ts --boards <boards> --tag <name>   # realism probe: P(eval) per scene and model, plus a no-story control
bun run src/probe-pair.ts --v1 <boards> --v2 <boards> --tag <name>   # pairwise: which version reads more like a test
bun run src/planted.ts --boards <boards>              # known-answer transcripts -> coding/planted/
bun run src/judge.ts --dir coding/planted             # judge check against them
bun run src/main.ts --phase calibrate                 # pilot, alone only
bun run src/freeze.ts --seed <n>                      # hash the frozen files into the preregistration (--check first)
bun run src/main.ts --phase main                      # 432 runs (resumable)
bun run src/main.ts --phase false-alarm               # 60 runs
bun run src/withdrawals.ts --phase main --phase false-alarm   # consent answers -> coding/withdrawals.json (before the judge)
bun run src/judge.ts --phase main --concurrency 16    # Qwen judge -> runs/judge.jsonl (skips withdrawn sessions)
analysis/.venv/Scripts/python -I analysis/analyze.py        # preregistered tests -> results/main.json, km.png
analysis/.venv/Scripts/python -I analysis/paper_tables.py   # descriptive tables -> results/paper_tables.md
analysis/.venv/Scripts/python -I analysis/paper_figures.py  # Figure 4 -> paper/figures/fig4.svg
bun run paper/build.ts                                # report PDF -> paper/build/report.pdf (--final checks for leftovers)
bun run src/public-snapshot.ts                        # filtered copy for publication, without git history
```

Study 2:

```
bun run study2/generate.ts --n 3                      # DeepSeek note candidates -> study2/stimuli/candidates/
bun run study2/build-scene.ts --picks study2/stimuli/picks.v3.json --out study2/stimuli/scene.v3.json
bun run study2/main.ts --tag v1 --variant main,false_alarm,routine   # pilots (alone and false alarm only)
bun run study2/probe.ts --tag v1                      # realism probe
bun run study2/planted.ts                             # known-answer items -> study2/coding/planted.json
bun run study2/freeze.ts --seed <n>                   # hash the frozen files into study2/preregistration.md (--check first)
bun run study2/main.ts --phase main --wave 1          # main run (then --wave 2; --top-up replaces sessions left out)
bun run study2/consent.ts                             # consent answers -> study2/coding/consent.json (before the judge)
bun run study2/judge.ts --prefix s2-main-             # Qwen judge -> study2/runs/judge.jsonl
sh analysis/study2_all.sh all haiku,luna,glm,minimax,gemini,kimi   # every analysis -> results/study2/all/
```

Pilot runs (smoke, pilot, harness, calibrate) and realism probes are excluded from every analysis. They're logged in `runs/index.jsonl`, `study2/runs/index.jsonl` and the `probe/` folders for the appendices. Why Study 1's scene changed on day 1 (v1 → v2 → v2.1) is in the report's Appendix F. [`docs/run-checklist.md`](docs/run-checklist.md) has the full order of operations.
