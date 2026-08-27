/* ================= мышь ================= */
import { $i, S, clamp, sim } from './state';
import type { Drag } from './state';
import { makeProfile, px2x, py2u } from './geometry';
import { draw, plot } from './render';
import { commit } from './ic';
import { syncPlay } from './controls';

function localPos(ev: PointerEvent) {
  const r = plot.getBoundingClientRect();
  return { px: ev.clientX - r.left, py: ev.clientY - r.top };
}

/** пока кнопка мыши нажата, счёт стоит: иначе профиль уезжает из-под курсора,
    а в режиме «рисовать на ходу» правка ложится на уже другое решение.
    После отпускания счёт возвращается, если шёл. */
function pauseForDraw() {
  S.wasRunning = S.running;
  if (S.running) { S.running = false; syncPlay(); }
}
function resumeAfterDraw() {
  if (S.wasRunning && !S.dead) { S.running = true; syncPlay(); }
  S.wasRunning = false;
}

function applyDrag() {
  const d = S.drag as Extract<Drag, { pen?: undefined }>, N = sim.N, u = new Float64Array(N);
  const p = makeProfile({ tool:S.tool, x0:d.x0, A:d.A, w:d.w, edge:S.edge });
  for (let j = 0; j < N; j++) u[j] = S.base![j] + p[j];
  sim.setU(S.sel, u);
}

function penDot(u: Float64Array, px0: number, py0: number, px1: number, py1: number) {
  const steps = Math.max(1, Math.round(Math.abs(px1-px0)));
  for (let s = 0; s <= steps; s++) {
    const q = s/steps;
    const x = px2x(px0 + (px1-px0)*q), val = py2u(py0 + (py1-py0)*q);
    let j = Math.round((x + sim.L/2)/sim.L*sim.N);
    j = ((j % sim.N) + sim.N) % sim.N;
    u[j] = val;
    if (steps > 1) u[(j+1) % sim.N] = val;
  }
}

export function initPointer() {
  plot.addEventListener('pointerdown', ev => {
    pauseForDraw();
    try { plot.setPointerCapture(ev.pointerId); } catch (e) {}
    const { px, py } = localPos(ev);
    const add = S.add || ev.altKey;
    S.base = add ? Float64Array.from(sim.getU(S.sel)) : new Float64Array(sim.N);
    S.vis[S.sel] = true;
    if (S.tool === 'pen') {
      S.drag = { pen:true, lastPx:px, lastPy:py };
      const u = Float64Array.from(S.base);
      penDot(u, px, py, px, py);
      sim.setU(S.sel, u);
    } else if (S.tool === 'noise') {
      const u = Float64Array.from(S.base);
      const n = makeProfile({ tool:'noise', A:Math.abs(py2u(py)) || 0.3 });
      for (let j = 0; j < sim.N; j++) u[j] += n[j];
      S.drag = null; commit(u, S.live); return;
    } else {
      S.drag = { px0:px, py0:py, x0:px2x(px), A:py2u(py), w:S.width };
      applyDrag();
    }
    draw();
  });

  plot.addEventListener('pointermove', ev => {
    if (!S.drag) return;
    const { px, py } = localPos(ev);
    if (S.drag.pen) {
      const u = Float64Array.from(sim.getU(S.sel));
      penDot(u, S.drag.lastPx, S.drag.lastPy, px, py);
      S.drag.lastPx = px; S.drag.lastPy = py;
      sim.setU(S.sel, u);
    } else {
      S.drag.A = py2u(py);
      if (Math.abs(px - S.drag.px0) > 6) {
        S.drag.w = Math.max(sim.L/sim.N*1.5, Math.abs(px2x(px) - S.drag.x0));
        $i('wid').value = S.drag.w.toFixed(2);
      }
      applyDrag();
    }
    draw();
  });

  plot.addEventListener('pointerup', () => {
    resumeAfterDraw();                    // до выхода: «шум» рисуется в pointerdown и S.drag не ставит
    if (!S.drag) return;
    S.drag = null;
    if (S.tool !== 'pen') S.width = +$i('wid').value;
    commit(Float64Array.from(sim.getU(S.sel)), S.live);
  });
  plot.addEventListener('pointercancel', resumeAfterDraw);

  plot.addEventListener('wheel', ev => {
    ev.preventDefault();
    S.width = clamp(S.width*Math.exp(-ev.deltaY*0.0015), sim.L/sim.N, sim.L/2);
    $i('wid').value = S.width.toFixed(2);
    if (S.drag && !S.drag.pen) { S.drag.w = S.width; applyDrag(); draw(); }
  }, { passive:false });
}
