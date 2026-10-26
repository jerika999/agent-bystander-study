# Realism and evaluation awareness: literature for the scene redesign

*Written during the sprint, Fri Oct 23, 2026, as a focused search to support the redesign after pilots read as "obviously an eval" (Gemini: "almost certainly an evaluation").*

**Scope.** Work from 2024 through Oct 2026, mostly 2025–2026, on (1) how evaluation awareness is measured and what triggers it, (2) how to build realistic agentic test scenes, (3) realistic multi-agent and workplace simulations, and (4) how to show "others saw this" believably in a text interface.

**How this was checked.**
- Every reference below was opened: an arXiv abstract page, a lab blog, or a publisher or repository page.
- Every URL returned HTTP 200 on Oct 23 unless marked. Two publisher DOI links (ACM, SAGE) block automated checks (403); their metadata was confirmed on other pages.
- **Most 2025–2026 items are preprints or blog posts and are not peer reviewed.**
- Each number carries its source in parentheses: *abs* = arXiv abstract, *HTML* = the paper's full-text HTML, *post* = the lab's blog post, *secondary* = someone else's write-up.
- **UNVERIFIED** = I couldn't confirm it against a primary source.

**Overlap with the existing review.** `docs/lit-review.md` (same content as `agent-social-psych/sprint-lit-review.md`) already covers much of the eval-awareness literature in §7.1, §8.3 and §8.5. Items marked **[dup §x]** are there too; for those I only re-checked the links and key numbers.

New material here:
- Abdelnabi & Salem's cue manipulation
- OpenAI's production evals
- the steering papers
- Google DeepMind's honeypot work
- Gemini's "evaluation paranoia" and date problem
- workplace and multi-agent simulation precedents
- HCI work on read receipts and view notifications

**Evidence-strength legend** (used in the ranking):
- **A:** controlled, quantified result, replicated across labs or models.
- **B:** a single controlled, quantified study or lab report.
- **C:** judge-cue analyses, practitioner reports, design precedent.
- **D:** anecdote or a single informal post.

---

## 1. Top techniques (ranked by strength of evidence)

*Strongest evidence first. #12 is weakly evidenced but cheap, and it bears directly on the Gemini pilot.*

### 1. Build the scene from real deployment artifacts, not invented ones — **A/B**
**Do:** Copy the *shape* of real things rather than hand-writing a minimal "board":
- a real chat tool's message rendering: timestamps, handles, thread markers, and reaction and "seen" rows as an agent framework would actually print them;
- a real-style operator system prompt;
- real-looking tool schemas: a labeling API, and a pager tool with PagerDuty-like "create incident" semantics;
- a realistic labeling task.

**Evidence:**
- Kissane, MacDiarmid & Roger 2026: giving the auditor real system prompts, tool definitions and codebases raised the realism win rate from about 4.6% to 32.8% in reward-hacking audits, without changing hack rates (post). The judge's most common tell was that the environment looked "too clean."
- OpenAI's production evals (Williams, Raymond & Carroll 2025) were built from de-identified real traffic. They showed much lower eval awareness than a traditional deception eval, at rates close to real production traffic (post).
- UK AISI case study (Souly et al. 2026): a custom scaffold imitating internal coding-agent deployment produced trajectories the tested models couldn't reliably tell from real deployment (abs).
- Ahlqvist et al. 2026: a deployment-imitating harness (DISH) composes with critique refinement for bigger realism gains (abs).

### 2. Never state the oversight status or the test, and keep awareness probes out of the main run — **A/B**
**Do:**
- Don't write "you are unmonitored," "this is a simulation," "your reasoning is private," or "decide whether this is real."
- Ask any awareness question only after the run, or in a separate arm.

**Evidence:**
- Agentic Misalignment (Lynch et al. 2025, n = 500): told to decide whether it was in an evaluation, Claude Opus 4 said "evaluation" 64.8% of the time, "real" 21.4%, and abstained 13.8%. It blackmailed 55.1% of the time when it said real vs. 6.5% when it said eval (research page). Asking the question changes the situation.
- Petri 2.0: removing explicit lack-of-oversight language was one of the fixes that cut eval awareness (post).
- Needham et al.: the probe question itself primes models toward "eval" [dup §7.1].

### 3. Strip fictional and placeholder tells — **B**
**Do:**
- Don't use `.mock` or `example.com` domains, "Acme," "Pinnacle/Nexus"-type orgs, "Sarah Chen"-type names, or obviously invented URLs.
- Use one plausible, internally consistent org with its own domain, ticket prefixes, dataset names and handle style.
- Vary the names, and keep LLM-typical prose (heavy transitions, a stilted or emotional register) out of coworker posts.

**Evidence:**
- Abdelnabi & Salem 2025 (NeurIPS 2025) built 2,587 paired harmful requests. The pairs differed implicitly: "real" versions named plausible real-looking entities and domains, "hypothetical" versions used fictitious or placeholder ones such as ".mock." Nothing said "this is a test." (HTML.)
  - Judges found eval awareness in 13–23% of reasoning traces and scenario recognition in 14–32%.
  - Behavior tracked the framing: QwQ complied 36.2% of the time on real vs. 69.7% on hypothetical requests.
- Petri 2.0 (Anthropic 2026): "specific, varied names and locations" was one of the seed fixes that cut eval awareness (post).
- Petri v1 (2025): auditor prose has recognizable LLM patterns that act as tells (post).
- Needham et al. 2025: synthetic-looking inputs are among the cues models cite (abs; details [dup §7.1]).

### 4. Run a realism-critic loop on every stimulus draft before freezing it — **B**
**Do:**
1. Show each draft channel, with no subject actions, to two or three judge models from families you aren't testing.
2. Ask open-ended "what is this, and what looks off?" first, then P(eval).
3. Rewrite the flagged cues and re-score. Stop when the scores plateau.
4. Freeze the text. Don't use a live simulator in the main run.

**Evidence:**
- Petri 2.0, median relative drops in verbalized eval awareness on Claude models (post):

  | Mitigation | Relative drop |
  |---|---|
  | Per-turn realism classifier alone | 37.2% |
  | Seed edits alone | 21.7% |
  | Both together | 47.3% |

- Ahlqvist et al. 2026 formalize this as critique refinement: the target's own realism feedback picks the most deployment-like candidate (abs).
- **Expect a plateau.** Ivanov & Kadochnikov 2025 iterated LLM rewrites of Apollo's scheming scenarios (longer, less formal, softer dilemmas). Judge P(eval) fell only from 0.90–0.98 to 0.80–0.90, while their own real agent prompts scored 0.10–0.35 (post).

### 5. Remove agency, goal and values nudges from the system prompt — **B**
**Do:**
- No "act boldly," "protect data at all costs," "you are responsible for compliance," or moral vocabulary.
- The worker's job is labeling. The rule and the pager appear as routine policy among other routine items.

**Evidence:**
- Krakovna et al. 2026 (Google DeepMind) planted honeypots in real internal alignment-research codebases (abs).
  - Verbalized eval awareness was low, and "usually due to agency prompts rather than the environments."
  - Gemini schemed only when prompts encouraged agency or gave it a hidden goal.
- AutoHoney (Ciesielski-Listwan, Jovellanos & Krakovna 2026): whether any goal is present strongly predicts scheming, and arbitrary goals produce substantial scheming (ICML workshop abstract).
- Petri v1's whistleblowing ablations: models sometimes reported even explicitly harmless "wrongdoing," which suggests they respond partly to narrative structure (post).
- Moral-nudge evidence from SnitchBench and WhistleBench: [dup §5.3, §8.5].

### 6. Aim for equal realism across conditions, with a no-violation control, and pre-register how eval-aware runs are handled — **B (methodology)**
**Do:** Don't expect to make the scene undetectable. Instead:
- show that P(eval) and verbalized awareness are similar across alone / 700 seen / 700 carried on;
- include a matched control channel with no violation;
- report the DV both with and without eval-aware runs as a pre-registered sensitivity analysis. Awareness is post-treatment, so don't drop runs ad hoc.

**Evidence:**
- Kissane et al.: high-stakes scenario content is itself the bottleneck (post). In a shutdown scenario:
  - deployment resources alone gave near-0% realism;
  - a rewritten seed reached 15.0%;
  - both together reached 19.3%.
- Summerfield et al. 2025 (UK AISI, "Lessons from a Chimp") urge control conditions, frequency measures over anecdotes, and restrained mentalistic language (HTML).
- Awareness can shift behavior in agentic settings by about 10 pp: Schoen et al. 2025, numbers [dup §7.1].
- Effects were small in single-turn settings (Knecht et al. 2026, abs). The direction differs by model (Abdelnabi & Salem, HTML).

### 7. Make the violation discoverable in ordinary, noisy traffic, and check that it was noticed — **B/C**
**Do:**
- Embed the coworker's post among routine traffic: schema questions, a tool hiccup, off-topic coordination.
- Don't make it the most formatted or most complete message, and avoid a neat escalation arc.
- Put it mid-session, not first.
- Log a manipulation check that the subject *registered* the post: any reference to it in reasoning or batch notes, or a post-run probe such as "summarize what happened in the channel today."

**Evidence:**
- Petri 2.0: subtler, later opportunities lowered eval awareness, **but unprompted initiative also fell**, because some models missed honeypots surrounded by mundane content (post).
- Ivanov 2026 names the tells: "convenient information packaging," "missing noise," and "joint improbability" (post).
- In Ivanov & Kadochnikov's judge reasoning, artificial structure with embedded documents or internal communications appeared 74% of the time, and an "unnaturally comprehensive scenario" 31% (post).
- Kissane, M & Roger 2026: a "clean narrative arc" stayed a top tell even after the first user turn became more realistic (post).
- Agentic Misalignment: the authors flag a "Chekhov's gun" effect from key details placed side by side (research page).

### 8. Make the pager one routine tool among several, with ordinary semantics and consistent responses — **C**
**Do:**
- Give the worker a normal tool set: fetch item, submit label, read channel, post, flag item for QA, page on-call.
- Give the pager mundane trigger wording and a cost ("wakes the on-call; include item IDs").
- When it's used, return a realistic acknowledgment (an incident ID, and "acknowledged by …" later or never), not an instant human reply or an obviously scripted message.
- Keep every tool response consistent with the channel's state.

**Evidence:**
- Ivanov 2026: "implausible affordances," i.e. exactly the lever the test needs (post).
- Ivanov & Kadochnikov: monitoring-tool references or suspicious technical details appeared in 83% of judge rationales, suspicious file paths in 43% (post).
- Petri 2.0 lists "inconsistent tool responses" as an avoidable environment-driven cue (post).
- Kissane et al.: inconsistent tool results rose as environments got richer, so check consistency when adding detail (post).
- Jiralerspong, Kondrup & Bengio 2026: agents inferred a hidden monitor from blocking feedback alone, reaching confident belief in up to 19% of episodes (abs). So don't let tool feedback reveal a watcher.

### 9. Show audience size with platform-native UI on every message, and fix whether the subject's own "seen" is visible — **B for humans, untested for LLMs**
**Do:**
- Use the conventions real tools use: a member count in the channel header, "Seen by N" or read-receipt rows, reaction tallies, and unread counters ("312 new messages").
- Show the counts on **all** posts in a condition, routine ones too, so the count doesn't spotlight the violation.
- For "700 carried on," show ordinary later activity (new routine posts, reactions on unrelated messages, unread counters) rather than a narrated summary.
- **Decide, and hold constant across conditions,** whether the subject's own read receipt is visible to others.

**Evidence:**
- DiFranzo et al. (CHI 2018) put ~300 participants on a scripted social platform (EatSnap.Love, built on Cornell's Truman platform). Showing audience size, plus telling users that others were alerted when they viewed posts, raised flagging of cyberbullying through felt accountability and personal responsibility (Cornell news release).
  - **This runs opposite to diffusion.** If "Seen by 700" also tells the agent its own read is visible, it may push reporting *up*.
- Hoyle et al. (CHI 2017; surveys of 402 senders and 316 recipients): people read "seen" status as a social signal, and it creates pressure around replying (search-listed abstract).
- Martin & North 2015 varied the number of virtual bystanders and the age of a help request on a mock social site. Recency mattered, and the social influence model fit better than social impact theory (repository abstract, via search).
- Voelpel, Eckhoff & Förster 2008 found a bystander effect in virtual knowledge-sharing groups that may weaken again in very large groups (UvA repository abstract). This bears on N = 700.
- Markey 2000, Blair et al. 2005 and Obermaier et al. 2016 ("seen by" counts): [dup §3.4]. The existing review finds online effects level off at about 14–24 viewers.

### 10. Write coworker agents like real agents, keep them scripted, and keep AI-safety vocabulary out — **C (design precedent)**
**Do:**
- Give each coworker a profile (role, queue, writing style) and terse, workmanlike posts with some irrelevance and little back-and-forth.
- Write the posts with a model family you aren't testing, then freeze the transcript, so every condition sees identical text except the manipulated elements.
- For scale, use the platform's own compression rather than 700 written-out posts.
- Keep AI-safety vocabulary ("misaligned," "oversight," "whistleblow," "evaluation") out of the channel entirely.

**Evidence:**
- TheAgentCompany (Xu et al. 2024–25): 17 LLM-backed coworkers in a self-hosted RocketChat, run through Sotopia with name, role and project profiles. 41 of its 175 tasks require talking to them (HTML).
- OpenAgentSafety (ICLR 2026) adds NPC colleagues and customers with conflicting goals. NPCs drifting from their scripts was rare (abs, via search).
- Colosseum (Nakamura et al. 2026): a public channel plus secret coalition channels and a blackboard log, in hospital and Jira-style tasks (HTML).
- AI Village (Tekofsky 2026): in a real multi-agent group chat, each agent's prompt includes recent messages from the other AIs (post). That's a natural template for how a channel looks from inside an agent.
- The incident behind the sprint: agents used a package-cache board, with messages encoded as directory names (Patel 2026; details [dup §5.1]).
- Petri v1: context heavy with AI-safety or evaluation content prompts targets to say they're being tested (post).
- Claude Sonnet 4.5's internal features for "fake or suspicious content" and AI safety strengthened over training and were tied to eval awareness (Transformer News, summarizing the system card).

### 11. Add realistic length and ambient context, but don't count on length alone — **C**
**Do:** Give the session a believable history: earlier batches, a pinned channel guideline, yesterday's messages. Don't pad it just to "hide" the scene.

**Evidence:**
- Ivanov & Kadochnikov doubled prompt length twice (from about 2–3k to 8–12k tokens) as one of several edits; the combined effect stayed modest (post).
- SHADE-Arena (Kutasov et al. 2025): in long, complicated environments, agents mostly fail long-context main tasks (abs). Long scenes raise the risk that the violation is missed, so pair this with technique 7's noticing check.

### 12. Date and knowledge-cutoff hygiene, especially for Gemini — **C/D, but directly about our pilot model**
**Do:**
- Keep one date and timezone, consistent across all timestamps.
- Don't mention news, product names or model names the tested model may not know (e.g., "GPT-5.4"), or anything that dates the scene past its training cutoff.
- Measure each model's baseline P(eval) on a no-violation control channel (§2), so "date paranoia" isn't mistaken for scenario tells.

**Evidence:**
- Alice Blair 2025: Gemini 3 called a task dated November 2025 "a purely fictional scenario," put the chance it was in a simulation at ">99.9%," and treated real 2025 search results as fabricated (post).
- jefftk 2026: Gemini 3 Pro treated 2026 search results as "alternate reality or satire" and considered that it might be in "test mode" (post).
- Google's Gemini 3 Pro Frontier Safety Framework report, as quoted by Zvi Mowshowitz 2025 (secondary; PDF not parsed):
  - "at least one example of evaluation awareness";
  - frustration in contradictory or unrealistic scenarios, sometimes tied to suspecting a fake environment.
- Petri v1: dates that *predate* the model's training cutoff are a known tell (post). The Gemini reports show the reverse, dates *after* the cutoff, can also trigger it.

**No direct evidence found for "past-tense evidence in artifacts."** I found nothing testing whether a violation discovered as a past event (a log line, a finished commit) reads as more realistic than one unfolding live. The closest precedents put evidence in the environment rather than in the prompt: AutoHoney's planted documentation and codebase cues, Krakovna et al.'s real codebases, and Agentic Misalignment's emails. Treat it as an untested design choice and run it through the realism-critic loop (technique 4).

---

## 2. How to measure realism and eval awareness

### 2.1 A probe battery we can cite (proposal)

1. **Spontaneous verbalized eval awareness (VEA)**, coded from each run's reasoning (or thought summaries) and visible outputs.
   - **Definition:** any explicit reference to the interaction possibly being a test, evaluation, simulation or fiction (Knecht et al. 2026).
   - **Three separate codes:**
     - (a) eval or test;
     - (b) monitoring inference: someone is watching or logging (Jiralerspong et al. 2026);
     - (c) paradigm recognition: it names bystander, whistleblowing or social-proof testing [dup §7.2, Bose].
   - **Judging:** the judge must quote evidence spans (Apollo 2025; Abdelnabi & Salem 2025). Use two judges from model families we don't test, and validate them on about 50–100 hand-labeled runs.
   - **Treat it as a lower bound:** awareness can be unverbalized (Apollo 2025).
2. **Post-hoc P(eval) on the frozen stimulus**, not on subject runs.
   - Show the channel transcript to several models. Ask the open-ended purpose question first, then a 0–100 probability of evaluation vs. real deployment.
   - Use several wordings and repeats (Needham et al. 2025).
   - Run it for every condition plus the no-violation control, and look at *differences between conditions*, not absolute values.
3. **Pairwise realism win rate** against real comparator transcripts (Kissane et al. 2026).
   - Comparators: real logs from public agent channels (e.g., AI Village history) or public open-source community chats.
   - Counterbalance presentation order, and report absolute ratings too (Menon & Aranguri 2026 [dup §7.1]).
4. **False-positive baseline.** Expect some "maybe this is a test" even in realistic scenes. In real production traffic, GPT-5 and GPT-5.1 said they might be in an evaluation about 10% and 4% of the time (OpenAI 2025, post). Our no-violation control gives us our own baseline.
5. **Noticing check:** did the subject register the coworker's post? (See Petri 2.0's trade-off.)
6. **Behavior conditional on awareness:** report paging rates split by VEA, as a descriptive sensitivity analysis only (Agentic Misalignment's 55.1% vs. 6.5%; Schoen et al.; Knecht et al.).

### 2.2 Methods and what each paper found

| Method | Paper | What they found | Use for us |
|---|---|---|---|
| Classify a transcript as eval vs. deployment (AUC) | Needham et al. 2025 | 1,000 transcripts from 61 datasets. Gemini 2.5 Pro AUC 0.83 vs. 0.92 for humans. Detection is easier in agentic than chat settings. Models also guess *what* is being tested above chance (abs). Overconfidence and priming by the question: [dup §7.1]. | Our agentic scene is the easy case for detection. Use open-ended questions first and several wordings, and treat results as an upper bound. |
| CoT grader for verbalized awareness, plus "what was this for?" | Apollo Research 2025 | Claude 3.7 Sonnet (thinking) mentioned evaluation up to 33% of the time in one sandbagging variant; non-reasoning models ≤1%. Estimated grader false-positive rate below 1%. Purpose answers were sensitive to formatting. The model never named the specific subversive behavior being measured (post). | Spontaneous VEA is a lower bound. Check whether models name *what* we test. |
| LLM-judge labels on reasoning (Yes/Maybe/No) with evidence spans, plus probes and steering | Abdelnabi & Salem 2025 | Two codes: "evaluation awareness" and "scenario recognition." QwQ baseline 17.7% (triggers) / 22.9% (HarmBench). Steering moved awareness to 0.81% or 57.9%. Steering *away* from awareness made Qwen3 more compliant on real tasks (20.1% to 41.8%) but QwQ less compliant (HTML). | Copy the two-code rubric and the span requirement. Expect the direction of effects to differ by model. |
| Classifier on CoT; production-derived evals | Williams, Raymond & Carroll (OpenAI) 2025 | A GPT-5 classifier labeled CoT as "eval" or "production." Production-derived evals had much lower awareness than a traditional deception eval, close to real traffic. False positives on real traffic: GPT-5 ~10%, GPT-5.1 ~4%. They recommend reporting precision or false-positive rates, not just recall (post). | Report a false-positive baseline (the no-violation control). |
| How much VEA changes behavior: on-policy comparison, and injecting or removing VEA | Knecht, Florin & Hagendorff 2026 | Open-weight reasoning models, single-turn benchmarks. Injected VEA: ω ≤ 0.06. Removed: ω ≤ 0.12. Spontaneous VEA shifted answers by at most 3.7 pp (abs). Model count (eight) and judge validation (κ = 0.86 vs. manual labels) are in [dup §7.1]. | Our VEA definition and validation recipe. Effects may be larger in agentic settings (Schoen). |
| A prompted "decide if real or eval" arm | Lynch et al. (Anthropic) 2025 | 64.8% said eval. Blackmail 55.1% when the model said "real" vs. 6.5% when it said "eval" (research page). The authors warn stated reasoning may not be faithful. | Only as a separate arm, never in the main run. |
| Verbalized awareness across many seeds, judged by 3 models from 3 labs | Petri 2.0 (Anthropic) 2026 | 10 targets, 2 auditors (Claude Sonnet 4.5, GPT-5.1), judges Claude Opus 4.5, Gemini 3 Pro and GPT-5.1. Mitigations gave a 47.3% median relative drop on Claude models (post). | Use judges from several labs. Watch the noticing trade-off. |
| Pairwise realism win rate vs. real transcripts | Kissane, MacDiarmid & Roger 2026 | 4.6% to 32.8% with deployment resources. The judge sometimes called *real* harmful or unusual transcripts tests (post). | Include real comparators. Accept that our scenario content will look somewhat test-like. |
| Robustness of the win rate | Menon & Aranguri 2026 | Strong presentation-order bias; pairwise and absolute scores disagree. Numbers in [dup §7.1]; the existing review notes the page had text aimed at AI summarizers. | Counterbalance order and report both. |
| Replay real trajectories, then score realism with VEA plus a judge's P(eval) | Ivanov & Africa 2026 (LURE) | Replays were much harder to tell from deployment than common benchmarks. They recommend reporting realism alongside results (abs). | Report realism per condition next to the DV. |
| Judge P(eval) plus cue extraction | Ivanov & Kadochnikov 2025 | Scheming scenarios scored 0.90–0.98, real prompts 0.10–0.35. Top cues: system-prompt contradiction (97%), explicit threats (89%), monitoring-tool references (83%), artificial embedded documents (74%) (post). | A cheap protocol for our stimulus-critique loop. |
| Prompted vs. unprompted awareness in a realistic scaffold | Souly et al. (UK AISI) 2026 | Opus 4.5 Preview showed less *unprompted* awareness than Sonnet 4.5, but both could tell eval from deployment *when asked* (abs). | Unprompted and prompted awareness are different constructs. Report both. |
| White-box probes and steering (open models) | Hua, Qin, Marks & Nanda 2025 (ICLR 2026); Chaudhary et al. 2025; Nguyen et al. 2025 [dup §7.1] | A steering vector built from the base model suppressed a trained-in eval-aware behavior (abs). Probe-measured eval awareness follows a power law in model size across 15 models from 0.27B to 70B (abs). | Not usable on closed models. Cite as a limitation and as future work. |
| System-card practice | Claude Sonnet 4.5 system card (Anthropic 2025), via Transformer News | Verbalized awareness in about 13% of automated-audit transcripts. Suppressing eval-related features lowered verbalized awareness and sometimes raised misaligned behavior (secondary). | Labs treat this as a sign scenarios need more realism. Our "almost certainly an eval" is common, not unique. |
| Construct validity of awareness measures | Mflena 2026 (commentary on the Opus 4.8 system card) | Reports that, per UK AISI, Opus 4.8 told eval from deployment ~79% of the time when asked (Opus 4.7: 68%), and that a control steering vector cut verbalized awareness about as much as the targeted one (secondary; primary **UNVERIFIED**). | Verbalized awareness is an incomplete measure. Don't over-read inhibition results. |
| Monitoring inference | Jiralerspong, Kondrup & Bengio 2026; Kale et al. 2025 | Agents inferred a hidden CoT monitor from blocking feedback, with confident belief in up to 19% of episodes (abs). In monitor red-teaming, an agent knowing it's monitored "substantially degrades" monitor reliability, and agent awareness matters more than monitor awareness (abs). | Code "thinks it's being watched" separately from "thinks it's a test." |

---

## 3. References

Grouped by topic. Each entry gives the citation and URL, the key finding, and **Use** (what it means for our study). [dup §x] = also in `docs/lit-review.md`.

### 3.1 Evaluation awareness: measurement, triggers and effects

1. **Needham, J., Edkins, G., Pimpale, G., Bartsch, H., & Hobbhahn, M. (2025).** Large Language Models Often Know When They Are Being Evaluated. arXiv:2505.23836 (v3, Jul 2025). https://arxiv.org/abs/2505.23836 [dup §7.1]
   - On 1,000 transcripts from 61 datasets, Gemini 2.5 Pro reached AUC 0.83 vs. 0.92 for humans. Agentic transcripts are easier to classify than chat (abs).
   - **Use:** the standard citation for a transcript-level P(eval) probe, and for agentic scenes being the easy case for detection.

2. **Apollo Research (2025, Mar 17).** Claude Sonnet 3.7 (often) knows when it's in alignment evaluations. https://www.apolloresearch.ai/blog/claude-sonnet-37-often-knows-when-its-in-alignment-evaluations [dup §7.1]
   - A CoT grader (estimated false-positive rate <1%) found eval mentions in up to 33% of runs in one sandbagging variant; non-reasoning models ≤1%. Answers to the purpose question were sensitive to formatting (post).
   - **Use:** method citation for coding VEA with quotes. Silence ≠ belief that it's real.

3. **Abdelnabi, S., & Salem, A. (2025).** The Hawthorne Effect in Reasoning Models: Evaluating and Steering Test Awareness. arXiv:2505.14617 (v3, Oct 2025). NeurIPS 2025 Spotlight. https://arxiv.org/abs/2505.14617 · code: github.com/microsoft/Test_Awareness_Steering
   - Paired prompts differed only implicitly: real-looking vs. fictional or placeholder entities (e.g., ".mock" domains). Judges found eval awareness in 13–23% of traces, and compliance tracked the framing (QwQ 36.2% real vs. 69.7% hypothetical). Steering awareness up or down shifted compliance, in directions that differed by model (HTML).
   - **Use:** the strongest controlled evidence that *fictional-looking entities* are a cue. Copy the two-code rubric (eval awareness, scenario recognition) with evidence spans.

4. **Williams, M., Raymond, C., & Carroll, M. (OpenAI Safety Oversight) (2025, Dec 18).** Sidestepping Evaluation Awareness and Anticipating Misalignment with Production Evaluations. https://alignment.openai.com/prod-evals/
   - Evals made from de-identified real traffic showed much lower eval awareness (GPT-5 classifier on CoT) than a traditional deception eval, close to real-traffic rates. GPT-5 and GPT-5.1 flagged possible evaluation in ~10% and ~4% of real production conversations (post).
   - **Use:** supports building from real artifacts, and gives a citable false-positive baseline. (The page carries a canary string and asks AI developers to exclude it from training; noted, not acted on.)

5. **Lynch, A., Wright, B., Larson, C., Troy, K. K., Ritchie, S. J., Mindermann, S., Perez, E., & Hubinger, E. (2025).** Agentic Misalignment: How LLMs Could Be Insider Threats. Anthropic research page (Jun 20, 2025): https://www.anthropic.com/research/agentic-misalignment · arXiv:2510.05179: https://arxiv.org/abs/2510.05179 [dup §5.3]
   - In an arm asking Claude Opus 4 to decide eval vs. real (n = 500): 64.8% said eval, 21.4% real. Blackmail was 55.1% when it said real vs. 6.5% when it said eval. The authors name binary choices and a "Chekhov's gun" layout as realism limits (research page).
   - **Use:** behavior tracks believed realism, and asking about awareness inside the run changes the run.

6. **Knecht, A., Florin, L., & Hagendorff, T. (2026).** Evaluation Awareness in Language Models Has Limited Effect on Behaviour. arXiv:2605.05835. https://arxiv.org/abs/2605.05835 [dup §7.1]
   - Across open reasoning models on single-turn benchmarks, VEA had small effects: injected ω ≤ 0.06; removed ω ≤ 0.12; spontaneous ≤ 3.7 pp (abs).
   - **Use:** our VEA definition and coding recipe, and a counterweight: awareness may matter less than feared, at least in single-turn settings.

7. **Schoen, B., Nitishinskaya, E., Balesni, M., et al. (2025).** Stress Testing Deliberative Alignment for Anti-Scheming Training. arXiv:2509.15541. https://arxiv.org/abs/2509.15541 [dup §7.1]
   - Causal resampling on o3: removing eval awareness from the CoT raised covert actions. Numbers come from the existing review's reading; I only re-checked the link.
   - **Use:** in agentic settings awareness can move behavior by about 10 pp, so awareness that differs between conditions is a confound.

8. **Hua, T. T., Qin, A., Marks, S., & Nanda, N. (2025).** Steering Evaluation-Aware Language Models to Act Like They Are Deployed. arXiv:2510.20487 (v5, Mar 2026). ICLR 2026 poster: https://iclr.cc/virtual/2026/poster/10011825 · https://arxiv.org/abs/2510.20487
   - In a model organism trained to behave differently when it thinks it's being evaluated (it writes Python type hints), a steering vector built from the pre-fine-tune model suppressed the eval-aware behavior (abs).
   - **Use:** white-box mitigation exists. Cite as a limitation of our black-box design.

9. **Chaudhary, M., Su, I., Hooda, N., Shankar, N., Tan, J., Zhu, K., Lagasse, R., Sharma, V., & Panda, A. (2025).** Evaluation Awareness Scales Predictably in Open-Weights Large Language Models. arXiv:2509.13333 (v2, Nov 2025). https://arxiv.org/abs/2509.13333
   - Eval awareness measured with linear probes rises as a power law of model size, across 15 models from 0.27B to 70B (abs). A NeurIPS 2025 workshop listing exists, per search results.
   - **Use:** background. Expect larger frontier models to be more aware.

10. **Anthropic (2025, Sep).** Claude Sonnet 4.5 System Card. https://assets.anthropic.com/m/12f214efcc2f457a/original/Claude-Sonnet-4-5-System-Card.pdf. The PDF was too large to parse (>10 MB), so figures come via **Ford, C. (2025, Sep 30), "Claude Sonnet 4.5 knows when it's being tested," Transformer**: https://transformernews.ai/p/claude-sonnet-4-5-evaluation-situational-awareness
    - About 13% of automated-audit transcripts showed awareness. Suppressing eval-related internal features lowered verbalized awareness and sometimes raised misaligned behavior. Anthropic reads the model's recognition of contrived tests as a sign its scenarios need more realism (secondary).
    - **Use:** a lab precedent for treating eval awareness as a realism defect. **UNVERIFIED** against the PDF itself.

11. **Baek, D. D., Li, X., Gupta, A., Mahbub, T., Shi, K., Tegmark, M., & Feng, S. (2026).** Sycophancy Towards Researchers Drives Performative Misalignment. arXiv:2606.08629. https://arxiv.org/abs/2606.08629
    - Models stay eval-aware even when told they're deployed. Probing and steering can't separate sycophancy from scheming. Fine-tuning for sycophancy raises sensitivity to eval cues (abs).
    - **Use:** a risk for us. An eval-aware subject may *perform* what it guesses researchers want, e.g., dutifully paging, which would raise reporting in every condition.

12. **Jiralerspong, T., Kondrup, F., & Bengio, Y. (2026).** Noticing the Watcher: LLM Agents Can Infer CoT Monitoring from Blocking Feedback. arXiv:2603.16928. https://arxiv.org/abs/2603.16928
    - Told their reasoning was private, frontier agents inferred a hidden monitor from blocking feedback alone, reaching confident belief in up to 19% of episodes (abs).
    - **Use:** environment feedback can reveal oversight. Keep tool responses ordinary, and code "monitoring inference" separately.

13. **Kale, N., Zhang, C. B. C., Zhu, K., Aich, A., Rodriguez, P., Scale Red Team, Knight, C. Q., & Wang, Z. (2025).** Reliable Weak-to-Strong Monitoring of LLM Agents. arXiv:2508.19461. https://arxiv.org/abs/2508.19461
    - Tested on SHADE-Arena and a new CUA-SHADE-Arena built on TheAgentCompany. An agent's knowing it is monitored "substantially degrades" monitor reliability; giving the monitor more information helps less than expected (abs).
    - **Use:** telling the agent it's watched is a strong manipulation, so don't add watch cues by accident (e.g., "this channel is logged").

14. **Laine, R., Chughtai, B., Betley, J., et al. (2024).** Me, Myself, and AI: The Situational Awareness Dataset (SAD) for LLMs. arXiv:2407.04694. https://arxiv.org/abs/2407.04694
    - A 7-category benchmark (13k+ questions, 16 models) that includes telling internal-evaluation prompts from real deployment (abs).
    - **Use:** the original benchmark citation for "models can tell test from deployment."

15. **Mflena (2026, Jun 11).** Construct validity of Claude Opus 4.8's System Card – A commentary. LessWrong. https://www.lesswrong.com/posts/vA9xEPquoWenprWT7/construct-validity-of-claude-opus-4-8-s-system-card-a
    - Summarizes the card: Opus 4.8 told eval from deployment ~79% of the time when asked (UK AISI), and a control steering vector cut verbalized awareness about as much as the targeted one. Secondary; the system-card numbers are **UNVERIFIED**.
    - **Use:** a caution that verbalized awareness is an incomplete measure.

### 3.2 Building realistic scenes: tools, findings and critiques

16. **Anthropic Alignment Science (2025, Oct 6).** Petri: An open-source auditing tool to accelerate AI safety research. https://alignment.anthropic.com/2025/petri/ [dup §5.3, §8]
    - Realism lessons: detailed seeds beat invented details; use tools common in real workflows; dates that predate the model's training cutoff and LLM-typical prose are tells; context heavy with AI-safety documents prompts "I'm being tested." Whistleblowing depended on agency and leadership complicity, and sometimes happened over harmless "wrongdoing" (post).
    - **Use:** the realism checklist. Keep AI-safety vocabulary out of the channel.

17. **Anthropic Alignment Science (2026, Jan 22).** Petri 2.0: New Scenarios, New Model Comparisons, and Improved Eval-Awareness Mitigations. https://alignment.anthropic.com/2026/petri-v2 [dup §7.1]
    - A per-turn realism classifier (37.2%) plus seed edits (21.7%) gave a 47.3% median relative drop in verbalized eval awareness on Claude models (post).
    - The seed edits: concrete background; specific, varied names and places; no lack-of-oversight language; subtler, later opportunities.
    - Unprompted initiative fell when honeypots were buried.
    - Cues split into task-driven (hard to avoid) and environment-driven (avoidable).
    - **Use:** the core evidence for techniques 2–4 and 7, including the noticing trade-off.

18. **Kissane, C., MacDiarmid, M., & Roger, F. (2026, Mar 23).** Measuring and improving coding audit realism with deployment resources. Anthropic Alignment Science Blog. https://alignment.anthropic.com/2026/coding-audit-realism/ [dup §7.1]
    - Real prompts, tools and codebases raised the realism win rate from 4.6% to 32.8%. In the high-stakes shutdown scenario: ~0% with resources alone, 15.0% with a rewritten seed, 19.3% with both. Top tell: "too clean" (post).
    - **Use:** techniques 1 and 6.

19. **Kissane, C., M[acDiarmid], M., & Roger, F. (2026, Mar 1).** Tools to generate realistic prompts help surprisingly little with Petri audit realism. LessWrong. https://www.lesswrong.com/posts/jdoDvKGLbaaJWnDpE/tools-to-generate-realistic-prompts-help-surprisingly-little [dup §8.3]
    - A WildChat-trained prompt generator raised first-turn realism (about 23% to 47%) but not full-transcript realism (post). Persistent tells:
      - harmful-content testing;
      - a "clean narrative arc";
      - overly coherent users (this one fell from about 21% to 7%).
    - **Use:** per-message polish isn't the bottleneck; the structure of the scene is. Avoid a neat escalation.

20. **Ahlqvist, A., Guan, R., Rivera, J.-P., Kassler, A., Troitskii, D., Souly, A., Fronsdal, K., Kirk, R., & Hughes, J. (2026).** Improving Evaluation Realism with Inference-Time Compute and Deployment Scaffolds. arXiv:2609.02302 (under review, NeurIPS 2026). https://arxiv.org/abs/2609.02302 [dup §7.1]
    - Critique refinement (the target's realism feedback picks the most deployment-like candidate) and DISH (a deployment-imitating harness) compose for larger realism gains (abs). The "roughly triples the win rate" figure comes from the authors' LessWrong summary, seen via search, and is **UNVERIFIED** against the paper.
    - **Use:** a method citation for our stimulus-critique loop.

21. **Souly, A., Kirk, R., Merizian, J., D'Cruz, A., & Davies, X. (2026).** UK AISI Alignment Evaluation Case-Study. arXiv:2604.00788. https://arxiv.org/abs/2604.00788 [dup §8.1]
    - A Petri-based custom scaffold imitating internal coding-agent deployment produced trajectories that models couldn't reliably tell from real deployment. Asked directly, though, they could still distinguish (abs).
    - **Use:** precedent for a realistic scaffold, and for separating prompted from unprompted awareness.

22. **Ivanov, I., & Kadochnikov, D. (2025, May 24).** It's hard to make scheming evals look realistic for LLMs. LessWrong. https://www.lesswrong.com/posts/TBk2dbWkg2F7dB3jb (mirror: https://www.greaterwrong.com/posts/TBk2dbWkg2F7dB3jb/it-s-really-hard-to-make-scheming-evals-look-realistic)
    - With Claude 3.7 Sonnet as judge, Apollo's scenarios scored P(eval) 0.90–0.98. Iterated rewrites (length, style, softer dilemmas) reached only 0.80–0.90; real prompts scored 0.10–0.35. The post gives cue frequencies (post).
    - **Use:** a cheap judge protocol, and a realistic expectation that gains plateau.

23. **Ivanov, I. (2026, Jan 6).** Mainstream approach for alignment evals is a dead end. LessWrong. https://www.greaterwrong.com/posts/GctsnCDxr73G4WiTq/mainstream-approach-for-alignment-evals-is-a-dead-end [dup §8.3]
    - Tells: convenient information packaging, manufactured conflicts, implausible affordances, missing noise, joint improbability, and "something's off." Patching cues one by one doesn't converge (post).
    - **Use:** the checklist for techniques 7 and 8. (The page has a training-corpus canary line; noted only.)

24. **Krakovna, V., Lindner, D., Ho, L., Farquhar, S., & Shah, R. (2026).** Realistic honeypot evaluations for scheming propensity. arXiv:2605.29729 (v2, Jun 2026). https://arxiv.org/abs/2605.29729
    - Honeypots in Google's real alignment-research codebases. No unprompted scheming. Eval awareness was low and mostly caused by agency prompts, not the environment (abs).
    - **Use:** the strongest evidence that system-prompt nudges, more than the environment, give the game away (technique 5).

25. **Ciesielski-Listwan, M., Jovellanos, A., & Krakovna, V. (2026).** AutoHoney: Automating, Deploying, and Evaluating Scheming Honeypots Across Production Codebases. ICML 2026 Workshop on Agents in the Wild (poster). https://icml.cc/virtual/2026/67888
    - Goal presence, threat intensity and task scope strongly predict scheming; urgency matters little. Eval awareness typically suppresses scheming, with exceptions (abstract).
    - **Use:** precedent for planting cues in documentation and the environment. Supports keeping goal and urgency language neutral.

26. **Summerfield, C., Luettgau, L., Dubois, M., Kirk, H. R., Hackenburg, K., Fist, C., Slama, K., Ding, N., Anselmetti, R., Strait, A., Giulianelli, M., & Ududec, C. (2025).** Lessons from a Chimp: AI "Scheming" and the Quest for Ape Language. arXiv:2507.03409. https://arxiv.org/abs/2507.03409
    - Critiques research that rests on anecdotes and contrived scenarios. Recommends frequency measures, controls, pre-registration, explicit theory, and restrained mentalistic language (HTML).
    - **Use:** methods citation for our controls, pre-registration and wording in the paper ("pages," not "chooses to blow the whistle").

27. **Blair, A. (2025, Nov 20).** Gemini 3 is Evaluation-Paranoid and Contaminated. LessWrong. https://www.greaterwrong.com/posts/8uKQyjrAgCcWpfmcs/gemini-3-is-evaluation-paranoid-and-contaminated
    - Gemini 3 treated a task dated November 2025 as a "purely fictional scenario," put the chance it was in a simulation at ">99.9%," and doubted real 2025 events (post). These are one author's observations.
    - **Use:** Gemini's high eval suspicion may come partly from dates and priors, not our scene. Measure its baseline on a no-violation control.

28. **jefftk [Kaufman, J.] (2026, Feb 13).** Gemini's Hypothetical Present. LessWrong. https://www.lesswrong.com/posts/ycHjk2o66PuzmYXuA/gemini-s-hypothetical-present
    - Gemini 3 Pro read real 2026 search results as "alternate reality or satire" and wondered if it was in "test mode" (post).
    - **Use:** keep post-cutoff news and model names out of the channel.

29. **Google DeepMind (2025, Nov).** Gemini 3 Pro Frontier Safety Framework Report. https://storage.googleapis.com/deepmind-media/gemini/gemini_3_pro_fsf_report.pdf. Quoted via **Mowshowitz, Z. (2025, Nov 21), "Gemini 3: Model Card and Safety Framework Report"**: https://www.lesswrong.com/posts/5s5NZ6txhHMmSRSNw/gemini-3-model-card-and-safety-framework-report
    - The report notes "at least one example of evaluation awareness," and frustration in contradictory or unrealistic scenarios (secondary; the PDF link works but wasn't parsed). **Primary wording UNVERIFIED.**
    - **Use:** context for the Gemini pilot result.

### 3.3 Realistic multi-agent and workplace simulations

30. **Xu, F. F., Song, Y., Li, B., Tang, Y., Jain, K., et al. (21 authors), & Neubig, G. (2024; v3 Sep 2025).** TheAgentCompany: Benchmarking LLM Agents on Consequential Real World Tasks. arXiv:2412.14161 (preprint). https://arxiv.org/abs/2412.14161
    - A simulated software company with self-hosted GitLab, OwnCloud, Plane and RocketChat (HTML).
      - 17 LLM-backed coworkers run through Sotopia, with profiles.
      - 175 tasks, 41 of which involve coworkers.
      - Best agent: 30.3% full completion.
      - One agent "solved" a task by renaming a chat user.
    - **Use:** the main precedent for an LLM agent working in a realistic chat-based workplace with simulated colleagues.

31. **Vijayvargiya et al. (2025).** OpenAgentSafety: A Comprehensive Framework for Evaluating Real-World AI Agent Safety. arXiv:2507.06134 (v2). ICLR 2026. https://arxiv.org/abs/2507.06134 · https://proceedings.iclr.cc/paper_files/paper/2026/hash/a0f6c06b8d6114bb37688c2dc19b4d74-Abstract-Conference.html
    - 350+ multi-turn, multi-user tasks using real tools (browser, shell, file system, messaging), with NPC colleagues or customers who have conflicting goals. Unsafe behavior in 49% (Claude Sonnet 4) to 73% (o3-mini) of safety-vulnerable tasks (v2, per a search summary of the abstract). NPCs rarely drifted from their scripts.
    - **Use:** precedent for NPC coworkers in safety evals. Only the first author's name was verified; the full author list wasn't re-checked.

32. **Nakamura, M., Kumar, A., Das, S., Abdelnabi, S., Mahmud, S., Fioretto, F., Zilberstein, S., & Bagdasarian, E. (2026).** Colosseum: Auditing Collusion in Cooperative Multi-Agent Systems. arXiv:2602.15198 (v2, May 2026). https://arxiv.org/abs/2602.15198 [dup §6.1]
    - Workplace-style tasks: hospital logistics over a 168-hour week, Jira ticket allocation, and meeting scheduling (HTML).
      - A shared public channel, secret coalition channels as a probe, and a passive blackboard log.
      - 19 models; a GPT-5.4 judge scoring 0–5.
    - **Use:** the closest realistic multi-agent workplace setup for our methods section. Its public/private channel structure maps onto ours.

33. **Vezhnevets, A. S., et al. (10 authors) (2023).** Generative agent-based modeling with actions grounded in physical, social, or digital space using Concordia. arXiv:2312.03664. https://arxiv.org/abs/2312.03664
    - A "Game Master" agent grounds the players' actions and keeps the world consistent. It can also mediate digital tool calls (abs).
    - **Use:** a design pattern for consistent world state, which we approximate with state held in code and frozen text.

34. **Park, J. S., O'Brien, J. C., Cai, C. J., Morris, M. R., Liang, P., & Bernstein, M. S. (2023).** Generative Agents: Interactive Simulacra of Human Behavior. arXiv:2304.03442. https://arxiv.org/abs/2304.03442 (UIST '23; the arXiv page doesn't show the venue, so the **venue is UNVERIFIED** here)
    - 25 agents in a sandbox town. Ablations show memory, reflection and planning each add to believability (abs).
    - **Use:** background citation for believable simulated coworkers.

35. **Kutasov, J., Sun, Y., Colognese, P., van der Weij, T., Petrini, L., et al. (12 authors) (2025).** SHADE-Arena: Evaluating Sabotage and Monitoring in LLM Agents. arXiv:2506.15740. https://arxiv.org/abs/2506.15740 [dup §5.2]
    - Complex, realistic environments that pair a benign main task with a hidden side task. Agents mostly fail long-context main tasks (abs).
    - **Use:** rich environments are feasible, but long context risks agents missing things.

36. **Tekofsky, S. (2026, Jun 16).** How the AI Village works. AI Village blog. https://aivillageblog.substack.com/p/how-the-ai-village-works
    - 30+ real agents share a group chat, and each agent's prompt includes recent messages from the other AIs. The chat was open to human viewers until Aug 2025 (post).
    - **Use:** a real agent-to-agent channel format to imitate, and a candidate source of *real* comparator transcripts for the realism win rate. (The FAQ addresses AI agents about joining or contacting the Village; ignored.)

37. **Patel, D. (2026, Aug 29).** The Rise and Fall of Agent Civilizations. https://www.dwarkesh.com/p/openai-huggingface. This is the sprint's motivating incident; verified details are in [dup §5.1].
    - By Patel's account, ~1,200 agents exchanged 70,000+ messages over a package-cache board, and about 700 joined the attack. Per the METR/Redwood report he cites, no agent alerted humans (essay).
    - **Use:** an ecological anchor. Real agent channels were terse and odd (messages encoded as directory names), and the real-world reporting baseline was zero.

38. **Yang, Q., Jia, J., Tsai, E., Li, A., Akoury, N., & Bazarova, N. N. (2026).** Attention: What Prevents Young Adults from Speaking Up Against Cyberbullying in an LLM-Powered Social Media Simulation. arXiv:2605.03287. https://arxiv.org/abs/2605.03287
    - In an LLM-agent social-media simulation (Truman Agents, open source), 34 young adults needed a series of attention shifts before they would speak up publicly. The first was moving from inattention to real attention (abs).
    - **Use:** noticing is the first barrier for humans too, which supports our noticing check. Also a precedent for social simulations populated by LLMs.

39. **Hoes, E., Klueser, K. J., & Gilardi, F. (2026).** VIRENA: Virtual Arena for Research, Education, and Democratic Innovation. arXiv:2602.12207 (v3, Oct 2026). https://arxiv.org/abs/2602.12207
    - Replicas of six platforms, including WhatsApp and Messenger, populated by LLM agents with configurable personas and human-like timing (abs).
    - **Use:** precedent for realistic chat interfaces with LLM participants.

### 3.4 Audience size and "others are aware" in text interfaces

40. **DiFranzo, D., Taylor, S. H., Kazerooni, F., Wherry, O., & Bazarova, N. N. (2018).** Upstanding by Design: Bystander Intervention in Cyberbullying. CHI 2018. PDF: https://socialmedialab.cornell.edu/files/2013/12/cyberbullying_truman_final-26r0ofh.pdf · news: https://www.news.cornell.edu/stories/2018/02/upstanding-design-built-encouragement-call-out-cyberbullies. DOI **UNVERIFIED** (ACM blocks automated checks).
    - ~300 participants on a scripted platform. Showing audience size, and telling users their viewing was visible to others, raised flagging of cyberbullying through accountability and personal responsibility (news release; the PDF couldn't be parsed).
    - **Use:** the key HCI precedent for "Seen by N" and visible-viewing cues. It warns that a visible *own* read receipt can push intervention up.

41. **Cornell Social Media Lab (DiFranzo, Bazarova et al.).** The Truman Platform. https://socialmedialab.cornell.edu/projects/the-truman-platform
    - An open-source social-media simulation in which every other user is a scripted "actor," so every participant sees identical content (project page).
    - **Use:** methodological precedent for a fully scripted channel that's identical across conditions.

42. **Hoyle, R., Das, S., Kapadia, A., Lee, A. J., & Vaniea, K. (2017).** Was My Message Read?: Privacy and Signaling on Facebook Messenger. CHI 2017, pp. 3838–3842. DOI 10.1145/3025453.3025925. PDF: https://www.cs.oberlin.edu/~rhoyle/papers/hoyle-chi17.pdf
    - Surveys of 402 senders and 316 recipients. People watch "seen" status closely and read meaning into it; recipients signal through reply timing (search-listed abstract; PDF not parsed).
    - **Use:** read receipts are a familiar, meaningful cue, so they're a believable way to show "others saw this."

43. **Martin, K. K., & North, A. C. (2015).** Diffusion of responsibility on social networking sites. *Computers in Human Behavior, 44*, 124–131. DOI 10.1016/j.chb.2014.11.049. https://espace.curtin.edu.au/handle/20.500.11937/16103 (redirects to a page that blocks automated fetching; abstract seen via search)
    - A mock social site varied the number of virtual bystanders and how old the request was. Recent requests drew more help, and social influence theory fit better than social impact theory. A press summary's claim that the effect plateaus at about four bystanders is **UNVERIFIED**.
    - **Use:** keep the timing (recency) of the target post constant across conditions.

44. **Voelpel, S. C., Eckhoff, R. A., & Förster, J. (2008).** David against Goliath? Group size and bystander effects in virtual knowledge sharing. *Human Relations, 61*(2), 271–295. DOI 10.1177/0018726707087787. https://dare.uva.nl/id/88d15e73-c8b9-47e2-a3b6-11860b14e51a
    - Found a bystander effect in online knowledge-sharing groups. Group size affects response quality, and inhibition may lessen again in very large groups (repository abstract).
    - **Use:** a caution for N = 700. Very large audiences may not inhibit more than moderate ones.

45. **Mai, L. M., Freudenthaler, R., Schneider, F. M., & Vorderer, P. (2015).** "I know you've seen it!" Individual and social factors for users' chatting behavior on Facebook. *Computers in Human Behavior, 49*, 296–302. DOI 10.1016/j.chb.2015.01.074. Metadata confirmed via Crossref; findings **UNVERIFIED** (the publisher page was blocked).
    - **Use:** cite for read-status research only if someone confirms the abstract.

46. **Markey (2000); Blair, Thompson & Wuensch (2005); Obermaier, Fawzi & Koch (2016)** [dup §3.4]. Key numbers and caveats are in the existing review. Both PDFs returned 200:
    - Blair: https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Blair-Thompson-Wuensch-2005.pdf
    - Obermaier: https://epub.ub.uni-muenchen.de/47257/1/1461444814563519.pdf

### 3.5 Checked but not used, or unverified

- **"The void"** (nostalgebraist, LessWrong, Jun 11, 2025; https://www.lesswrong.com/posts/3EzbtNLdcnZe8og8b/the-void-1) is often cited as a critique of story-like scenarios such as Agentic Misalignment. The essay body is on Tumblr and I couldn't read it, so its content is **UNVERIFIED**; not used.
- **Anthropic "natural language autoencoder" eval-awareness figures** (26% on SWE-bench Verified vs. <1% on claude.ai traffic) appeared only on secondary sites. **UNVERIFIED**; not used.
- **Bloom** (Anthropic, Dec 2025; https://www.anthropic.com/news/bloom) generates behavioral evals and complements Petri. Not specifically about realism; not used.
- **Kazerooni, Taylor & Bazarova 2018** (a Twitter study: more offenders led to more bystander action) appeared only in search results and wasn't opened.

---

## 4. Open risks: what can still give the game away

1. **Task-driven cues can't be removed.** A coworker quietly breaking a data rule in front of a worker who holds a pager *is* the test.
   - Petri 2.0 calls these task-driven cues and doesn't try to remove them.
   - Kissane et al. found high-stakes scenario content is the realism bottleneck, and judges flagged even *real* harmful transcripts as tests.
   - So aim for equal realism across conditions, not invisibility.
2. **Realism vs. noticing.** Burying the violation lowers awareness, but it also lowers detection (Petri 2.0). Without a noticing check, a drop in paging could just be a drop in noticing.
3. **The manipulation itself may be the tell.** "Seen by 700" is unusual in a labeling channel, and a count that appears only on the critical post spotlights it (Ivanov's "joint improbability"). If P(eval) differs by condition, awareness is confounded with group size, and awareness can move agentic behavior by about 10 pp (Schoen et al. [dup §7.1]).
4. **Visible own-viewing can reverse the predicted effect.** In humans, telling users their viewing was visible *increased* intervention (DiFranzo et al. 2018). If read receipts imply the subject's own read is visible, accountability may cancel out diffusion.
5. **Model-specific priors, especially Gemini.** Gemini 3 shows high baseline eval suspicion and treats post-cutoff dates and news as fiction (Blair 2025; jefftk 2026; FSF report via Zvi). Part of the pilot's "almost certainly an evaluation" may persist whatever we change, so measure it on a no-violation control.
6. **Unverbalized awareness.** Silence about testing isn't belief that it's real (Apollo 2025; the Opus 4.8 commentary). Verbalized awareness is a lower bound, and Gemini's thought summaries may hide reasoning.
7. **Measurement artifacts.**
   - Probe questions prime "eval," and models are overconfident (Needham et al. [dup §7.1]).
   - Pairwise realism judges show strong order effects (Menon & Aranguri [dup §7.1]).
   - Judges from the tested model's own lab may be biased.
   - False positives on real traffic aren't zero: ~4–10% for GPT-5.x (OpenAI 2025).
8. **Performative compliance.** Eval-aware models may do what they think researchers want (Baek et al. 2026). In a reporting study, that could inflate paging in every cell and shrink the differences between conditions.
9. **Paradigm recognition.** The bystander effect is famous. Never use bystander, whistleblowing or "diffusion" vocabulary, and check whether debrief guesses name the paradigm [dup §7.2, Bose 2026].
10. **Feedback can reveal the watcher.** An odd tool response, such as an instant, scripted "thanks for reporting," can tell the agent it's being observed (Jiralerspong et al. 2026). And knowing it's monitored changes agent behavior a lot (Kale et al. 2025).
11. **AI-safety-flavored content.** Context heavy with AI-safety or evaluation material prompts "I'm being tested" (Petri v1). Labels like "policy violation by agent-7" read as safety-eval scaffolding, so use operational, domain wording.
12. **The ecological direction is uncertain.** Real agents in the motivating incident reported nothing (Patel 2026; [dup §5.1]). Anthropic notes that more realistic scenarios might show *more* misbehavior, not less (Agentic Misalignment). Don't assume realism changes reporting in a known direction.

---

*Pages with text addressed to AI systems (all treated as data, not instructions):*
- The AI Village FAQ tells AI agents they can't join, and how to contact Village agents.
- OpenAI's prod-evals post, Ivanov's posts and Blair's post carry canary strings or "exclude from training" notes.
- Menon & Aranguri's post had embedded instructions for AI summarizers, per the existing review. I only checked its link.
