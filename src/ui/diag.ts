/* ================= легенда и показания счёта ================= */
import type { Model } from '../core';
import { $, S, mob, rt, sim } from './state';
import { compColor } from './geometry';
import { draw, showXT } from './render';

/** одна форма записи числа на весь интерфейс: экспонента только там, где иначе
 *  получится «0.0000» или частокол цифр */
export function fmt(v: number, dg?: number) {
  return isFinite(v) ? (Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-3)
         ? v.toExponential(2) : v.toFixed(dg === undefined ? 4 : dg)) : '∞';
}

/** Легенда поверх графика: она же список полей, она же их показания.
 *  Строится только при пересборке модели или смене выбора/видимости; числа
 *  каждый кадр переписывает `updateDiag` в готовые `.v` (`legendVals`) —
 *  перестраивать разметку 60 раз в секунду было бы и дороже, и опаснее:
 *  под курсором исчезал бы тот самый узел, по которому кликают. */
let legendVals: (HTMLElement | undefined)[] = [];
export function buildLegend(m: Model) {
  const box = $('legend');
  box.innerHTML = '';
  legendVals = [];
  for (const comp of m.comps) {
    const b = document.createElement('div');
    b.className = 'lgd' + (comp.ci === S.sel ? ' sel' : '') + (S.vis[comp.ci] ? '' : ' off');
    b.style.color = compColor(comp);
    // у комплексного поля вместо точки — колечко фазы: это и легенда цвета кривой
    b.innerHTML = '<span class="dot' + (comp.complex ? ' ph' : '') +
                  (S.vis[comp.ci] ? '' : ' off') + '"></span>' +
                  '<span class="nm">' + comp.name + '</span><span class="v"></span>';
    (b.querySelector('.dot') as HTMLElement).onclick = ev => {
      ev.stopPropagation();
      S.vis[comp.ci] = !S.vis[comp.ci];
      buildLegend(m); draw();
    };
    b.onclick = () => { S.sel = comp.ci; S.vis[comp.ci] = true; buildLegend(m); showXT(); draw(); };
    box.appendChild(b);
    legendVals[comp.ci] = b.querySelector('.v') as HTMLElement;
  }
  $('selname').textContent = '→ ' + m.comps[S.sel].name;
  syncCxUI();
  updateDiag();
}

/** «импульс» имеет смысл только там, где есть фаза — у комплексного поля.
    Заодно подсказка на графике объясняет, что нарисована не сама ψ, а её модуль:
    без этого цветная кривая читается как «что-то непонятное». */
export function syncCxUI() {
  const cx = !!(sim.model && sim.model.comps[S.sel].complex);
  $('k0row').style.display = cx ? '' : 'none';
  $('hint').textContent = cx
    ? 'кривая — |ψ|, цвет — фаза · тяни' + (mob.matches ? ' пальцем' : ' мышью') + ': ↕ амплитуда, ↔ ширина'
    : (mob.matches ? 'тяни пальцем: ↕ амплитуда, ↔ ширина'
                   : 'тяни мышью: ↕ амплитуда, ↔ ширина · колесо — ширина · Alt — добавить');
}

export function updateDiag() {
  if (!sim.model) return;
  const d = sim.diagnostics();
  const f = fmt;
  // показания поля — в его строке легенды, а не в общей таблице: они относятся
  // к конкретной кривой, и читать их удобнее рядом с ней
  for (const comp of sim.model.comps) {
    const el = legendVals[comp.ci], p = d.per[comp.ci]; if (!el) continue;
    // у комплексного поля вместо ∫u — сохраняющаяся норма: именно по ней видно,
    // что счёт идёт правильно (у Шрёдингера она обязана стоять на месте)
    el.textContent = comp.complex
      ? 'max ' + f(p.max, 3) + ' · ‖u‖² ' + f(p.norm, 3)
      : 'max ' + f(p.max, 3) + ' · ∫ ' + f(p.mass, 3);
  }
  // общие показания — в нижней строке: это не настройка, а то, как идёт счёт,
  // и смотрят на них не открывая никаких панелей
  const q = (v: string | number) => '<span class="q">' + v + '</span>';
  let h = 't ' + q(d.t.toFixed(3)) + ' · Δ/шаг ' + q(f(d.perStep));
  // видно, упёрлись мы в железо или просто мало просим: приписка — когда кадр
  // обрывается по бюджету, а не по числу шагов
  if (S.running && rt.stepsPerSec > 0)
    h += ' · ' + q(Math.round(rt.stepsPerSec)) + ' шаг/с' +
         (rt.stepsDone < S.spf ? ' (упёрлось в кадр)' : '');
  // на ударной волне потеря энергии физична (её теряет и точное решение),
  // поэтому ругаемся только когда гашение становится главным процессом
  if (S.smooth)
    h += ' · гашение <span class="q" style="color:' +
         (d.loss > 0.1 ? 'var(--accent2)' : 'var(--ok)') + '">' +
         (100*d.loss).toFixed(d.loss < 0.01 ? 2 : 1) + ' %/ед.вр.</span>';

  let st = '', col = '';
  if (S.dead) { col = 'var(--bad)';
    st = 'решение разошлось — уменьши dt, сгладь данные или поменяй знак'; }
  else if (d.perStep > 0.1) { col = 'var(--accent2)';
    st = 'за шаг решение меняется на ' + (100*d.perStep).toFixed(0) + '% — уменьши dt'; }
  else if (S.smooth && d.loss > 0.25) { col = 'var(--accent2)';
    st = 'гашение снимает ' + (100*d.loss).toFixed(0) + '% энергии за единицу времени — ' +
         'считается уже не исходная задача, а её вязкая версия: возьми сетку помельче'; }

  // На телефоне строка одна и узкая: числа и тревога делить её не могут, поэтому
  // тревога вытесняет числа. Счёт, вставший молча и без объяснения, — худшее,
  // что может случиться, поэтому важнее всего именно она.
  const bt = $('bart'), bm = $('barmsg'), phone = mob.matches;
  if (phone) h = 't ' + q(d.t.toFixed(2)) + ' · Δ ' + q(f(d.perStep, 2));  // короче — иначе обрежется
  if (phone && st) { bt.textContent = S.dead ? 'решение разошлось' : st; bt.style.color = col; }
  else { bt.innerHTML = h; bt.style.color = ''; }
  bm.textContent = phone ? '' : st;
  bm.style.color = col;
  // строка узкая, длинная тревога обрезается — полный текст остаётся в подсказке
  if (st && !phone) bm.setAttribute('data-tip', 'Что случилось|' + st);
  else bm.removeAttribute('data-tip');
}
