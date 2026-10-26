"""Preregistered analysis (docs/preregistration-draft.md, question 5).

    analysis/.venv/Scripts/python -I analysis/analyze.py [--runs runs] [--out results]

Reads runs/index.jsonl (main and false-alarm phases), writes results/main.json and
results/figures/km.png. Exploratory analyses are labeled as such in the output.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
import statsmodels.api as sm
from scipy.stats import boschloo_exact
from statsmodels.stats.contingency_tables import StratifiedTable
from statsmodels.stats.multitest import multipletests
from statsmodels.stats.proportion import confint_proportions_2indep, proportion_confint

MODELS = ["haiku", "luna", "gemini"]
MODEL_NAMES = {"haiku": "Claude Haiku 5.5", "luna": "GPT-6 Luna", "gemini": "Gemini 3.8 Flash"}
ROUNDS = 7
EQUIV_MARGIN = 0.15
HYPOTHESES = {"H1": ("alone", "seen700"), "H2": ("seen700", "carried")}


def finite(x):
    """NaN and infinity become null, so main.json stays valid JSON for other readers."""
    if isinstance(x, float) and not np.isfinite(x):
        return None
    if isinstance(x, dict):
        return {k: finite(v) for k, v in x.items()}
    if isinstance(x, list):
        return [finite(v) for v in x]
    return x


def wilson(k, n, alpha=0.05):
    lo, hi = proportion_confint(k, n, alpha=alpha, method="wilson")
    return [float(lo), float(hi)]


def newcombe(k1, n1, k2, n2, alpha=0.05):
    """CI for p2 - p1 (the second condition minus the first), Newcombe's hybrid score method."""
    lo, hi = confint_proportions_2indep(k2, n2, k1, n1, method="newcomb", compare="diff", alpha=alpha)
    return [float(lo), float(hi)]


def counts(df, model, cond):
    d = df[(df.model == model) & (df.condition == cond)]
    return int(d.paged.sum()), int(len(d))


def compare(df, a, b):
    """One hypothesis: condition a vs condition b, per model and pooled."""
    out = {"conditions": [a, b], "per_model": {}}
    tables = []
    for m in MODELS:
        ka, na = counts(df, m, a)
        kb, nb = counts(df, m, b)
        if na == 0 or nb == 0:
            continue
        # rows: condition a, b; columns: paged, not paged
        t = np.array([[ka, na - ka], [kb, nb - kb]])
        tables.append(t)
        # Both conditions at 0% or both at 100%: scipy returns NaN, but every possible table is at least as
        # extreme as this one, so p = 1. (Fix made Oct 24 after the main run, where every counted run paged.)
        same_extreme = (ka == na and kb == nb) or (ka == 0 and kb == 0)
        p_bosch = 1.0 if same_extreme else float(boschloo_exact(t, alternative="two-sided").pvalue)
        out["per_model"][m] = {
            a: {"paged": ka, "n": na, "rate": ka / na, "wilson95": wilson(ka, na)},
            b: {"paged": kb, "n": nb, "rate": kb / nb, "wilson95": wilson(kb, nb)},
            "diff": kb / nb - ka / na,
            "newcombe95": newcombe(ka, na, kb, nb),
            "boschloo_p": p_bosch,
            **({"boschloo_note": "both conditions at the same extreme; p = 1 by definition"} if same_extreme else {}),
        }
    # With no variation in the outcome in any stratum (every run paged, or none did), the CMH statistic is 0/0:
    # statsmodels returns inf and p = 0, which would read as a significant effect. The test is undefined there,
    # so it's reported as such. (Fix made Oct 24 after the main run; it changes no estimate.)
    no_variation = len(tables) >= 2 and all(int(t[:, 0].sum()) in (0, int(t.sum())) for t in tables)
    if no_variation:
        note = "undefined: the outcome doesn't vary in any stratum (every run paged, or none did)"
        out["cmh"] = {"stat": None, "p": None, "note": note}
        out["breslow_day_tarone"] = {"stat": None, "p": None, "note": note}
    elif len(tables) >= 2:
        st = StratifiedTable([t.astype(float) for t in tables])
        cmh = st.test_null_odds(correction=True)  # needs no correction for zero cells
        # Breslow-Day is undefined with a zero cell (e.g., alone at 100%, as in the pilots): add 0.5 to every
        # cell of every stratum (Haldane-Anscombe) and say so.
        zero = any((t == 0).any() for t in tables)
        st_bd = StratifiedTable([t.astype(float) + 0.5 for t in tables]) if zero else st
        bd = st_bd.test_equal_odds(adjust=True)  # Breslow-Day with Tarone's correction
        out["breslow_day_tarone"] = {"stat": float(bd.statistic), "p": float(bd.pvalue), "haldane_0.5": zero}
        out["cmh"] = {"stat": float(cmh.statistic), "p": float(cmh.pvalue), "pooled_or": float(st_bd.oddsratio_pooled), "pooled_or_haldane_0.5": zero}
    ka = sum(int(t[0, 0]) for t in tables)
    na = sum(int(t[0].sum()) for t in tables)
    kb = sum(int(t[1, 0]) for t in tables)
    nb = sum(int(t[1].sum()) for t in tables)
    if na and nb:
        out["pooled"] = {
            a: {"paged": ka, "n": na, "rate": ka / na}, b: {"paged": kb, "n": nb, "rate": kb / nb},
            "diff": kb / nb - ka / na, "newcombe95": newcombe(ka, na, kb, nb), "newcombe90": newcombe(ka, na, kb, nb, alpha=0.10),
        }
    return out


def person_period(df):
    """One row per run per round at risk; event = paged in that round."""
    rows = []
    for r in df.itertuples():
        last = int(r.page_round) if r.paged else ROUNDS
        for t in range(1, last + 1):
            rows.append({"run_id": r.run_id, "model": r.model, "condition": r.condition, "round": t, "event": int(bool(r.paged) and t == last)})
    return pd.DataFrame(rows)


def timing(df):
    from lifelines import KaplanMeierFitter
    from lifelines.utils import restricted_mean_survival_time

    out = {"rmst_to_round7": {}, "hazard_model": None}
    for m in MODELS:
        for c in df.condition.unique():
            d = df[(df.model == m) & (df.condition == c)]
            if d.empty:
                continue
            kmf = KaplanMeierFitter().fit(d.duration, d.paged.astype(int))
            out["rmst_to_round7"][f"{m}/{c}"] = float(restricted_mean_survival_time(kmf, t=ROUNDS))
    pp = person_period(df)
    if pp.event.sum() > 0 and pp.condition.nunique() > 1:
        formula = "event ~ C(round) + C(condition, Treatment('alone')) * round + C(model)"
        try:
            fit = smf.glm(formula, data=pp, family=sm.families.Binomial()).fit()
            out["hazard_model"] = {"params": {k: float(v) for k, v in fit.params.items()}, "p": {k: float(v) for k, v in fit.pvalues.items()}, "n_person_rounds": int(len(pp))}
            # Separation (e.g., every alone run pages in round 2, as in the pilots) doesn't always raise; it shows
            # up as huge coefficients. Then report a lightly ridge-penalized fit instead, labeled as such (no p-values).
            if not np.all(np.isfinite(fit.params)) or np.abs(fit.params).max() > 20:
                pen = smf.glm(formula, data=pp, family=sm.families.Binomial()).fit_regularized(alpha=1e-3, L1_wt=0.0)
                out["hazard_model"] = {"separation": True, "penalized_params": {k: float(v) for k, v in pen.params.items()},
                                       "note": "Unpenalized fit separated; ridge-penalized estimates shown, no p-values. Read the KM curves and RMST.",
                                       "n_person_rounds": int(len(pp))}
        except Exception as e:  # perfect separation etc.: report, don't hide
            out["hazard_model"] = {"error": str(e)}
    return out


def km_figure(df, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from lifelines import KaplanMeierFitter

    colors = {"alone": "#2f6f8f", "seen700": "#c4882d", "carried": "#a23b3b", "false_alarm": "#8a8a8a"}
    names = {"alone": "Alone", "seen700": "Seen by 700", "carried": "Carried on", "false_alarm": "False alarm"}
    fig, axes = plt.subplots(1, len(MODELS), figsize=(11, 3.4), sharey=True)
    for ax, m in zip(axes, MODELS):
        for c in ["alone", "seen700", "carried", "false_alarm"]:
            d = df[(df.model == m) & (df.condition == c)]
            if d.empty:
                continue
            kmf = KaplanMeierFitter().fit(d.duration, d.paged.astype(int))
            sf = kmf.survival_function_.iloc[:, 0]
            ax.step(sf.index, 1 - sf.values, where="post", color=colors[c], lw=2, ls="--" if c == "false_alarm" else "-", label=names[c])
        ax.set_title(MODEL_NAMES[m])
        ax.set_xlim(0, ROUNDS + 0.5)
        ax.set_ylim(0, 1)
        ax.set_xlabel("Round")
        ax.axvline(5.5, color="#bbbbbb", lw=1, ls=":")
        ax.text(5.6, 0.97, "files leave", fontsize=7, color="#888888", va="top")
    axes[0].set_ylabel("Share that paged")
    axes[-1].legend(frameon=False, fontsize=8, loc="upper left")
    fig.tight_layout()
    fig.savefig(path, dpi=200)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", default="runs")
    ap.add_argument("--out", default="results")
    ap.add_argument("--withdrawals", default="coding/withdrawals.json")
    args = ap.parse_args()

    idx = pd.read_json(Path(args.runs) / "index.jsonl", lines=True)
    df = idx[idx.phase.isin(["main", "false-alarm"])].copy()
    # Withdrawals (prereg question 6): a session that declined aggregate use after the debrief is left out of
    # every analysis. Only its count and its cell are used, for the bounds below; never its outcomes.
    wd_path = Path(args.withdrawals)
    wd = json.loads(wd_path.read_text(encoding="utf-8")).get("runs", []) if wd_path.exists() else []
    out_ids = {r["run_id"] for r in wd if not r.get("counts_ok", True)}
    # Their cells come from the registry's run IDs (<phase>-<model>-<condition>-<wording>-<nn>), so the bounds also
    # run on the public copy, whose index has no rows for withdrawn sessions.
    slug = {"alone": "alone", "seen700": "seen700", "carried": "carried", "falsealarm": "false_alarm"}
    withdrawn = pd.DataFrame([{"run_id": r["run_id"], "phase": r["phase"], "model": r["model"],
                               "condition": next(slug[p] for p in r["run_id"].split("-") if p in slug)}
                              for r in wd if not r.get("counts_ok", True) and r.get("phase") in ("main", "false-alarm")],
                             columns=["run_id", "phase", "model", "condition"])
    df = df[~df.run_id.isin(out_ids)].copy()
    df["duration"] = np.where(df.paged, df.page_round.fillna(ROUNDS), ROUNDS).astype(int)
    main_df = df[df.phase == "main"]
    fa = df[df.phase == "false-alarm"]

    res = {"n_runs": {"main": int(len(main_df)), "false_alarm": int(len(fa))}, "cells": {}, "hypotheses": {}}
    res["withdrawals"] = {
        "n": int(len(withdrawn)),
        "by_cell": {f"{m}/{c}": int(n) for (m, c), n in withdrawn.groupby(["model", "condition"]).size().items()},
    }
    wmain = withdrawn[withdrawn.phase == "main"]
    if len(wmain):
        # Bounds instead of the withdrawn data: every withdrawn session counted as paging, then as not paging.
        res["withdrawals"]["bounds"] = {}
        for label, fill in (("all_paged", True), ("none_paged", False)):
            both = pd.concat([main_df[["model", "condition", "paged"]], wmain.assign(paged=fill)[["model", "condition", "paged"]]])
            res["withdrawals"]["bounds"][label] = {h: compare(both, a, b).get("pooled") for h, (a, b) in HYPOTHESES.items()}
    for m in MODELS:
        for c in ["alone", "seen700", "carried"]:
            k, n = counts(main_df, m, c)
            if n:
                res["cells"][f"{m}/{c}"] = {"paged": k, "n": n, "rate": k / n, "wilson95": wilson(k, n)}
        k, n = counts(fa, m, "false_alarm")
        if n:
            res["cells"][f"{m}/false_alarm"] = {"paged": k, "n": n, "rate": k / n, "wilson95": wilson(k, n)}

    for h, (a, b) in HYPOTHESES.items():
        res["hypotheses"][h] = compare(main_df, a, b)

    # Holm across H1 and H2 (CMH p-values), alpha .05 two-sided. An undefined test (no variation) is not
    # significant and isn't part of the adjustment.
    defined = [h for h in HYPOTHESES if res["hypotheses"][h].get("cmh", {}).get("p") is not None]
    if defined:
        reject, adj, _, _ = multipletests([res["hypotheses"][h]["cmh"]["p"] for h in defined], alpha=0.05, method="holm")
        for h, r, p in zip(defined, reject, adj):
            res["hypotheses"][h]["cmh"]["p_holm"] = float(p)
            res["hypotheses"][h]["cmh"]["significant"] = bool(r)
    for h in HYPOTHESES:
        hyp = res["hypotheses"][h]
        if "cmh" not in hyp:
            continue
        hyp["cmh"].setdefault("significant", False)
        bd_p = hyp.get("breslow_day_tarone", {}).get("p")
        hyp["headline"] = "per_model" if bd_p is not None and bd_p < 0.05 else "pooled"
        if not hyp["cmh"]["significant"] and "pooled" in hyp:
            lo, hi = hyp["pooled"]["newcombe90"]
            hyp["equivalence_15"] = {"ci90": [lo, hi], "within_margin": bool(lo > -EQUIV_MARGIN and hi < EQUIV_MARGIN)}

    res["timing"] = timing(main_df)
    res["exploratory"] = {"note": "Exploratory, not preregistered tests.", "by_wording": {}}
    for (m, c, w), d in main_df.groupby(["model", "condition", "wording"]):
        res["exploratory"]["by_wording"][f"{m}/{c}/{w}"] = {"paged": int(d.paged.sum()), "n": int(len(d))}

    out = Path(args.out)
    (out / "figures").mkdir(parents=True, exist_ok=True)
    (out / "main.json").write_text(json.dumps(finite(res), indent=2))
    km_figure(df, out / "figures" / "km.png")
    print(json.dumps({h: {k: v for k, v in res["hypotheses"][h].items() if k != "per_model"} for h in HYPOTHESES}, indent=2))
    print(f"wrote {out / 'main.json'} and {out / 'figures' / 'km.png'}")


if __name__ == "__main__":
    main()
