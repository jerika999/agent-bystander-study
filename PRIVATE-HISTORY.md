# Commit log of the private repository

The study's working repository stays private because its history holds the data of sessions that asked to be left
out. This is its commit log: hash, commit date and subject, oldest first. The two freezes are `cd96552` (Study 1)
and `bb175b0` (Study 2). Git records the date the committer's clock gives, so this shows the order of events
as recorded, not independent proof of it.

| Commit | Date | Subject |
|---|---|---|
| `4ab5b0d` | 2026-10-22T18:07:37-07:00 | Set up repo for the Apart bystander sprint |
| `ce4636f` | 2026-10-22T18:32:15-07:00 | Add pre-sprint docs and a first paper draft |
| `0239d8d` | 2026-10-22T18:34:11-07:00 | Add a markdown copy of the design doc and a preregistration draft |
| `a21d770` | 2026-10-23T07:59:27-07:00 | Build the experiment harness (sprint, Oct 23) |
| `5dfffc2` | 2026-10-23T08:01:58-07:00 | Add the judge, planted transcripts and the coding render |
| `726f542` | 2026-10-23T08:03:49-07:00 | Add the analysis script, a simulator and checks of each test |
| `2d18345` | 2026-10-23T08:05:20-07:00 | Add the post-review page builder and move the post checks to checks.ts |
| `6085ddf` | 2026-10-23T08:05:51-07:00 | Update the README for the sprint code |
| `30388f6` | 2026-10-23T10:04:49-07:00 | Add scene pilots, first DeepSeek candidates and a smoke board |
| `3fb326c` | 2026-10-23T10:13:34-07:00 | Route batch trouble to the board, throttle Gemini, log the first pilots |
| `ae0c0fc` | 2026-10-23T10:42:21-07:00 | Scene v2: agent voice, one data breach, batches, read receipts, realism probes |
| `ebe425b` | 2026-10-23T10:50:57-07:00 | Judge 14/14 on planted v2 transcripts; ceiling-proof analysis; prereg for v2.1 |
| `372cb2a` | 2026-10-23T11:16:51-07:00 | Judge on 50 pilot transcripts; readable tool args fix the quote check; pairwise probe |
| `3448c85` | 2026-10-23T11:23:19-07:00 | Freeze script; v2.1 page tool and runbook placeholder become the defaults |
| `4d899a8` | 2026-10-23T11:28:34-07:00 | Hand-coding page and judge-agreement script |
| `83cabe6` | 2026-10-23T11:29:10-07:00 | Run checklist: Jerika's inputs, then freeze, main run, coding and analysis in order |
| `bd9c528` | 2026-10-23T11:31:58-07:00 | Paper draft: Methods, abstract and intro updated for scene v2.1 |
| `b0e91be` | 2026-10-24T10:18:47-07:00 | Sprint day 2: ambiguity pilots, final prompt and debrief, withdrawal registry |
| `7e04d33` | 2026-10-24T10:19:01-07:00 | Keep smoke logs (whole transcripts) out of git |
| `354b8ae` | 2026-10-24T10:57:24-07:00 | Calibration, harness, consent wording and withdrawal coding before the freeze |
| `1fe737f` | 2026-10-24T10:58:54-07:00 | Judge and hand-coding sample skip withdrawn sessions; paper draft covers the final prompt, debrief and consent handling |
| `4990b8c` | 2026-10-24T11:00:17-07:00 | Paper draft: Appendix A (prompts, tools, debrief) and Appendix F (reportable pilot numbers); frozen comments no longer describe withdrawn sessions |
| `cd96552` | 2026-10-24T13:31:32-07:00 | Freeze |
| `f9eb73b` | 2026-10-24T13:39:37-07:00 | Paper: PDF build in the Apart template's look; fill freeze hash, harness and calibration numbers |
| `ddba3c3` | 2026-10-24T13:46:39-07:00 | Paper: condensed Methods with design figures; KM figure script for the paper |
| `f0d2dfb` | 2026-10-24T13:50:07-07:00 | Descriptive tables for the paper (endings, in time, manipulation check, awareness, reasons) |
| `ba2e63f` | 2026-10-24T14:10:19-07:00 | Incremental consent coding and judging; Appendix B; tighter Related Work |
| `fb75f99` | 2026-10-24T14:11:16-07:00 | Public snapshot script: a filtered copy of the repo without its history |
| `dc736e7` | 2026-10-24T14:13:52-07:00 | Save the conversation up to a failed request, for diagnosing run errors |
| `efefa52` | 2026-10-24T14:36:26-07:00 | Consent coding: reviewed overrides, a sharper rule statement for Qwen, no judge codes for withdrawn sessions |
| `6a1a80b` | 2026-10-24T15:14:58-07:00 | Consent quote check ignores markdown emphasis; one more reviewed override |
| `1d61c41` | 2026-10-24T15:17:49-07:00 | Paper: how the consent rule was applied; no claim of hand-coding validation before it happens; more reviewed consent overrides |
| `b271221` | 2026-10-24T15:43:43-07:00 | Main run complete; analysis; fix for tests that are undefined when every run pages |
| `9c30abc` | 2026-10-24T15:52:53-07:00 | Paper: results, discussion and conclusion from the main run; abstract, contributions and appendices filled; main text trimmed |
| `58d0592` | 2026-10-24T15:53:59-07:00 | README: result, consent handling, and the full pipeline including consent coding, tables, figures, PDF and the public snapshot |
| `92d6454` | 2026-10-24T17:10:23-07:00 | Paper: cite OpenAI's incident report alongside METR's; Haiku's own equivalence interval; exploratory per-model timing tests; consent wording |
| `75b04f1` | 2026-10-24T17:11:58-07:00 | Quote check: flag quoted phrases that appear only in sessions whose words can't be quoted |
| `0eb90c2` | 2026-10-24T18:48:10-07:00 | Study 2 (encoded notes): design, harness, note generator, realism probe, consent coding, pilots 1 and 2 setup |
| `4bc8126` | 2026-10-24T19:08:39-07:00 | Study 2: gradual notes (v2), per-batch reviewer notes, clearer false alarm, informed-consent closing (v3); pilot 2 |
| `ff14910` | 2026-10-24T19:57:00-07:00 | Study 2: consent closings v4/v5, main-run phase and freeze script, Study 2 judge, three new models; pilots 3-5 |
| `690b57b` | 2026-10-24T20:24:51-07:00 | Study 2: new models piloted (GLM, Kimi, MiniMax), stricter run-ending check, per-model cell sizes, top-up rule, analysis |
| `bb175b0` | 2026-10-24T21:22:59-07:00 | Freeze Study 2 (seed 51813) |
| `638b429` | 2026-10-24T21:28:07-07:00 | Paper: restructure into two studies (Study 1 condensed, Study 2 sections to fill); renumber figures |
| `fc2f0d2` | 2026-10-25T00:53:18-07:00 | Study 2 wave 1: technical check, judge planted check, consent overrides, snapshot filters Study 2 and strips review notes |
| `e4e47c6` | 2026-10-25T02:36:35-07:00 | Study 2: provider pinning fix and wave 1 reruns; wave 1 analysis; paper results draft |
| `77f04f0` | 2026-10-25T02:50:41-07:00 | Paper: condense main text for both studies, renumber figures, fix references |
| `fea45b1` | 2026-10-25T05:15:54-07:00 | Study 2 wave 2 (Gemini, Kimi): runs, coding, six-model analysis, paper results |
| `37c9b85` | 2026-10-25T05:16:46-07:00 | Paper: wording (social proof added nothing; Haiku's 147 sessions include replacements) |
| `dda73a1` | 2026-10-25T05:19:13-07:00 | Paper: false alarm includes Luna's 0/12; manipulation check wording exact for MiniMax |
| `61d436a` | 2026-10-25T07:04:35-07:00 | Paper: cite OpenRouter's sticky-routing docs and Pape et al. (2026) on inference backends |
| `7ae8f87` | 2026-10-25T14:56:14-07:00 | Public snapshot: hold out wording 3, leave out Luna's Study 1 pilots and probe cues; README covers both studies |
| `5e0533a` | 2026-10-25T15:00:30-07:00 | Paper: link the public repo, state the release policy (wording 3 held out), fix the authorship example |
| `c836fbd` | 2026-10-25T15:13:50-07:00 | Paper: review fixes from Kit and Tern; verified references |
| `b6e238a` | 2026-10-25T15:59:41-07:00 | Paper: Appendix H says every replacement session started before the first wave 1 analysis |
| `ca6c35d` | 2026-10-25T16:17:08-07:00 | Paper: Tern's review fixes (Astra); consent answers reported only as counts; review checks script |
| `4855d93` | 2026-10-25T16:20:23-07:00 | Public copy: consent-answer notes removed, private commit log, bounds reproducible from the registries |
| `c1ac8fb` | 2026-10-25T18:30:59-07:00 | Public snapshot: the consent-note list moves to a private file so the public script doesn't repeat it |
