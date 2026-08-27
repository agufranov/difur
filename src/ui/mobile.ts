/* ================= телефон: шторка настроек ================= */
import { $, mob } from './state';
import { syncCxUI } from './diag';
import { hideTip } from './tooltip';
import { draw, fitCanvas } from './render';

/** Пульт стоит в нижней строке всегда и никуда не переезжает. Переезжает
    скорость: на телефоне шесть кнопок «×N» в строку не влезают, и `#speedbox`
    уходит в шторку. Переезжает сам узел, а не копия: `syncSpeed`, обработчик
    кликов и тесты работают с тем же `#speed` и про переезд ничего не знают.
    Копия была бы вторым источником правды — подсветку текущего множителя
    пришлось бы держать в двух местах. */
export function relayout() {
  const spd = $('speedbox'), home = mob.matches ? $('spdhome') : $('barspd');
  if (spd.parentNode !== home) home.appendChild(spd);
  syncCxUI();                                 // текст подсказки зависит и от экрана, и от поля
  if (!mob.matches) openSheet(false);         // вернулись на десктоп — панель снова на месте
}

const aside = document.querySelector('aside')!;
const sheetOpen = () => aside.classList.contains('open');
function openSheet(on: boolean) {
  aside.classList.toggle('open', on);
  $('scrim').classList.toggle('on', on);
  $('gear').classList.toggle('on', on);
  hideTip();
}

export function initMobile() {
  $('gear').onclick = () => openSheet(!sheetOpen());
  $('scrim').onclick = () => openSheet(false);
  $('sheetx').onclick = () => openSheet(false);
  mob.addEventListener('change', () => { relayout(); fitCanvas(); draw(); });
}
