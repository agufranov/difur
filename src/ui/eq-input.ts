/* ================= поле ввода: ошибка, селект, кнопка «применить» ================= */
import { buildSystem } from '../core';
import type { PosError } from '../core';
import { $, $i, S, sim } from './state';
import { PRESETS } from './presets';
import { autosizeEq, hlHTML } from './highlight';
import { buildScen } from './scen';
import { syncPresetBtn } from './preset-list';

/** ошибка в #err; сам текст (с раскраской и меткой ошибки) рисует paintEq */
export function showError(e: PosError | null) {
  $('err').textContent = e ? e.message : '';
  $i('eq').classList.toggle('bad', !!e);
  paintEq(e);
  syncMsg();
}

/** строка сообщений живёт под полем ввода — там, где текст, из-за которого она
    появилась. Пустую убираем целиком: иначе пустая строка вместе с отступом
    шапки навсегда съедала бы высоту у графика. Холст подгонит ResizeObserver. */
export function syncMsg() {
  $('msg').classList.toggle('on', !!($('err').textContent || $('warn').textContent));
}

/** подложка #eqhl: раскрашенная копия текста поля, поверх — метка ошибки */
function paintEq(e?: PosError | null) {
  const hl = $('eqhl');
  hl.innerHTML = hlHTML($i('eq').value, e);
  hl.scrollTop = $i('eq').scrollTop;
}

/** проверка текста на лету — модель не трогается */
export function validate() {
  let e: PosError | null = null;
  try { buildSystem($i('eq').value, Object.assign({}, sim.model ? sim.model.params : {})); }
  catch (err) { e = err as PosError; }
  showError(e);
  return !e;
}

/* «своё уравнение» ↔ пресет: сравниваем текст без пробелов и пустых строк */
export function normEq(s: string) {
  return s.split(/[\n;]+/).map(l => l.trim()).filter(l => l && l[0] !== '#')
          .join('\n').replace(/[ \t]+/g, '');
}
/** Текст уравнения у пресетов уникален, поэтому хватает первого совпадения.
 *  (Было не так: три задачи Шрёдингера различались только начальными данными,
 *  и выбранный пресет приходилось делать липким, чтобы заголовок не перескакивал
 *  на первый совпавший. Теперь такие задачи — сценарии одного пресета.) */
export function matchPreset(text: string) {
  const n = normEq(text);
  for (let i = 0; i < PRESETS.length; i++) if (normEq(PRESETS[i].eq) === n) return i;
  return -1;
}
export function syncEqUI() {
  const text = $i('eq').value;
  const i = matchPreset(text);
  $i('preset').value = String(i);                     // -1 — пункт «своё уравнение»
  syncPresetBtn();
  buildScen(i);                                       // ушли с пресета — ушли и сценарии
  ($('apply') as HTMLButtonElement).disabled = text === S.appliedEq;
}

export function initEqInput() {
  $i('eq').addEventListener('input', () => { autosizeEq(); syncEqUI(); validate(); });
  $i('eq').addEventListener('scroll', () => { $('eqhl').scrollTop = $i('eq').scrollTop; });
}
