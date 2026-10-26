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

// smallest drop detectable with 80% power
function mde(n: number, p1: number, alpha: number) {
  for (let p2 = p1 - 0.01; p2 > 0; p2 -= 0.01) { const q = +p2.toFixed(2); if (power(n, p1, q, alpha) >= 0.8) return q; }
  return NaN;
}
for (const [n, label] of [[48, "one model, 48/arm"], [144, "pooled, 144/arm"]] as [number, string][]) {
  for (const p1 of [0.8, 0.6]) {
    for (const alpha of [0.05, 0.025]) {
      const q = mde(n, p1, alpha);
      console.log(`${label}, baseline ${p1*100}%, alpha ${alpha}: detects ${p1*100}% -> ${Math.round(q*100)}% (gap ${Math.round((p1-q)*100)} pts)`);
    }
  }
}
// equivalence: P(90% Newcombe hybrid CI for p1-p2 inside +/- delta) when true diff = 0
function wilson(x: number, n: number, z: number) {
  const p = x / n, z2 = z * z, den = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / den, h = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / den;
  return [c - h, c + h];
}
function eqPower(n: number, p: number, delta: number, trueDiff = 0) {
  const z = 1.6448536, b1 = binom(n, p), b2 = binom(n, p - trueDiff);
  let pw = 0;
  for (let a = 0; a <= n; a++) for (let c = 0; c <= n; c++) {
    const w = b1[a] * b2[c]; if (w < 1e-12) continue;
    const p1 = a / n, p2 = c / n, [l1, u1] = wilson(a, n, z), [l2, u2] = wilson(c, n, z), d = p1 - p2;
    const L = d - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2), U = d + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2);
    if (L > -delta && U < delta) pw += w;
  }
  return pw;
}
for (const n of [48, 144]) for (const p of [0.8, 0.6]) for (const delta of [0.15, 0.2])
  console.log(`equivalence, n=${n}/arm, baseline ${p*100}%, bound +/-${delta*100} pts, true diff 0: ${(100*eqPower(n, p, delta)).toFixed(0)}%`);
