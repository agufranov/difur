/* ================= кнопки сценариев ================= */
import { $, $i, S } from './state';
import { PRESETS } from './presets';
import { scenIcon } from './icons';
import { loadPreset } from './preset-list';

/** Сценарии есть у пресета, где уравнение одно, а поставленных опытов несколько
 *  (Шрёдингер). Строка появляется только у такого пресета: у остальных сценарий
 *  ровно один — сам пресет, и пустой ряд кнопок был бы враньём.
 *
 *  Кнопки перестраиваются только при смене пресета, а не на каждое нажатие
 *  клавиши: `syncEqUI` зовётся на любой ввод в поле, а рисовать три svg на
 *  каждую букву незачем. */
let scenOf = -2;                       // для какого пресета сейчас построены кнопки
export function buildScen(idx: number) {
  const p = idx >= 0 ? PRESETS[idx] : null, box = $('scen');
  $('scenbox').style.display = p && p.sc ? '' : 'none';
  if (!p || !p.sc) { scenOf = -1; return; }
  if (scenOf !== idx) {
    scenOf = idx;
    box.innerHTML = '';
    p.sc.forEach((s, i) => {
      const b = document.createElement('button');
      b.dataset.sc = String(i);
      b.setAttribute('data-tip', s.name + '|' + s.tip);
      b.innerHTML = scenIcon(s.icon) + '<span>' + s.name + '</span>';
      box.appendChild(b);
    });
  }
  [...box.children].forEach((b, i) => b.classList.toggle('on', i === S.scen));
}

export function initScen() {
  $('scen').addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button[data-sc]') as HTMLElement | null;
    if (!b) return;
    const i = +$i('preset').value; if (i < 0) return;
    loadPreset(PRESETS[i], +b.dataset.sc!);
  });
}
