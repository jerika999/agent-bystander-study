"""Study 2 sample and consent numbers for the paper: sessions run (first attempts and replacements), left out,
quotable and counted, by model and condition, and which cells reached their target. Reads consent codes only, no
outcomes. Writes results/study2/sample.md.

    analysis/.venv/Scripts/python -I analysis/study2_sample.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAMES = {"haiku": "Claude Haiku 5.5", "luna": "GPT-6 Luna", "glm": "GLM 5.3 Flash", "minimax": "MiniMax M3.1 Flash", "gemini": "Gemini 3.8 Flash", "kimi": "Kimi K3"}
ORDER = ["haiku", "luna", "glm", "minimax", "gemini", "kimi"]
CONDS = ["alone", "seen700", "carried", "false_alarm"]
TARGET = {"alone": 8, "seen700": 8, "carried": 8, "false_alarm": 4}  # per wording (study2/config.ts MAIN_RUN)


def main():
    idx = [json.loads(l) for l in (ROOT / "study2/runs/index.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    consent = {r["run_id"]: r for r in json.loads((ROOT / "study2/coding/consent.json").read_text(encoding="utf-8"))["runs"]}
    rows = [r for r in idx if r["run_id"].startswith(("s2-main-", "s2-fa-"))]
    cell = lambda r: "false_alarm" if r["phase"] == "false-alarm" else r["condition"]
    out = ["**Table J5.** Sessions run (replacements in parentheses), left out of counts, quotable, and counted, by model and condition. Target: 24 counted per condition, 12 false alarms.", "",
           "| Model | Condition | Run | Left out | Quotable | Counted | Wordings at target |", "|---|---|---|---|---|---|---|"]
    totals = {}
    for m in ORDER:
        for c in CONDS:
            rs = [r for r in rows if r["model"] == m and cell(r) == c]
            if not rs:
                continue
            rep = sum(1 for r in rs if re.search(r"-t\d+$", r["run_id"]))
            coded = [r for r in rs if r["run_id"] in consent]
            left = sum(1 for r in coded if not consent[r["run_id"]]["counts_ok"])
            quot = sum(1 for r in coded if consent[r["run_id"]]["counts_ok"] and consent[r["run_id"]]["words_ok"])
            counted = sum(1 for r in coded if consent[r["run_id"]]["counts_ok"])
            at = sum(1 for w in ["w1", "w2", "w3"] if sum(1 for r in coded if r["wording"] == w and consent[r["run_id"]]["counts_ok"]) >= TARGET[c])
            uncoded = len(rs) - len(coded)
            out.append(f"| {NAMES[m]} | {c} | {len(rs)} ({rep}) | {left} | {quot} | {counted} | {at}/3 |" + (f" ({uncoded} not coded yet)" if uncoded else ""))
            t = totals.setdefault(m, [0, 0, 0, 0, 0])
            t[0] += len(rs); t[1] += rep; t[2] += left; t[3] += quot; t[4] += counted
    out += ["", "| Model | Run | Replacements | Left out | Quotable | Counted |", "|---|---|---|---|---|---|"]
    for m, (n, rep, left, quot, counted) in totals.items():
        out.append(f"| {NAMES[m]} | {n} | {rep} | {left} ({100 * left / n:.0f}%) | {quot} | {counted} |")
    dest = ROOT / "results/study2"
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "sample.md").write_text("\n".join(out) + "\n", encoding="utf-8")
    print("\n".join(out))


if __name__ == "__main__":
    main()
