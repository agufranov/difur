/* ================= геометрия холста и профили инструментов ================= */
import type { Comp } from '../core';
import { COLORS, S, sim, view, wrapd } from './state';
import type { ICDesc } from './presets';

export const compColor = (c: Comp) => COLORS[sim.model!.fields.indexOf(c.f) % COLORS.length];

export function x2px(x: number) { return (x + sim.L/2) / sim.L * view.PW; }
export function px2x(px: number) { return px / view.PW * sim.L - sim.L/2; }
export function u2py(u: number) { return (S.yMax - u) / (S.yMax - S.yMin) * view.PH; }
export function py2u(py: number) { return S.yMax - py / view.PH * (S.yMax - S.yMin); }

export function profile(tool: string, x: number, x0: number, A: number, w: number,
                        edge: number, L: number): number {
  const d = wrapd(x - x0, L);
  switch (tool) {
    case 'sech':  { const c = Math.cosh(d/w); return A/(c*c); }
    case 'gauss': return A * Math.exp(-(d/w)*(d/w));
    case 'step':  return A * 0.5 * (Math.tanh((d + w)/edge) - Math.tanh((d - w)/edge));
    case 'sin':   { const m = Math.max(1, Math.round(L/(2*w))); return A*Math.cos(2*Math.PI*m*d/L); }
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
      for (let j = 0; j < N; j++) out[j] += a*Math.sin(2*Math.PI*m*sim.x[j]/sim.L + ph);
    }
    for (let j = 0; j < N; j++) out[j] += base;
    return out;
  }
  for (let j = 0; j < N; j++)
    out[j] = base + profile(desc.tool!, sim.x[j], desc.x0 || 0, desc.A!, desc.w!,
                            desc.edge || S.edge, sim.L);
  return out;
}
