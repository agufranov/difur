/* ================= решатель =================
   ETDRK4 (Cox–Matthews / Kassam–Trefethen), покомпонентно диагональный.
   Границы периодические, нелинейность защищена фильтром 2/3. */
import { FFT } from './fft';
import { CFN, CT } from './complex';
import { phis } from './phis';
import { buildSystem } from './system';
import type { Model } from './types';

const F = (n: number) => new Float64Array(n);
type Bank = Float64Array[];

export interface PerComp { max: number; mass: number; energy: number; norm: number; complex: boolean }
export interface Diagnostics {
  t: number; per: PerComp[]; max: number; perStep: number; cfl: number;
  loss: number; finite: boolean;
}

export class Sim {
  N: number; L: number; dt: number; t: number;
  model: Model | null; M: number;
  smooth: number; smoothA: number; smoothM: number; loss: number;
  rho = 0;

  fft!: FFT;
  x!: Float64Array; k!: Float64Array; mask!: Float64Array;
  kmax!: number; eta!: Float64Array; hyp!: Float64Array; _hypM!: number;
  tr!: Float64Array; ti!: Float64Array;

  vr!: Bank; vi!: Bank;
  ar!: Bank; ai!: Bank; br!: Bank; bi!: Bank; cr!: Bank; ci_!: Bank;
  Nvr!: Bank; Nvi!: Bank; Nar!: Bank; Nai!: Bank;
  Nbr!: Bank; Nbi!: Bank; Ncr!: Bank; Nci!: Bank;
  U!: Bank; Ui!: Bank; OUT!: Bank; OUTi!: Bank;
  Er!: Bank; Ei!: Bank; E2r!: Bank; E2i!: Bank;
  Qr!: Bank; Qi!: Bank;
  f1r!: Bank; f1i!: Bank; f2r!: Bank; f2i!: Bank;
  f3r!: Bank; f3i!: Bank; Sr!: Bank; Si!: Bank;
  ikp!: { re: Float64Array; im: Float64Array }[][];
  D!: Float64Array[][]; Di!: Float64Array[][];

  constructor() {
    this.N = 512; this.L = 40; this.dt = 0.004; this.t = 0;
    this.model = null; this.M = 0;
    this.smooth = 0;                 // 0 — выкл; >0 — сила гашения осцилляций
    this.smoothA = 16; this.smoothM = 4;   // подобраны численно, см. docs/core.md
    this.loss = 0;                   // доля энергии, снятая фильтром за последний шаг
    this._grid();
  }

  _grid() {
    const N = this.N;
    this.fft = new FFT(N);
    this.x = F(N);
    for (let j = 0; j < N; j++) this.x[j] = -this.L/2 + j*this.L/N;
    this.k = F(N);
    this.mask = F(N);
    for (let j = 0; j < N; j++) {
      const n = j <= N/2 ? j : j - N;
      this.k[j] = 2*Math.PI*n/this.L;
      this.mask[j] = Math.abs(n) < N/3 ? 1 : 0;
    }
    this.k[N/2] = 0;
    this.kmax = 2*Math.PI*Math.floor(N/3)/this.L;
    this.eta = F(N); this.hyp = F(N); this._hypM = 0;
    for (let j = 0; j < N; j++) this.eta[j] = Math.min(1, Math.abs(this.k[j])/this.kmax);
    this.tr = F(N); this.ti = F(N);
  }

  /** выделить память под M компонент */
  _alloc(M: number) {
    const N = this.N;
    this.M = M;
    const mk = () => { const a: Bank = []; for (let c = 0; c < M; c++) a.push(F(N)); return a; };
    this.vr = mk(); this.vi = mk();
    this.ar = mk(); this.ai = mk(); this.br = mk(); this.bi = mk(); this.cr = mk(); this.ci_ = mk();
    this.Nvr = mk(); this.Nvi = mk(); this.Nar = mk(); this.Nai = mk();
    this.Nbr = mk(); this.Nbi = mk(); this.Ncr = mk(); this.Nci = mk();
    this.U = mk(); this.Ui = mk(); this.OUT = mk(); this.OUTi = mk();
    this.Er = mk(); this.Ei = mk(); this.E2r = mk(); this.E2i = mk();
    this.Qr = mk(); this.Qi = mk();
    this.f1r = mk(); this.f1i = mk(); this.f2r = mk(); this.f2i = mk();
    this.f3r = mk(); this.f3i = mk(); this.Sr = mk(); this.Si = mk();
  }

  resize(N: number, L: number) {
    this.N = N; this.L = L;
    this._grid();
    if (this.model) this.setSystem(this.model.source, this.model.params);
  }

  setSystem(text: string, params?: Record<string, number>) {
    const m = buildSystem(text, params);
    const N = this.N;
    const old = this.model ? this.U : null, oldComps = this.model ? this.model.comps : null;
    this.model = m;
    this._alloc(m.comps.length);

    // диагональные символы: c·(ik)^n, коэффициент c комплексный (у `i*uxx` он i)
    for (const c of m.comps) {
      const Sr = this.Sr[c.ci], Si = this.Si[c.ci];
      for (const l of c.linear)
        for (let j = 0; j < N; j++) {
          let pr = 1, pi = 0;
          for (let q = 0; q < l.n; q++) { const nr = -pi*this.k[j], ni = pr*this.k[j]; pr = nr; pi = ni; }
          Sr[j] += l.c.re*pr - l.c.im*pi; Si[j] += l.c.re*pi + l.c.im*pr;
        }
    }
    // (ik)^n для нужных производных
    this.ikp = [];
    for (const c of m.comps) {
      this.ikp[c.ci] = [];
      for (const n of c.orders) {
        const pr = F(N), pi = F(N);
        for (let j = 0; j < N; j++) {
          let ar = 1, ai = 0;
          for (let q = 0; q < n; q++) { const nr = -ai*this.k[j], ni = ar*this.k[j]; ar = nr; ai = ni; }
          pr[j] = ar; pi[j] = ai;
        }
        this.ikp[c.ci][n] = { re:pr, im:pi };
      }
    }
    // физические поля производных. `Di` заводится и для вещественных компонент,
    // но там остаётся нулём навсегда: у вещественного поля мнимая часть и есть
    // нуль, и код, который по ошибке в неё заглянет, прочитает правду, а не мусор
    this.D = m.comps.map(c => { const a: Float64Array[] = []; for (const n of c.orders) a[n] = F(N); return a; });
    this.Di = m.comps.map(c => { const a: Float64Array[] = []; for (const n of c.orders) a[n] = F(N); return a; });

    // перенос состояния со старой системы (совпадающие по имени компоненты)
    if (old) {
      for (const c of m.comps) {
        const j = oldComps!.findIndex(o => o.name === c.name);
        if (j >= 0 && old[j].length === N) this.setU(c.ci, old[j]);
      }
    }
    this._rho();
    this.setDt(this.dt);
    return m;
  }

  /** спектральный радиус явной линейной части (степенной метод по каждому k) */
  _rho() {
    const m = this.model!, M = this.M, N = this.N;
    this.rho = 0;
    if (!m.cross.length) return;
    const wr = new Float64Array(M), wi = new Float64Array(M);
    const yr = new Float64Array(M), yi = new Float64Array(M);
    const er = new Float64Array(m.cross.length), ei = new Float64Array(m.cross.length);
    const IT = 12;
    for (let j = 0; j < N; j++) {
      if (!this.mask[j]) continue;
      m.cross.forEach((e, q0) => {                       // c·(ik)^n
        let pr = 1, pi = 0;
        for (let q = 0; q < e.n; q++) { const nr = -pi*this.k[j], ni = pr*this.k[j]; pr = nr; pi = ni; }
        er[q0] = e.c.re*pr - e.c.im*pi; ei[q0] = e.c.re*pi + e.c.im*pr;
      });
      for (let c = 0; c < M; c++) { wr[c] = 1/(c+1); wi[c] = 0; }
      let g = 1, steps = 0;
      for (let it = 0; it < IT; it++) {
        yr.fill(0); yi.fill(0);
        m.cross.forEach((e, q0) => {
          yr[e.row] += er[q0]*wr[e.col] - ei[q0]*wi[e.col];
          yi[e.row] += er[q0]*wi[e.col] + ei[q0]*wr[e.col];
        });
        let nw = 0, ny = 0;
        for (let c = 0; c < M; c++) { nw += wr[c]*wr[c] + wi[c]*wi[c]; ny += yr[c]*yr[c] + yi[c]*yi[c]; }
        nw = Math.sqrt(nw); ny = Math.sqrt(ny);
        if (ny < 1e-300 || !isFinite(ny)) break;
        g *= ny/nw; steps++;
        for (let c = 0; c < M; c++) { wr[c] = yr[c]/ny; wi[c] = yi[c]/ny; }
      }
      if (steps) {
        const r = Math.pow(g, 1/steps);
        if (r > this.rho) this.rho = r;
      }
    }
  }

  setDt(dt: number) {
    this.dt = dt;
    const N = this.N;
    for (let c = 0; c < this.M; c++) {
      const Sr = this.Sr[c], Si = this.Si[c];
      for (let j = 0; j < N; j++) {
        const zr = dt*Sr[j], zi = dt*Si[j];
        const ex = Math.exp(zr), ex2 = Math.exp(zr/2);
        this.Er[c][j] = ex*Math.cos(zi);      this.Ei[c][j] = ex*Math.sin(zi);
        this.E2r[c][j] = ex2*Math.cos(zi/2);  this.E2i[c][j] = ex2*Math.sin(zi/2);
        const h = phis(zr/2, zi/2);
        this.Qr[c][j] = dt*0.5*h[0]; this.Qi[c][j] = dt*0.5*h[1];
        const p = phis(zr, zi);
        this.f1r[c][j] = dt*(p[0] - 3*p[2] + 4*p[4]); this.f1i[c][j] = dt*(p[1] - 3*p[3] + 4*p[5]);
        this.f2r[c][j] = dt*(p[2] - 2*p[4]);          this.f2i[c][j] = dt*(p[3] - 2*p[5]);
        this.f3r[c][j] = dt*(4*p[4] - p[2]);          this.f3i[c][j] = dt*(4*p[5] - p[3]);
      }
    }
  }

  /** мнимая часть начальных данных необязательна: у вещественного поля её нет */
  setU(c: number, arr: Float64Array | number[], arrIm?: Float64Array | number[] | null) {
    const N = this.N;
    this.vr[c].set(arr);
    if (arrIm) this.vi[c].set(arrIm); else this.vi[c].fill(0);
    this.fft.forward(this.vr[c], this.vi[c]);
    for (let j = 0; j < N; j++) { this.vr[c][j] *= this.mask[j]; this.vi[c][j] *= this.mask[j]; }
    this._sync(c);
  }
  /** Мнимую часть физического поля храним только у комплексных компонент.
      У вещественных она равна нулю математически, а численно там болтается
      мусор ~1e-17, и выбросить его — это проекция на инвариантное подпространство,
      а не потеря: ровно так решатель вёл себя до появления `i`, и все эталоны
      точности (КдФ 6e-9, ∫u dx на 1e-15) остаются те же бит в бит. */
  _sync(c: number) {
    this.tr.set(this.vr[c]); this.ti.set(this.vi[c]);
    this.fft.inverse(this.tr, this.ti);
    this.U[c].set(this.tr);
    if (this.model!.comps[c].complex) this.Ui[c].set(this.ti); else this.Ui[c].fill(0);
  }
  getU(c?: number) { return this.U[c || 0]; }
  getUi(c?: number) { return this.Ui[c || 0]; }
  isComplex(c?: number) { return !!this.model!.comps[c || 0].complex; }

  _explicit(vr: Bank, vi: Bank, outR: Bank, outI: Bank, T: number) {
    const N = this.N, m = this.model!;
    if (!m.nonlin) { for (let c = 0; c < this.M; c++) { outR[c].fill(0); outI[c].fill(0); } return; }
    for (const c of m.comps) {
      for (const n of c.orders) {
        const p = this.ikp[c.ci][n], ar = this.tr, ai = this.ti;
        const s = vr[c.ci], q = vi[c.ci];
        for (let j = 0; j < N; j++) {
          ar[j] = s[j]*p.re[j] - q[j]*p.im[j];
          ai[j] = s[j]*p.im[j] + q[j]*p.re[j];
        }
        this.fft.inverse(ar, ai);
        this.D[c.ci][n].set(ar);
        // у вещественной компоненты в `ai` болтается мусор ~1e-17; не переносить
        // его — та же проекция на инвариантное подпространство, что и в `_sync`
        if (c.complex) this.Di[c.ci][n].set(ai);
      }
    }
    m.nonlin(CFN, CT, this.D, this.Di, this.x, T, m.params, this.OUT, this.OUTi, N);
    for (const c of m.comps) {
      if (!c.hasExplicit) { outR[c.ci].fill(0); outI[c.ci].fill(0); continue; }
      outR[c.ci].set(this.OUT[c.ci]);
      if (c.complex) outI[c.ci].set(this.OUTi[c.ci]); else outI[c.ci].fill(0);
      this.fft.forward(outR[c.ci], outI[c.ci]);
      for (let j = 0; j < N; j++) { outR[c.ci][j] *= this.mask[j]; outI[c.ci][j] *= this.mask[j]; }
    }
  }

  step() {
    const N = this.N, dt = this.dt, t = this.t, M = this.M;
    this._explicit(this.vr, this.vi, this.Nvr, this.Nvi, t);
    for (let c = 0; c < M; c++)
      for (let j = 0; j < N; j++) {
        const er = this.E2r[c][j], ei = this.E2i[c][j], qr = this.Qr[c][j], qi = this.Qi[c][j];
        const vr = this.vr[c][j], vi = this.vi[c][j], nr = this.Nvr[c][j], ni = this.Nvi[c][j];
        this.ar[c][j] = er*vr - ei*vi + qr*nr - qi*ni;
        this.ai[c][j] = er*vi + ei*vr + qr*ni + qi*nr;
      }
    this._explicit(this.ar, this.ai, this.Nar, this.Nai, t + dt/2);
    for (let c = 0; c < M; c++)
      for (let j = 0; j < N; j++) {
        const er = this.E2r[c][j], ei = this.E2i[c][j], qr = this.Qr[c][j], qi = this.Qi[c][j];
        const vr = this.vr[c][j], vi = this.vi[c][j], nr = this.Nar[c][j], ni = this.Nai[c][j];
        this.br[c][j] = er*vr - ei*vi + qr*nr - qi*ni;
        this.bi[c][j] = er*vi + ei*vr + qr*ni + qi*nr;
      }
    this._explicit(this.br, this.bi, this.Nbr, this.Nbi, t + dt/2);
    for (let c = 0; c < M; c++)
      for (let j = 0; j < N; j++) {
        const er = this.E2r[c][j], ei = this.E2i[c][j], qr = this.Qr[c][j], qi = this.Qi[c][j];
        const ar = this.ar[c][j], ai = this.ai[c][j];
        const nr = 2*this.Nbr[c][j] - this.Nvr[c][j], ni = 2*this.Nbi[c][j] - this.Nvi[c][j];
        this.cr[c][j] = er*ar - ei*ai + qr*nr - qi*ni;
        this.ci_[c][j] = er*ai + ei*ar + qr*ni + qi*nr;
      }
    this._explicit(this.cr, this.ci_, this.Ncr, this.Nci, t + dt);
    for (let c = 0; c < M; c++) {
      for (let j = 0; j < N; j++) {
        const er = this.Er[c][j], ei = this.Ei[c][j];
        const vr = this.vr[c][j], vi = this.vi[c][j];
        const abr = this.Nar[c][j] + this.Nbr[c][j], abi = this.Nai[c][j] + this.Nbi[c][j];
        this.vr[c][j] = er*vr - ei*vi
          + this.f1r[c][j]*this.Nvr[c][j] - this.f1i[c][j]*this.Nvi[c][j]
          + 2*(this.f2r[c][j]*abr - this.f2i[c][j]*abi)
          + this.f3r[c][j]*this.Ncr[c][j] - this.f3i[c][j]*this.Nci[c][j];
        this.vi[c][j] = er*vi + ei*vr
          + this.f1r[c][j]*this.Nvi[c][j] + this.f1i[c][j]*this.Nvr[c][j]
          + 2*(this.f2r[c][j]*abi + this.f2i[c][j]*abr)
          + this.f3r[c][j]*this.Nci[c][j] + this.f3i[c][j]*this.Ncr[c][j];
      }
    }
    if (this.smooth > 0) this._damp();
    for (let c = 0; c < M; c++) this._sync(c);
    this.t += dt;
  }

  /** гашение осцилляций опрокидывания: гипервязкость в верхушке спектра.
      û *= exp(-dt·γ·η^{2m}),  η = |k|/kmax,  γ = A·max|u|/dx — скорость обхода
      ячейки. Шкала по dx и по амплитуде, поэтому от dt и от N результат не
      зависит, а разрешённое решение (у которого верхушка спектра пуста) остаётся
      на месте: k=0 не трогается вовсе, поэтому ∫u dx сохраняется точно.
      Сколько энергии снято — видно в `loss`: гашение не бесплатно и не должно
      быть незаметным. */
  _damp() {
    const N = this.N, dx = this.L/N;
    if (this._hypM !== this.smoothM) {
      this._hypM = this.smoothM;
      for (let j = 0; j < N; j++) this.hyp[j] = Math.pow(this.eta[j], 2*this.smoothM);
    }
    let U = 0;
    for (let c = 0; c < this.M; c++) {
      const u = this.U[c], w = this.Ui[c];             // амплитуда по модулю: у комплексного поля мнимая часть такая же полноправная
      for (let j = 0; j < N; j++) { const a = Math.hypot(u[j], w[j]); if (!(a <= U)) U = a; }
    }
    this.loss = 0;
    if (!(U > 0)) return;                       // пусто или уже NaN — гасить нечего
    const g = this.dt * this.smooth * this.smoothA * U / dx;
    let tot = 0, cut = 0;
    for (let j = 0; j < N; j++) {
      let e = 0;
      for (let c = 0; c < this.M; c++) e += this.vr[c][j]*this.vr[c][j] + this.vi[c][j]*this.vi[c][j];
      tot += e;
      const a = g*this.hyp[j];
      if (a < 1e-13) continue;
      const f = Math.exp(-a);
      cut += e*(1 - f*f);
      for (let c = 0; c < this.M; c++) { this.vr[c][j] *= f; this.vi[c][j] *= f; }
    }
    if (tot > 0) this.loss = cut/tot;
  }

  advance(n: number) { for (let i = 0; i < n; i++) this.step(); }

  diagnostics(): Diagnostics {
    const N = this.N, dx = this.L/N, per: PerComp[] = [];
    let gmax = 0, bad = false;
    for (let c = 0; c < this.M; c++) {
      const u = this.U[c], w = this.Ui[c], cx = this.model!.comps[c].complex;
      let mx = 0, mass = 0, e2 = 0;
      for (let j = 0; j < N; j++) {
        // у комплексной компоненты «величина» — это модуль; у вещественной
        // hypot(u,0) = |u|, поэтому ветка одна и прежние числа не меняются
        const a = cx ? Math.hypot(u[j], w[j]) : Math.abs(u[j]);
        if (!(a <= mx)) mx = a;            // NaN протаскивается: NaN>mx дало бы false
        mass += u[j]; e2 += a*a;
      }
      // norm = ∫|u|² dx. У Шрёдингера это сохраняющаяся норма — лучший индикатор
      // того, что счёт идёт правильно, поэтому её видно в легенде
      per.push({ max:mx, mass:mass*dx, energy:0.5*e2*dx, norm:e2*dx, complex:!!cx });
      // сравнения с NaN всегда ложны, поэтому здоровая компонента не должна
      // затирать разошедшуюся — держим отдельный флаг
      if (!(mx < Infinity)) bad = true;
      else if (mx > gmax) gmax = mx;
    }
    // насколько решение меняется за один шаг: dt·max|правая часть| / масштаб решения.
    // Универсальнее числа Куранта — оно осмысленно только для адвекции.
    let rhs = 0;
    if (this.model && this.model.nonlin)
      for (const c of this.model.comps) {
        if (!c.hasExplicit) continue;
        const o = this.OUT[c.ci], w = c.complex ? this.OUTi[c.ci] : null;
        for (let j = 0; j < N; j++) {
          const a = w ? Math.hypot(o[j], w[j]) : Math.abs(o[j]);
          if (!(a <= rhs)) rhs = a;
        }
      }
    return { t:this.t, per, max:bad ? NaN : gmax,
             perStep: bad ? NaN : this.dt*rhs/Math.max(gmax, 1e-9),
             cfl:(bad ? NaN : gmax)*this.dt/dx,
             // доля энергии, которую гашение снимает за единицу времени
             loss: this.smooth > 0 && this.dt > 0 ? this.loss/this.dt : 0,
             finite:!bad && gmax < 1e8 };
  }

  /** Предупреждение о некорректности задачи: рост символа должен УСИЛИВАТЬСЯ с k
      (обратная диффузия). Равномерный рост на всех k — это обычная реакция
      (например +u у Фишера или FitzHugh–Nagumo), задача корректна. */
  stabilityWarning(): { growth: number; comp: string } | null {
    let out: { growth: number; comp: string } | null = null;
    for (const c of this.model!.comps) {
      let hi = -Infinity, lo = -Infinity;
      for (let j = 0; j < this.N; j++) {
        if (!this.mask[j]) continue;
        const v = this.Sr[c.ci][j];
        if (Math.abs(this.k[j]) > this.kmax/2) { if (v > hi) hi = v; }
        else if (v > lo) lo = v;
      }
      if (hi > 1e-9 && hi > lo + 1e-9 && (!out || hi > out.growth))
        out = { growth:hi, comp:c.name };
    }
    return out;
  }

  /** ограничение шага явной части (RK4-подобное) */
  dtLimit() {
    return this.rho > 0 ? 2.2/this.rho : Infinity;
  }
}
