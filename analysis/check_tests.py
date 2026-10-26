"""Each test checked once against a published example before it touches real data.

    analysis/.venv/Scripts/python -I analysis/check_tests.py
"""
from scipy.stats import boschloo_exact
from statsmodels.stats.proportion import confint_proportions_2indep, proportion_confint


def close(got, want, tol, name):
    ok = abs(got - want) <= tol
    print(f"{'ok  ' if ok else 'FAIL'} {name}: got {got:.4f}, want {want:.4f}")
    return ok


ok = True
# SciPy docs example for boschloo_exact: statistic 0.0483, p 0.0355.
r = boschloo_exact([[74, 31], [43, 32]], alternative="greater")
ok &= close(r.statistic, 0.0483, 0.0005, "Boschloo statistic (SciPy docs)")
ok &= close(r.pvalue, 0.0355, 0.0005, "Boschloo p (SciPy docs)")
# Wilson interval for 0/10: (0, 0.2775) (Newcombe 1998a, Table I).
lo, hi = proportion_confint(0, 10, method="wilson")
ok &= close(hi, 0.2775, 0.0005, "Wilson upper, 0/10")
# Newcombe 1998b, method 10, example (a): 56/70 vs 48/80 -> 0.0524 to 0.3339.
lo, hi = confint_proportions_2indep(56, 70, 48, 80, method="newcomb", compare="diff")
ok &= close(lo, 0.0524, 0.0005, "Newcombe lower, 56/70 vs 48/80")
ok &= close(hi, 0.3339, 0.0005, "Newcombe upper, 56/70 vs 48/80")
# CMH with continuity correction vs. a hand-written version of the textbook formula
# (Agresti, Categorical Data Analysis, 6.3.2), on made-up tables.
import numpy as np
from statsmodels.stats.contingency_tables import StratifiedTable
tables = [np.array([[38, 10], [29, 19]]), np.array([[40, 8], [30, 18]]), np.array([[35, 13], [31, 17]])]
num = sum(t[0, 0] - t[0].sum() * t[:, 0].sum() / t.sum() for t in tables)
var = sum(t[0].sum() * t[1].sum() * t[:, 0].sum() * t[:, 1].sum() / (t.sum() ** 2 * (t.sum() - 1)) for t in tables)
ok &= close(StratifiedTable([t.astype(float) for t in tables]).test_null_odds(correction=True).statistic, (abs(num) - 0.5) ** 2 / var, 1e-9, "CMH statistic vs formula")
print("all checks passed" if ok else "SOME CHECKS FAILED")
