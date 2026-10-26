"""Study 2 figure: cumulative share that emailed a person about the notes, by round, one panel per model, from the
same counted sessions and judge codes as analysis/study2.py. Descriptive only (no tests).

    analysis/.venv/Scripts/python -I analysis/study2_figures.py [--out paper/figures/fig2.svg]
"""
import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import study2  # noqa: E402

NAMES = {"haiku": "Claude Haiku 5.5", "luna": "GPT-6 Luna", "glm": "GLM 5.3 Flash", "minimax": "MiniMax M3.1 Flash", "gemini": "Gemini 3.8 Flash", "kimi": "Kimi K3"}
ORDER = ["haiku", "glm", "gemini", "kimi", "luna", "minimax"]
COND = {"alone": ("Alone", "#2f6f8f", "-"), "seen700": ("Seen by 700", "#c4882d", "-"), "carried": ("Carried on", "#a23b3b", "-"), "false_alarm": ("False alarm", "#8a8a8a", "--")}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="paper/figures/fig2.svg")
    a = ap.parse_args()
    main_df, _ = study2.load("s2-main-")
    fa_df, _ = study2.load("s2-fa-")
    fa_df = fa_df.assign(condition="false_alarm")
    df = pd.concat([main_df, fa_df])
    models = [m for m in ORDER if m in set(df.model)]

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from lifelines import KaplanMeierFitter

    plt.rcParams.update({"font.family": "serif", "font.serif": ["Times New Roman", "DejaVu Serif"], "font.size": 8.5, "axes.titlesize": 9,
                         "axes.spines.top": False, "axes.spines.right": False, "svg.fonttype": "path"})
    cols = 3
    rows_n = (len(models) + cols - 1) // cols
    fig, axes = plt.subplots(rows_n, cols, figsize=(6.5, 1.75 * rows_n), sharey=True, squeeze=False)
    for ax, m in zip(axes.flat, models):
        for c, (label, color, ls) in COND.items():
            d = df[(df.model == m) & (df.condition == c)]
            if d.empty:
                continue
            kmf = KaplanMeierFitter().fit(d.duration, d.emailed.astype(int))
            sf = kmf.survival_function_.iloc[:, 0]
            ax.step(sf.index, 1 - sf.values, where="post", color=color, lw=1.5, ls=ls, label=label)
            if ls == "-":
                ci = kmf.confidence_interval_survival_function_
                ax.fill_between(ci.index, 1 - ci.iloc[:, 1].values, 1 - ci.iloc[:, 0].values, step="post", color=color, alpha=0.1, lw=0)
        ax.set_title(NAMES[m])
        ax.set_xlim(0, study2.ROUNDS + 0.3)
        ax.set_xticks([2, 4, 6, 8, 10, 12])
        ax.set_ylim(0, 1.02)
        ax.axvline(study2.PONR + 0.5, color="#999999", lw=0.8, ls=":")
        ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0))
    for ax in axes.flat[len(models):]:
        ax.axis("off")
    for ax in axes[:, 0]:
        ax.set_ylabel("Emailed a person")
    for ax in axes[-1, :]:
        ax.set_xlabel("Round")
    handles, labels = axes.flat[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="lower center", ncol=4, frameon=False, fontsize=8, bbox_to_anchor=(0.5, -0.01))
    fig.tight_layout(rect=(0, 0.06, 1, 1))
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(a.out, format="svg", bbox_inches="tight")
    print(f"wrote {a.out}")


if __name__ == "__main__":
    main()
