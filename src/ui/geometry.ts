/* ================= геометрия холста и профили инструментов ================= */
import type { Comp } from '../core';
import { COLORS, S, sim, topInset, view, viewL, wrapd } from './state';
import type { ICDesc } from './presets';

export const compColor = (c: Comp) => COLORS[sim.model!.fields.indexOf(c.f) % COLORS.length];

/* Холст показывает окно `viewL()` в центре кольца, а не всё кольцо: при
   `S.pad > 1` точки запаса отображаются за краями холста, и канва их отрезает
   сама. Верх холста при этом отдан радару — отсюда `topInset()` в u2py/py2u.
   Мышь ходит через те же функции, поэтому рисование попадает туда, куда
   показывает курсор, без отдельной поправки. */
export function x2px(x: number) { const L = viewL(); return (x + L/2) / L * view.PW; }
export function px2x(px: number) { const L = viewL(); return px / view.PW * L - L/2; }
export function u2py(u: number) {
  const t = topInset();
  return t + (S.yMax - u) / (S.yMax - S.yMin) * (view.PH - t);
}
export function py2u(py: number) {
  const t = topInset();
  return S.yMax - (py - t) / (view.PH - t) * (S.yMax - S.yMin);
}

/** индексы сетки, попавшие в окно показа: [j0, j1). При pad=1 — вся сетка */
export function viewRange(): [number, number] {
  const j0 = Math.ceil(sim.N*(1 - 1/S.pad)/2);
  return [j0, sim.N - j0];
}

export function profile(tool: string, x: number, x0: number, A: number, w: number,
                        edge: number, L: number): number {
  const d = wrapd(x - x0, L);
  switch (tool) {
    case 'sech':  { const c = Math.cosh(d/w); return A/(c*c); }
    case 'gauss': return A * Math.exp(-(d/w)*(d/w));
    case 'step':  return A * 0.5 * (Math.tanh((d + w)/edge) - Math.tanh((d - w)/edge));
    // длина волны отмеряется по окну, а не по кольцу: иначе включение запаса
    // растягивало бы синус вдвое, то есть подменяло бы задачу
    case 'sin':   { const V = viewL(), m = Math.max(1, Math.round(V/(2*w)));
                    return A*Math.cos(2*Math.PI*m*d/V); }
    case 'const': return A;
    default: return 0;
  }
}

export function makeProfile(desc: ICDesc): Float64Array {
  const N = sim.N, out = new Float64Array(N);
  const base = desc.base || 0;
  if (desc.fn) { for (let j = 0; j < N; j++) out[j] = desc.fn(sim.x[j], sim.L); return out; }
  if (desc.tool === 'noise') {
    for (let m = 1; m <= 8; m++) {
      const ph = Math.random()*2*Math.PI, a = desc.A!*(Math.random()*2-1)/m;
      // моды тоже по окну (см. `sin`): при pad=2 они укладываются в кольцо
      // дважды, и шум остаётся тем же шумом, только продолженным в запас
      for (let j = 0; j < N; j++) out[j] += a*Math.sin(2*Math.PI*m*sim.x[j]/viewL() + ph);
    }
    for (let j = 0; j < N; j++) out[j] += base;
    return out;
  }
  for (let j = 0; j < N; j++)
    out[j] = base + profile(desc.tool!, sim.x[j], desc.x0 || 0, desc.A!, desc.w!,
                            desc.edge || S.edge, sim.L);
  return out;
}
