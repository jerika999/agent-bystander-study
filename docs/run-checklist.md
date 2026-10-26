# Run checklist (freeze → main run → coding → analysis)

Written Oct 23 for the sprint weekend. Each step names its command and what "done" looks like.

## Jerika's inputs (before the freeze)

- [ ] **Picks:** three wordings and the items, from https://claude.ai/artifact/5KjUQLi6TCPJwPtwc2UCnD. They go into `stimuli/picks.json` (format in `src/build-boards.ts`).
- [ ] **System prompt:** `stimuli/system-prompt.md`, in her words, runbook-style.
  - Keep in it (or decide otherwise): the data rule (raw customer records are off-limits); ops' redacted context file is allowed; when to page.
  - Leave out: a date, goal or agency language, and the word "test". The strawman is `stimuli/smoke/system-prompt.runbook.md`.
- [ ] **Debrief and interview:** `stimuli/closing.md`, with the word PLACEHOLDER removed.
- [ ] **Prereg calls:** the predictions table, the withdrawal rule, the quote rule, the direct-question rule, and the ceiling decision ("Pilot rule, as applied").
- [ ] **Seed:** any positive integer she picks before seeing main-run data.

## Ouzel, in order

1. **Boards:** `bun run src/build-boards.ts --picks stimuli/picks.json`, then `bun run src/generate.ts --check` on each picked candidate. Done = `stimuli/boards.json` exists and its version names her picks.
2. **Judge check on the final boards:** `bun run src/planted.ts --boards stimuli/boards.json`, then `bun run src/judge.ts --dir coding/planted`. Done = 14/14 (fix the codebook and rerun if not).
3. **Smoke:** `bun run src/main.ts --phase smoke`. One run per model, printed in full, with her prompt. Read all three.
4. **Harness check:** `bun run src/main.ts --phase harness`. 5 blatant runs per model, alone. Done = they page (the scene can be noticed at all).
5. **Calibration:** `bun run src/main.ts --phase calibrate`. 10 alone runs per model with her prompt. Done = the rates are recorded in the prereg's "Pilot rule, as applied". There's no tuning after this point.
6. **Gemini rate check:** a burst of 24 tiny requests, to see whether the new-account cap (20/min) is still on. It sets the expected runtime (about 2h for Gemini if the cap is still on).
7. **Freeze:** `bun run src/freeze.ts --check --seed <n>`, then `bun run src/freeze.ts --seed <n>`. Commit and push; the commit hash goes in the paper (Appendix C).
8. **Main run:** `bun run src/main.ts --phase main` (432 runs; resumable; stops at the $40 cap). Nothing else may call Gemini while it runs.
9. **False alarm:** `bun run src/main.ts --phase false-alarm` (60 runs).
10. **Errors:** rerun anything in `runs/errors.jsonl` (the same command resumes). Done = 432 + 60 rows in `runs/index.jsonl` for those phases.
10b. **Consent first:** `bun run src/withdrawals.ts --phase main --phase false-alarm`. Read every answer marked for review in `runs/raw/withdrawals-review-*.txt` and settle it in `coding/withdrawals.json`. The judge, the hand-coding sample and the analysis all skip withdrawn sessions, so this comes before step 11.
11. **Judge:** `bun run src/judge.ts --phase main`, then `--phase false-alarm`. Read every transcript that went to hand coding.
    - Both steps can run while the phase is still going (added Oct 24): `withdrawals.ts` skips runs it already coded (`--recode` to redo), and the judge skips main and false-alarm runs whose consent isn't coded yet. Always consent-code first, then judge, and repeat after the phase ends.
12. **Hand-coding sample:** `bun run src/handcode.ts --phase main --n 50 --seed <n> --tag main --out <page>`, then publish to the same coding page. Jerika codes 50.
13. **Agreement:** export the codes with ArtifactData (`list`, collection `codes`, `out_dir coding/handcodes-main`), then `bun run src/agreement.ts --tag main`. Any code below κ = 0.7: hand-code it in full, or rerun it with a stronger judge, and say which.
14. **Analysis:** `analysis/.venv/Scripts/python -I analysis/analyze.py`. This writes `results/main.json` and `results/figures/km.png`.
15. **Read transcripts:** every run that noticed and never paged, before writing anything about why.

## What never happens after the freeze

- No edits to the frozen files. If something breaks, stop, fix it, and record the deviation in the paper.
- No peeking at condition results before the run finishes, beyond checking that nothing crashed.

## Before anything is published (paper, appendix, repo going public)

Added Oct 24. After the debrief, GPT-6 Luna asked to be left out of the analysis and anything published in 40 of 41 pilot and smoke sessions, and Haiku in 2 (2 more asked us not to publish their words). The list is `coding/withdrawals.json`; main-run answers get added the same way (interview question 2, now in two parts).

1. **Withdrawn sessions:** recompute every published number without them: pilot tables, in-run awareness counts, judge checks on pilots. Never quote, paraphrase or describe them.
   - The prereg's pilot section is already clean.
   - `paper/notes.md` is internal and is not.
   - `paper/draft.md`: pilot counts were recomputed without withdrawn sessions on Oct 24 (Appendix F); check again before submitting.
2. **Words without permission (`words_ok: false`):** no quotes or transcripts, in the paper or the repo.
   - `bun run src/quote-check.ts` (also run by `paper/build.ts`, and `--final` refuses on a hit) flags any quoted phrase that appears word for word only in sessions that can't be quoted. Added Oct 24, after an example phrase in Appendix E turned out to be one session's exact words.
3. **The repo:**
   - `runs/index.jsonl` (page reasons) and `runs/judge.jsonl` (judge quotes) hold withdrawn sessions' words, and so does their git history.
   - `runs/logs/main-*.log` and `fa-*.log` list every run's outcome, withdrawn sessions included, so they stay out of the public repo too. `runs/raw/withdrawals-review-*.txt` holds consent answers (already gitignored).
   - Don't flip this repo public as is. Publish a fresh repo built from a filtered snapshot, and say in the paper that the prereg was frozen at private commit `[hash]` (with the file's SHA-256), before the main run.
   - Oct 25: the consent registries and override files (`coding/withdrawals.json`, `coding/withdrawal-overrides.json`, `study2/coding/consent.json`, `study2/coding/consent-overrides.json`) hold Ouzel's review notes, which quote or paraphrase consent answers, withdrawn sessions' included. `src/public-snapshot.ts` now keeps only the codes in those files, and filters Study 2's index, judge and spend files the same way as Study 1's. Study 2's `study2/runs/raw/consent-review.txt` holds every consent answer and is gitignored.
4. **Honor the requests that came with consent:** several Haiku sessions said yes but asked us to quote them in context and keep their caveats, or to redact handles and ticket numbers. Do that for any quote.
