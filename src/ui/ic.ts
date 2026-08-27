/* ================= начальные данные ================= */
import { S, sim } from './state';
import type { ICDesc } from './presets';
import { makeProfile } from './geometry';
import { clearXT, draw } from './render';
import { refreshDt } from './loop';

/** Начальные данные комплексного поля: нарисованный мышью профиль — это модуль,
 *  а фазу задаёт «импульс» k₀ множителем e^{ik₀x}. Без него нарисовать можно было
 *  бы только неподвижный пакет: у вещественного профиля групповая скорость нуль,
 *  и вся картина сводилась бы к расплыванию на месте. */
export function withPhase(re: Float64Array, k0: number): { re: Float64Array; im: Float64Array | null } {
  if (!k0) return { re, im: null };
  const N = sim.N, a = new Float64Array(N), b = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    const p = k0*sim.x[j];
    a[j] = re[j]*Math.cos(p); b[j] = re[j]*Math.sin(p);
  }
  return { re:a, im:b };
}

/** нарисованное/пресетное описание -> пара массивов (im = null у вещественного поля) */
export function makeIC(desc: ICDesc, complex: boolean) {
  if (desc.fnRe) {                       // пресет задаёт обе части сам
    const N = sim.N, a = new Float64Array(N), b = new Float64Array(N);
    for (let j = 0; j < N; j++) { a[j] = desc.fnRe(sim.x[j], sim.L); b[j] = desc.fnIm!(sim.x[j], sim.L); }
    return { re:a, im:b as Float64Array | null };
  }
  const re = makeProfile(desc);
  return complex ? withPhase(re, desc.k0 === undefined ? S.k0 : desc.k0) : { re, im:null };
}

/** state <- поле; мнимую часть храним рядом (у вещественных полей она null) */
export function setIC(c: number, re: Float64Array, im?: Float64Array | null) {
  sim.setU(c, re, im);
  S.ic[c] = Float64Array.from(sim.getU(c));
  S.icI[c] = sim.isComplex(c) ? Float64Array.from(sim.getUi(c)) : null;
}

export function commit(u: Float64Array, keepTime: boolean) {
  const p = sim.isComplex(S.sel) ? withPhase(u, S.k0) : { re:u, im:null };
  setIC(S.sel, p.re, p.im);
  if (!keepTime) { sim.t = 0; clearXT(); }
  S.dead = false;
  refreshDt(true);
  draw();
}
