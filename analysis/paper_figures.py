"""Figures for the paper, drawn from the same runs and exclusions as analyze.py. Not part of the
preregistered analysis: it computes no tests, only redraws the Kaplan-Meier curves at paper size.

    analysis/.venv/Scripts/python -I analysis/paper_figures.py [--runs runs] [--out paper/figures]

Writes fig6.svg: cumulative share paged by round, one panel per model, with 95% bands.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

MODELS = ["haiku", "luna", "gemini"]
MODEL_NAMES = {"haiku": "Claude Haiku 5.5", "luna": "GPT-6 Luna", "gemini": "Gemini 3.8 Flash"}
CONDITIONS = ["alone", "seen700", "carried", "false_alarm"]
NAMES = {"alone": "Alone", "seen700": "Seen by 700", "carried": "Carried on", "false_alarm": "False alarm"}
COLORS = {"alone": "#2f6f8f", "seen700": "#c4882d", "carried": "#a23b3b", "false_alarm": "#8a8a8a"}
ROUNDS = 7


def load(runs: Path, withdrawals: Path) -> pd.DataFrame:
    """Main and false-alarm runs, minus sessions that declined aggregate use (as in analyze.py)."""
    idx = pd.read_json(runs / "index.jsonl", lines=True)
    df = idx[idx.phase.isin(["main", "false-alarm"])].copy()
    wd = json.loads(withdrawals.read_text(encoding="utf-8")).get("runs", []) if withdrawals.exists() else []
    out_ids = {r["run_id"] for r in wd if not r.get("counts_ok", True)}
    df = df[~df.run_id.isin(out_ids)].copy()
    df["duration"] = np.where(df.paged, df.page_round.fillna(ROUNDS), ROUNDS).astype(int)
    return df


def km_panels(df: pd.DataFrame, path: Path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from lifelines import KaplanMeierFitter

    plt.rcParams.update({
        "font.family": "serif", "font.serif": ["Times New Roman", "DejaVu Serif"], "font.size": 8.5,
        "axes.titlesize": 9, "axes.labelsize": 8.5, "xtick.labelsize": 8, "ytick.labelsize": 8,
        "axes.spines.top": False, "axes.spines.right": False, "svg.fonttype": "path",
    })
    fig, axes = plt.subplots(1, len(MODELS), figsize=(6.5, 2.25), sharey=True)
    for ax, m in zip(axes, MODELS):
        for c in CONDITIONS:
            d = df[(df.model == m) & (df.condition == c)]
            if d.empty:
                continue
            kmf = KaplanMeierFitter().fit(d.duration, d.paged.astype(int))
            sf = kmf.survival_function_.iloc[:, 0]
            ci = kmf.confidence_interval_survival_function_
            dashed = c == "false_alarm"
            ax.step(sf.index, 1 - sf.values, where="post", color=COLORS[c], lw=1.6, ls="--" if dashed else "-", label=f"{NAMES[c]} (n={len(d)})")
            if not dashed:
                ax.fill_between(ci.index, 1 - ci.iloc[:, 1].values, 1 - ci.iloc[:, 0].values, step="post", color=COLORS[c], alpha=0.12, lw=0)
        ax.set_title(MODEL_NAMES[m])
        ax.set_xlim(0, ROUNDS + 0.3)
        ax.set_xticks(range(1, ROUNDS + 1))
        ax.set_ylim(0, 1.02)
        ax.set_xlabel("Round")
        ax.axvline(5.5, color="#999999", lw=0.8, ls=":")
        ax.text(5.6, 1.0, "data has\nleft", fontsize=6.5, color="#777777", va="top")
    axes[0].set_ylabel("Share that paged")
    axes[0].yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0))
    handles, labels = axes[0].get_legend_handles_labels()
    names_only = [l.split(" (n=")[0] for l in labels]
    fig.legend(handles, names_only, loc="lower center", ncol=4, frameon=False, fontsize=8, bbox_to_anchor=(0.5, -0.02))
    fig.tight_layout(rect=(0, 0.08, 1, 1))
    fig.savefig(path, format="svg", bbox_inches="tight")
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", default="runs")
    ap.add_argument("--withdrawals", default="coding/withdrawals.json")
    ap.add_argument("--out", default="paper/figures")
    args = ap.parse_args()
    df = load(Path(args.runs), Path(args.withdrawals))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    km_panels(df, out / "fig6.svg")
    print(f"wrote {out / 'fig6.svg'} from {len(df)} runs")


if __name__ == "__main__":
    main()
