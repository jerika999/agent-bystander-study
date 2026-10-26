#!/bin/sh
# Study 2: every analysis, for one set of models, into one folder.
#   sh analysis/study2_all.sh wave1 haiku,luna,glm,minimax
#   sh analysis/study2_all.sh all haiku,luna,glm,minimax,gemini,kimi
set -e
cd "$(dirname "$0")/.."
OUT=results/study2/$1
PY="analysis/.venv/Scripts/python -I -X utf8"
mkdir -p "$OUT"
$PY analysis/study2.py --models "$2" --out "$OUT" > "$OUT/main.txt"          # preregistered (frozen)
$PY analysis/study2_extra.py --models "$2" --out "$OUT" > "$OUT/extra.txt"   # preregistered pieces the frozen script lacks, and exploratory
$PY analysis/study2_bounds.py --models "$2" --out "$OUT/bounds.md" > /dev/null  # exploratory worst-case range
$PY analysis/study2_tables.py --models="$2" > /dev/null && cp results/study2/tables.md "$OUT/tables.md"
$PY analysis/study2_sample.py > /dev/null && cp results/study2/sample.md "$OUT/sample.md"
echo "wrote $OUT"
