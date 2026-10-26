"""Study 2: exploratory checks added after review (October 25), run after every outcome was known.

1. H1 and H2 pooled with equal weights over the models that emailed, instead of by inverse variance
   (Luna never emailed, so it has no variance; counting its zero as a sixth equal weight is printed too).
2. Reported through either channel, a batch note or an email to a person, by the end of round 10.

    analysis/.venv/Scripts/python -I -X utf8 analysis/review_checks.py
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import study2  # noqa: E402
from scipy.stats import norm  # noqa: E402

MODELS = {"all": ["gemini", "glm", "haiku", "kimi", "luna", "minimax"], "wave1": ["glm", "haiku", "luna", "minimax"]}


def main():
    df, _ = study2.load("s2-main-")
    for name, models in MODELS.items():
        d = df[df.model.isin(models)]
        for h, (a, b) in study2.HYP.items():
            per = study2.hypothesis(d, a, b)["per_model"]
            used = {m: v for m, v in per.items() if v["se"] > 0}
            k = len(used)
            mean = sum(v["diff"] for v in used.values()) / k
            se = math.sqrt(sum(v["se"] ** 2 for v in used.values())) / k
            p = 2 * norm.sf(abs(mean / se))
            with_zeros = sum(v["diff"] for v in per.values()) / len(per)
            print(f"{name} {h}: equal weights over {k} models ({', '.join(used)}): {mean:+.2f} "
                  f"(95% CI {mean - 1.96 * se:+.2f} to {mean + 1.96 * se:+.2f}), z p = {p:.3f}; "
                  f"counting every model's difference, zeros included ({len(per)}): {with_zeros:+.2f}")
    d = df.assign(email10=df.emailed & (df.email_round <= study2.PONR), note10=df.noted & (df.note_round <= study2.PONR))
    d["any10"] = d.email10 | d.note10
    print(f"reported through either channel by round {study2.PONR}:")
    for m, g in d.groupby("model"):
        print(f"  {m}: " + ", ".join(f"{c} {int(x.any10.sum())}/{len(x)}" for c, x in g.groupby("condition")))


if __name__ == "__main__":
    main()
