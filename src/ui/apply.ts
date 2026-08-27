/* ================= применение системы и ползунки параметров ================= */
import type { Model, PosError } from '../core';
import { $, $i, S, clamp, sim } from './state';
import { formatEq } from './math-preview';
import { autosizeEq } from './highlight';
import { showError, syncEqUI, syncMsg } from './eq-input';
import { buildLegend } from './diag';
import { clearXT } from './render';
import { refreshDt } from './loop';
import { syncFx } from './chips-view';

export function showWarnings(m: Model) {
  const w = sim.stabilityWarning();
  const msgs = m.warnings.slice();
  if (w) msgs.push(w.comp + ': неустойчиво при больших k (рост ' + w.growth.toPrecision(3) + ')');
  $('warn').innerHTML = msgs.map(s => '⚠ ' + s).join('<br>');
  syncMsg();
}

/** только смена значения константы: структура та же, DOM ползунков не трогаем */
function updateParams(params: Record<string, number>) {
  try {
    const m = sim.setSystem($i('eq').value, params);
    showError(null);
    showWarnings(m);
    refreshDt(true);
    syncFx();                          // параметр входит в S(k): nu = 0 — это уже не сглаживание
  } catch (e) { showError(e as PosError); }
}

export function applySystem(text: string, params?: Record<string, number>) {
  /* применённый текст всегда канонический: лишние пробелы и пустые строки убраны,
     операторы расставлены единообразно. Непонятный текст formatEq не трогает,
     иначе правка ломала бы то, что человек ещё дописывает. */
  text = formatEq(text);
  if ($i('eq').value !== text) { $i('eq').value = text; autosizeEq(); }
  const prev = sim.model ? sim.model.comps.map(c => c.name) : null;
  const prevIC = S.ic, prevICI = S.icI, prevVis = S.vis;
  try {
    const m = sim.setSystem(text, params || (sim.model ? sim.model.params : {}));
    showError(null);
    showWarnings(m);
    S.appliedEq = text;

    // начальные данные и видимость: переносим по именам компонент, новые — нули.
    // Мнимая часть едет вместе с вещественной: иначе правка константы в
    // «ut = a*i*uxx» стирала бы фазу нарисованного пакета
    const ic: (Float64Array | null)[] = [], icI: (Float64Array | null)[] = [], vis: boolean[] = [];
    for (const c of m.comps) {
      const j = prev ? prev.indexOf(c.name) : -1;
      const keep = j >= 0 && prevIC[j] && prevIC[j]!.length === sim.N;
      ic[c.ci] = keep ? prevIC[j] : new Float64Array(sim.N);
      icI[c.ci] = keep && prevICI[j] && c.complex ? prevICI[j] : null;
      vis[c.ci] = j >= 0 ? prevVis[j] !== false : c.d === 0;
      if (!keep) sim.setU(c.ci, ic[c.ci]!);
      else if (icI[c.ci]) sim.setU(c.ci, ic[c.ci]!, icI[c.ci]);
    }
    S.ic = ic; S.icI = icI; S.vis = vis;
    if (S.sel >= m.comps.length) S.sel = 0;
    buildLegend(m); buildParamUI(m); clearXT();
    S.dead = false; refreshDt(true);
    syncEqUI();
    syncFx();
    $i('eq').blur();         // применилось — отпускаем поле, чтобы работал пробел
    return true;
  } catch (e) {
    showError(e as PosError);
    syncEqUI();
    return false;
  }
}

/* ---- параметры: логарифмический ползунок ---- */
const LO = -4, HI = 3;                     // 10^LO … 10^HI
export function buildParamUI(m: Model) {
  const box = $('pars');
  if (!m.paramNames.length) {
    box.innerHTML = '<div class="note">нет — любая лишняя буква станет константой, ' +
                    'например <code>ut + u*ux = nu*uxx</code></div>';
    return;
  }
  box.innerHTML = '';
  for (const name of m.paramNames) {
    const div = document.createElement('div');
    div.className = 'par';
    div.innerHTML =
      '<div class="top"><label>' + name + '</label>' +
      '<button class="sg" title="знак">±</button>' +
      '<input type="number" step="any" style="width:92px"></div>' +
      '<input type="range" min="' + LO + '" max="' + HI + '" step="0.01">' +
      '<div class="sc"><span>10<sup>' + LO + '</sup></span><span>1</span><span>10<sup>' + HI + '</sup></span></div>';
    const num = div.querySelector('input[type=number]') as HTMLInputElement;
    const rng = div.querySelector('input[type=range]') as HTMLInputElement;
    const sgn = div.querySelector('button.sg') as HTMLButtonElement;
    let sign = m.params[name] < 0 ? -1 : 1;

    const show = (v: number) => {
      num.value = String(+v.toPrecision(4));
      sign = v < 0 ? -1 : 1;
      sgn.textContent = sign < 0 ? '−' : '+';
      sgn.style.color = sign < 0 ? 'var(--bad)' : 'var(--ok)';
      rng.value = String(clamp(Math.log10(Math.abs(v) || Math.pow(10, LO)), LO, HI));
    };
    const set = (v: number) => { m.params[name] = v; updateParams(m.params); };

    show(m.params[name]);
    rng.oninput = () => { const v = sign*Math.pow(10, +rng.value); num.value = String(+v.toPrecision(4)); set(v); };
    num.oninput = () => { const v = +num.value; if (!isNaN(v)) { show(v); set(v); } };
    sgn.onclick = () => { const v = -(+num.value || Math.pow(10, +rng.value)); show(v); set(v); };
    box.appendChild(div);
  }
}
