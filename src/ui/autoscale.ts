/* ================= автомасштаб оси Y ================= */
import { $i, S, clamp, sim } from './state';
import { viewRange } from './geometry';

const Y_LIMIT = 1000;     // дальше автомасштаб не уезжает: при разносе видно, что разнесло, и хватит

/* Масштаб считается только по окну показа: иначе горб, уехавший в невидимый
   запас, продолжал бы задавать шкалу — картинка на экране прыгала бы от того,
   чего на экране нет. При pad=1 диапазон — вся сетка, и число прежнее. */
export function autoscale() {
  if (!S.autoY || S.drag || !sim.model) return;
  const [j0, j1] = viewRange();
  let lo = Infinity, hi = -Infinity;
  for (const comp of sim.model.comps) {
    if (!S.vis[comp.ci]) continue;
    const u = sim.getU(comp.ci);
    // у комплексного поля на графике модуль, он же и задаёт масштаб (снизу — ноль)
    if (comp.complex) {
      const w = sim.getUi(comp.ci);
      if (0 < lo) lo = 0;
      for (let j = j0; j < j1; j++) { const m = Math.hypot(u[j], w[j]); if (m > hi) hi = m; }
      continue;
    }
    for (let j = j0; j < j1; j++) {
      if (u[j] < lo) lo = u[j];
      if (u[j] > hi) hi = u[j];
    }
  }
  if (!isFinite(lo) || !isFinite(hi)) return;
  const pad = Math.max(0.2, (hi-lo)*0.18);
  const tMin = clamp(lo-pad, -Y_LIMIT, Y_LIMIT);
  const tMax = clamp(hi+pad, -Y_LIMIT, Y_LIMIT);
  // после разноса возвращаемся сразу: плавность нужна для дыхания решения,
  // а не для проезда трёх порядков подряд
  const snap = (S.yMax - S.yMin) > 8*(tMax - tMin);
  const w = snap ? 1 : 0.12;
  S.yMin += (tMin - S.yMin)*w;
  S.yMax += (tMax - S.yMax)*w;
  $i('ymin').value = S.yMin.toFixed(2); $i('ymax').value = S.yMax.toFixed(2);
}
