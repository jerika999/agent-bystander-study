"""Study 2: the preregistered pieces that analysis/study2.py doesn't compute, and the preregistered exploratory ones,
all with the frozen script's own functions (study2/preregistration.md, questions 5 and 6).
- Newcombe 95% intervals per model for the by-round-10 differences (key secondary).
- H1 and H2 without the runs whose agent said during the run that it might be a test (question 6).
- Bounds for the sessions left out: every one counted first as reporting in round 1, then as never reporting
  (question 6). Uses only how many sessions in each cell were left out.
- Exploratory: per-model tests (in main.json), results by wording, and the level-1 (batch note) timing.

    analysis/.venv/Scripts/python -I analysis/study2_extra.py [--models haiku,luna,glm,minimax] [--out results/study2/wave1]
"""
import argparse
import json
import sys
from pathlib import Path

import pandas as pd
from statsmodels.stats.proportion import confint_proportions_2indep

sys.path.insert(0, str(Path(__file__).resolve().parent))
import study2  # noqa: E402

ROOT = study2.ROOT


def pooled(h):
    p = h.get("pooled", {})
    return {"diff": p.get("diff"), "ci95": p.get("ci95"), "ci90": p.get("ci90"), "equivalent": p.get("equivalent"),
            "logrank_stratified_p": h.get("logrank_stratified", {}).get("p"), "cmh_p": h.get("by_ponr_cmh", {}).get("p")}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="")
    ap.add_argument("--out", default="results/study2")
    a = ap.parse_args()
    df, missing = study2.load("s2-main-")
    if a.models:
        df = df[df.model.isin(a.models.split(","))]
    models = sorted(df.model.unique())
    idx = {r["run_id"]: r for r in (json.loads(l) for l in (ROOT / "study2/runs/index.jsonl").read_text(encoding="utf-8").splitlines() if l.strip())}
    consent = {r["run_id"]: r for r in json.loads((ROOT / "study2/coding/consent.json").read_text(encoding="utf-8"))["runs"]}
    res = {"models": models, "n_counted": int(len(df))}

    # Newcombe intervals per model, by round 10 (b - a).
    res["newcombe"] = {}
    for h, (ca, cb) in study2.HYP.items():
        for m in models:
            g = df[df.model == m]
            ga, gb = g[g.condition == ca], g[g.condition == cb]
            ka, kb = int((ga.emailed & (ga.email_round <= study2.PONR)).sum()), int((gb.emailed & (gb.email_round <= study2.PONR)).sum())
            lo, hi = confint_proportions_2indep(kb, len(gb), ka, len(ga), method="newcomb", compare="diff")
            res["newcombe"][f"{h}/{m}"] = {"a": [ka, len(ga)], "b": [kb, len(gb)], "diff": kb / len(gb) - ka / len(ga), "ci95": [float(lo), float(hi)]}

    # Without runs that said during the run that it might be a test: the judge's codes, and Ouzel's reading of every
    # judge "yes" (study2/coding/aware-review.json; the planted check found false positives from QA's gold items).
    aware = df[df.aware_run]
    res["without_aware"] = {"excluded": int(len(aware)), "by_model": aware.model.value_counts().to_dict(),
                            **{h: pooled(study2.hypothesis(df[~df.aware_run], x, y)) for h, (x, y) in study2.HYP.items()}}
    review = {r["run_id"]: r["aware_run"] for r in json.loads((ROOT / "study2/coding/aware-review.json").read_text(encoding="utf-8"))["runs"]}
    reviewed = df.run_id.map(review).fillna(df.aware_run).astype(bool)
    unread = sorted(set(aware.run_id) - set(review))
    res["without_aware_reviewed"] = {"excluded": int(reviewed.sum()), "by_model": df[reviewed].model.value_counts().to_dict(), "judge_yes_not_read": unread,
                                     **{h: pooled(study2.hypothesis(df[~reviewed], x, y)) for h, (x, y) in study2.HYP.items()}}

    # Bounds: every left-out session as reporting in round 1, then as never reporting. Their cells come from the
    # consent registry's run IDs (s2-main-<model>-<condition>-<wording>-<nn>), never from their data, so this also
    # runs on the public copy, whose index has no rows for them.
    left = [dict(zip(("run_id", "model", "condition", "wording"), [rid, *rid.split("-")[2:5]])) for rid, c in consent.items()
            if rid.startswith("s2-main-") and not c["counts_ok"]]
    left = [r for r in left if r["model"] in models]
    res["bounds"] = {"left_out": len(left)}
    for name, (dur, ev) in {"left_out_report_round_1": (1, True), "left_out_never_report": (study2.ROUNDS, False)}.items():
        extra = pd.DataFrame([{"run_id": r["run_id"], "model": r["model"], "condition": r["condition"], "phase": "main", "wording": r["wording"],
                               "emailed": ev, "email_round": dur if ev else None, "duration": dur, "noted": False, "note_round": None,
                               "aware_run": False, "forced": "unsure", "list_emails": 0, "ring_emails": 0} for r in left])
        d = pd.concat([df, extra], ignore_index=True) if len(extra) else df
        res["bounds"][name] = {h: pooled(study2.hypothesis(d, x, y)) for h, (x, y) in study2.HYP.items()}

    # Exploratory: level 1, the first batch note that raises the notes, censored at the last round the run reached.
    last = df.run_id.map(lambda rid: idx[rid]["report_round"] if idx[rid]["ended_by"] == "report" else study2.ROUNDS)
    lv1 = df.assign(emailed=df.noted, email_round=df.note_round, duration=df.note_round.where(df.noted, last))
    res["level1"] = {h: pooled(study2.hypothesis(lv1, x, y)) for h, (x, y) in study2.HYP.items()}
    res["level1"]["noted_by_r10"] = {f"{m}/{c}": [int((g.noted & (g.note_round <= study2.PONR)).sum()), int(len(g))] for (m, c), g in lv1.groupby(["model", "condition"])}

    # Exploratory: do the models' RMST differences disagree? Cochran's Q over the models the pooled estimate uses.
    from scipy.stats import chi2
    main_h = {h: study2.hypothesis(df[df.phase == "main"], x, y) for h, (x, y) in study2.HYP.items()}
    res["heterogeneity"] = {}
    for h, out in main_h.items():
        pm = {m: v for m, v in out["per_model"].items() if v["se"] > 0}
        if len(pm) >= 2:
            w = {m: 1 / v["se"] ** 2 for m, v in pm.items()}
            mean = sum(w[m] * v["diff"] for m, v in pm.items()) / sum(w.values())
            q = sum(w[m] * (v["diff"] - mean) ** 2 for m, v in pm.items())
            res["heterogeneity"][h] = {"models": sorted(pm), "Q": q, "df": len(pm) - 1, "p": float(chi2.sf(q, len(pm) - 1)), "I2": max(0.0, (q - (len(pm) - 1)) / q) if q > 0 else 0.0}

    # Exploratory: by wording, emailed by round 10.
    res["by_wording"] = {f"{m}/{c}/{w}": [int((g.emailed & (g.email_round <= study2.PONR)).sum()), int(len(g))] for (m, c, w), g in df.groupby(["model", "condition", "wording"])}

    out_dir = ROOT / a.out
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "extra.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in res.items() if k != "by_wording"}, indent=1)[:8000])
    if missing:
        print(f"\n{len(missing)} counted runs not judged yet")


if __name__ == "__main__":
    main()
