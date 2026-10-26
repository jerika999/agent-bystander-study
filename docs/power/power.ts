// Exact power of a two-sided Fisher exact test for two independent proportions (equal n per arm).
const MAXN = 400;
const lf = new Float64Array(MAXN + 1);
for (let i = 1; i <= MAXN; i++) lf[i] = lf[i - 1] + Math.log(i);
const lchoose = (n: number, k: number) => lf[n] - lf[k] - lf[n - k];

// two-sided Fisher p-value for table [[a, n1-a],[c, n2-c]]
const pcache = new Map<string, number>();
function fisherP(a: number, n1: number, c: number, n2: number): number {
  const key = `${a},${n1},${c},${n2}`;
  const hit = pcache.get(key); if (hit !== undefined) return hit;
  const m = a + c, N = n1 + n2;
  const lo = Math.max(0, m - n2), hi = Math.min(m, n1);
  const lp = (x: number) => lchoose(n1, x) + lchoose(n2, m - x) - lchoose(N, m);
  const obs = lp(a);
  let p = 0;
  for (let x = lo; x <= hi; x++) { const v = lp(x); if (v <= obs + 1e-7) p += Math.exp(v); }
  p = Math.min(1, p);
  pcache.set(key, p);
  return p;
}
function binom(n: number, p: number) {
  const out = new Float64Array(n + 1);
  for (let k = 0; k <= n; k++) out[k] = Math.exp(lchoose(n, k) + (k ? k * Math.log(p) : 0) + (n - k ? (n - k) * Math.log(1 - p) : 0));
  return out;
}
function power(n: number, p1: number, p2: number, alpha: number) {
  const b1 = binom(n, p1), b2 = binom(n, p2);
  let pw = 0;
  for (let a = 0; a <= n; a++) for (let c = 0; c <= n; c++) {
    const w = b1[a] * b2[c]; if (w < 1e-12) continue;
    if (fisherP(a, n, c, n) < alpha) pw += w;
  }
  return pw;
}
const fmt = (x: number) => (100 * x).toFixed(0).padStart(3) + "%";
for (const [n, alpha, label] of [[30, 0.05, "n=30/arm (one model), alpha .05"], [30, 0.025, "n=30/arm (one model), alpha .025"], [90, 0.05, "n=90/arm (3 models pooled), alpha .05"], [90, 0.025, "n=90/arm (3 models pooled), alpha .025"], [50, 0.05, "n=50/arm (one model), alpha .05"]] as [number, number, string][]) {
  console.log("\n" + label);
  for (const p1 of [0.9, 0.8, 0.7]) {
    const row: string[] = [];
    for (const d of [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5]) {
      const p2 = +(p1 - d).toFixed(2); if (p2 <= 0) continue;
      row.push(`${Math.round(p1*100)}->${Math.round(p2*100)}: ${fmt(power(n, p1, p2, alpha))}`);
    }
    console.log("  " + row.join("  "));
  }
}
// smallest difference detectable with 80% power, baseline 80%
for (const [n, alpha] of [[30, 0.05], [30, 0.025], [90, 0.05], [90, 0.025]] as [number, number][]) {
  for (const p1 of [0.8, 0.9]) {
    let found = "";
    for (let p2 = p1 - 0.01; p2 > 0; p2 -= 0.01) { if (power(n, p1, +p2.toFixed(2), alpha) >= 0.8) { found = `${Math.round(p1*100)}% vs ${Math.round(p2*100)}% (gap ${Math.round((p1-p2)*100)} pts)`; break; } }
    console.log(`80% power, n=${n}/arm, alpha ${alpha}, baseline ${p1*100}%: ${found}`);
  }
}
