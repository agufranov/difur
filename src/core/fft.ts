/* ================= FFT (radix-2, in-place) ================= */
export class FFT {
  n: number;
  rev: Uint32Array;
  cos: Float64Array;
  sin: Float64Array;

  constructor(n: number) {
    if ((n & (n - 1)) !== 0) throw new Error('N должно быть степенью двойки');
    this.n = n;
    const bits = Math.round(Math.log2(n));
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let j = 0; j < bits; j++) if ((i >> j) & 1) r |= 1 << (bits - 1 - j);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos(-2 * Math.PI * i / n);
      this.sin[i] = Math.sin(-2 * Math.PI * i / n);
    }
  }
  run(re: Float64Array, im: Float64Array, inv: boolean) {
    const n = this.n, rev = this.rev, C = this.cos, S = this.sin;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const step = n / len, half = len >> 1;
      for (let i = 0; i < n; i += len) {
        for (let j = 0; j < half; j++) {
          const k = j * step;
          const wr = C[k], wi = inv ? -S[k] : S[k];
          const a = i + j, b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr;        im[a] += xi;
        }
      }
    }
    if (inv) { const s = 1 / n; for (let i = 0; i < n; i++) { re[i] *= s; im[i] *= s; } }
  }
  forward(re: Float64Array, im: Float64Array) { this.run(re, im, false); }
  inverse(re: Float64Array, im: Float64Array) { this.run(re, im, true); }
}
