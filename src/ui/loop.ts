/* ================= шаг по времени и цикл анимации ================= */
import { $i, S, clamp, rt, sim } from './state';
import { autoscale } from './autoscale';
import { draw, pushRow } from './render';
import { updateDiag } from './diag';
import { syncPlay } from './controls';

/** «крупный шаг»: множитель на эвристические пределы автоподбора.
 *  2 — потому что замерено: солитон КдФ 1.8e-5 -> 3.9e-4 (глазом не видно),
 *  все пресеты живы, «Δ за шаг» не перескакивает порог тревоги. 3 уже перескакивает. */
const COARSE_K = 2;

export function refreshDt(force: boolean) {
  if (!S.autodt || !sim.model) return;
  const d = sim.diagnostics(), dx = sim.L/sim.N, K = S.coarse ? COARSE_K : 1;
  // предел линейной части — настоящая устойчивость, его K не трогает
  let dt = Math.min(0.02*K, sim.dtLimit());
  if (sim.model.nonlin) {
    const amp = Math.max(0.3, Math.min(1e3, isFinite(d.max) ? d.max : 1));
    dt = Math.min(dt, K*0.15*dx/amp);
    if (sim.model.maxOrder >= 3) dt = Math.min(dt, K*3*Math.pow(dx, 1.5));
  }
  dt = clamp(dt, 1e-7, 0.05);
  if (force || Math.abs(dt - sim.dt) > 0.05*sim.dt) { sim.setDt(dt); $i('dt').value = dt.toPrecision(3); }
}

/** шаги одного кадра: не больше S.spf и не дольше бюджета. Возвращает сделанное */
export function frameSteps() {
  const w0 = performance.now();
  let i = 0;
  for (; i < S.spf; i++) {
    sim.step();
    // время смотрим не каждый шаг: на мелкой сетке сам замер сопоставим с шагом
    if ((i & 7) === 7 && performance.now() - w0 > rt.stepBudgetMs) { i++; break; }
  }
  return i;
}

export function frame() {
  if (S.running && !S.dead) {
    refreshDt(false);
    rt.stepsDone = frameSteps(); rt.spsN += rt.stepsDone;
    if (!sim.diagnostics().finite) { S.dead = true; S.running = false; syncPlay(); }
    pushRow();
  } else rt.stepsDone = 0;

  const now = performance.now();
  if (now - rt.spsT0 > 500) { rt.stepsPerSec = rt.spsN*1000/(now - rt.spsT0); rt.spsT0 = now; rt.spsN = 0; }

  autoscale();
  draw();
  updateDiag();
  requestAnimationFrame(frame);
}
