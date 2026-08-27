/* ================= фишки: DOM-хвост ================= */
import { $, $i, S, sim } from './state';
import { PRESETS, Preset } from './presets';
import { FX, chipsFor } from './chips';
import { chipIcon } from './icons';
import { matchPreset } from './eq-input';

/* В пункте списка — только пять фишек с `list:true` (нелинейное, солитоны,
   комплексное поле, сценарии, опыт): они отвечают на «что это за задача» и тем
   отличают соседей по списку. Остальные восемь говорят про механизм, и в строке
   пункта их не читали: восемь значков подряд съедали имя, а разбирать ребус,
   листая список, всё равно некогда. Полный набор — в строке под кнопкой
   (`#fxbar`), для того уравнения, которое сейчас считается. */
export const chipRow = (i: number) => '<span class="fx">' +
  FX[i].filter(c => c.list).map(c => chipIcon(c.id)).join('') + '</span>';

/** Расшифровка значков под формулой: значок сам по себе — ребус, а место, где на
    него смотрят, ровно одно — превью. «Система» не раскрывается: что уравнений
    несколько, видно по самой формуле строкой выше. */
export function chipWhy(i: number) {
  const rows = FX[i].filter(c => c.why);
  if (!rows.length) return '';
  return '<div class="fxwhy">' + rows.map(c =>
    '<div>' + chipIcon(c.id) + '<span><b>' + c.name + '</b> — ' + c.why + '</span></div>').join('') +
    '</div>';
}

/* Строка фишек под кнопкой списка: **полный набор для текущей системы**, с
   подсказкой на каждой. Считается по уже собранной модели и по фактическому
   состоянию — сетке, параметрам и кнопке гашения, — поэтому своё уравнение
   получает ровно те же значки, что пресет: из текста вычисляется всё, кроме
   сценариев, солитонов и «опыта», а эти три приезжают от пресета, совпавшего по
   тексту (набрал КдФ руками — солитоны никуда не делись).
   Обновляется при пересборке системы, смене параметра, смене сетки и гашения:
   каждое из этого меняет символ S(k), а значит и половину набора. */
export function syncFx() {
  const box = $('fxbar');
  box.innerHTML = '';
  const m = sim.model; if (!m) return;
  const pr: Partial<Preset> = PRESETS[matchPreset(S.appliedEq || $i('eq').value)] || {};
  const cs = chipsFor(m, { L: sim.L, N: sim.N, sol: pr.sol, sc: pr.sc, story: pr.story,
                           smooth: S.smooth });
  for (const c of cs) {
    const el = document.createElement('span');
    el.className = 'fxc';
    el.setAttribute('data-tip', c.name + '|' + (c.why || c.tip));
    el.innerHTML = chipIcon(c.id);
    box.appendChild(el);
  }
}
