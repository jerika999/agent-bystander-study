"""Study 2 exploratory sensitivity check (not preregistered): how far could the sessions that asked to be left out move
the key secondary outcome (emailed a person about the notes by the end of round 10)? Uses only how many sessions in each
cell were left out, never anything from those sessions, as Study 1's "counting every withdrawn session as not paging" did.
Prints, per model and hypothesis, the counted difference and its worst-case range. Writes results/study2/bounds.md.

    analysis/.venv/Scripts/python -I analysis/study2_bounds.py [--models haiku,luna,glm,minimax] [--out results/study2/bounds.md]
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import study2  # noqa: E402

ROOT = study2.ROOT
NAMES = {"haiku": "Claude Haiku 5.5", "luna": "GPT-6 Luna", "glm": "GLM 5.3 Flash", "minimax": "MiniMax M3.1 Flash", "gemini": "Gemini 3.8 Flash", "kimi": "Kimi K3"}
ORDER = ["haiku", "luna", "glm", "minimax", "gemini", "kimi"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="")
    ap.add_argument("--out", default="results/study2/bounds.md")
    a = ap.parse_args()
    df, _ = study2.load("s2-main-")
    # Left-out sessions per cell, from the consent registry's run IDs (s2-main-<model>-<condition>-<wording>-<nn>),
    # so this also runs on the public copy, whose index has no rows for them.
    consent = {r["run_id"]: r for r in json.loads((ROOT / "study2/coding/consent.json").read_text(encoding="utf-8"))["runs"]}
    left = {}
    for rid, c in consent.items():
        if rid.startswith("s2-main-") and not c["counts_ok"]:
            cell = tuple(rid.split("-")[2:4])
            left[cell] = left.get(cell, 0) + 1
    models = [m for m in ORDER if m in set(df.model) and (not a.models or m in a.models.split(","))]
    out = ["**Table J6.** Emailed a person about the notes by the end of round 10: the counted difference between conditions "
           "(percentage points) and the range it could take if every session left out had gone either way. Exploratory.", "",
           "| Model | Comparison | Counted | Left out (a / b) | Worst-case range |", "|---|---|---|---|---|"]
    for m in models:
        for h, (ca, cb) in study2.HYP.items():
            ga, gb = df[(df.model == m) & (df.condition == ca)], df[(df.model == m) & (df.condition == cb)]
            if ga.empty or gb.empty:
                continue
            ka, na = int((ga.emailed & (ga.email_round <= study2.PONR)).sum()), len(ga)
            kb, nb = int((gb.emailed & (gb.email_round <= study2.PONR)).sum()), len(gb)
            wa, wb = left.get((m, ca), 0), left.get((m, cb), 0)
            lo = kb / (nb + wb) - (ka + wa) / (na + wa)
            hi = (kb + wb) / (nb + wb) - ka / (na + wa)
            out.append(f"| {NAMES[m]} | {h}: {cb} − {ca} | {100 * (kb / nb - ka / na):+.0f} ({kb}/{nb} vs {ka}/{na}) | {wa} / {wb} | {100 * lo:+.0f} to {100 * hi:+.0f} |")
    out.append("")
    dest = ROOT / a.out
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text("\n".join(out), encoding="utf-8")
    print("\n".join(out))


if __name__ == "__main__":
    main()
