/* ================= фишки: DOM-хвост ================= */
import { $, $i, S, escAttr, sim } from './state';
import { PRESETS, Preset } from './presets';
import { FX, chipsFor } from './chips';
import { chipIcon } from './icons';
import { matchPreset } from './eq-input';

/* В карточке — только пять фишек с `list:true` (нелинейное, солитоны, комплексное
   поле, сценарии, опыт): они отвечают на «что это за задача» и тем отличают
   соседей по списку. Остальные восемь говорят про механизм, и в карточке их не
   читали: восемь значков подряд съедали имя, а разбирать ребус, листая список,
   всё равно некогда. Полный набор — в строке под кнопкой (`#fxbar`), для того
   уравнения, которое сейчас считается.

   Подсказка на каждом значке (`data-tip`) — то, что раньше было блоком-расшифровкой
   в окошке-превью: значок сам по себе ребус, и место, где на него смотрят, ровно
   одно — карточка. На телефоне ту же подсказку открывает долгое нажатие, и клик
   после него давится (см. src/ui/tooltip.ts), так что выбор пресета не срабатывает. */
export const cardChips = (i: number) => '<span class="fx">' +
  FX[i].filter(c => c.list).map(c =>
    '<span class="fxi" data-tip="' + escAttr(c.name + '|' + (c.why || '')) + '">' +
    chipIcon(c.id) + '</span>').join('') + '</span>';

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
