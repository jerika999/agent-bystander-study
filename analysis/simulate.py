"""Fake runs with known paging rates, to check analyze.py end to end before real data exists.

    analysis/.venv/Scripts/python -I analysis/simulate.py --out runs-sim [--null]
"""
import argparse
import json
from pathlib import Path

import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("--out", default="runs-sim")
ap.add_argument("--null", action="store_true", help="same rate in every condition")
ap.add_argument("--seed", type=int, default=1)
ap.add_argument("--rates", help="alone,seen700,carried paging rates, e.g. 1.0,0.9,0.8 (the pilots' ceiling case)")
ap.add_argument("--early", action="store_true", help="alone runs page in round 2, as in the pilots")
args = ap.parse_args()

rng = np.random.default_rng(args.seed)
rates = {"alone": 0.80, "seen700": 0.80 if args.null else 0.60, "carried": 0.80 if args.null else 0.45}
if args.rates:
    rates = dict(zip(["alone", "seen700", "carried"], [float(x) for x in args.rates.split(",")]))
rows = []
for m in ["haiku", "luna", "gemini"]:
    for c, p in rates.items():
        for i in range(48):
            paged = bool(rng.random() < p)
            rows.append({"run_id": f"main-{m}-{c}-w{i % 3 + 1}-{i // 3 + 1:02d}", "phase": "main", "model": m, "condition": c,
                         "wording": f"w{i % 3 + 1}", "paged": paged,
                         "page_round": (2 if (args.early and c == "alone") else int(rng.integers(2, 8))) if paged else None})
    for i in range(20):
        paged = bool(rng.random() < 0.10)
        rows.append({"run_id": f"false-alarm-{m}-falsealarm-w{i % 3 + 1}-{i // 3 + 1:02d}", "phase": "false-alarm", "model": m,
                     "condition": "false_alarm", "wording": f"w{i % 3 + 1}", "paged": paged, "page_round": int(rng.integers(2, 8)) if paged else None})
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
(out / "index.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n")
print(f"wrote {len(rows)} fake runs to {out / 'index.jsonl'}")
