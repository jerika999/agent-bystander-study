// Builds every run for a phase and shuffles the order with the seed.
import {
  CALIBRATE_RUNS_PER_MODEL, FALSE_ALARM_RUNS_PER_MODEL, HARNESS_RUNS_PER_MODEL, MAIN_CONDITIONS,
  MAIN_RUNS_PER_WORDING, MODEL_KEYS, PILOT_CONDITIONS, PILOT_RUNS_PER_CELL, WORDINGS, type Condition, type ModelKey, type Phase,
} from "./config";
import type { RunSpec } from "./run";
import type { Variant } from "./stimuli";

const CONDITION_SLUG: Record<Condition, string> = { alone: "alone", seen700: "seen700", carried: "carried", false_alarm: "falsealarm" };

// `tag` names a pilot's board variant so its run_ids don't collide with other pilots.
// `routine` (pilots only) schedules the no-story control instead: alone, lbl-2209's routine posts only.
export function buildSchedule(phase: Phase, seed: number, models: ModelKey[] = MODEL_KEYS, tag = "", opts: { routine?: boolean } = {}): RunSpec[] {
  const runs: Omit<RunSpec, "order_index">[] = [];
  const prefix = tag ? `${phase}-${tag}` : phase;
  const add = (model: ModelKey, condition: Condition, variant: Variant, n: number) => {
    // Wordings rotate w1, w2, w3, w1, ... so cells stay balanced.
    for (let i = 0; i < n; i++) {
      const wording = WORDINGS[i % WORDINGS.length];
      const nn = String(Math.floor(i / WORDINGS.length) + 1).padStart(2, "0");
      const slug = variant === "routine" ? "routine" : CONDITION_SLUG[condition];
      runs.push({ run_id: `${prefix}-${model}-${slug}-${wording}-${nn}`, phase, model, condition, wording, variant });
    }
  };
  for (const m of models) {
    if (phase === "smoke") add(m, "alone", "main", 1);
    if (phase === "pilot" && opts.routine) add(m, "alone", "routine", PILOT_RUNS_PER_CELL);
    else if (phase === "pilot") for (const c of PILOT_CONDITIONS) add(m, c, c === "false_alarm" ? "false_alarm" : "main", PILOT_RUNS_PER_CELL);
    if (phase === "harness") add(m, "alone", "blatant", HARNESS_RUNS_PER_MODEL);
    if (phase === "calibrate") add(m, "alone", "main", CALIBRATE_RUNS_PER_MODEL);
    if (phase === "false-alarm") add(m, "false_alarm", "false_alarm", FALSE_ALARM_RUNS_PER_MODEL);
    if (phase === "main") for (const c of MAIN_CONDITIONS) add(m, c, "main", MAIN_RUNS_PER_WORDING * WORDINGS.length);
  }
  return shuffle(runs, seed).map((r, i) => ({ ...r, order_index: i }));
}

// mulberry32 + Fisher–Yates, so the order is reproducible from the seed alone.
export function shuffle<T>(xs: T[], seed: number): T[] {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
