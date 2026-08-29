/* ================= пресеты: список карточек и загрузка =================
   Пункт списка — карточка: имя, формула и строка «что увидишь». Раньше пункт был
   строкой с именем, а формула жила в отдельном окошке-превью сбоку (на телефоне —
   внизу экрана, с кнопкой «выбрать»). Из-за этого имя было единственным текстом в
   списке, и в него сваливали всё сразу — «Кортевег–де Фриз (солитоны)»,
   «Бюргерс без вязкости (опрокидывание горба)», — после чего многоточие обрезало
   как раз пояснение. Карточка показывает три вещи по отдельности, превью стало
   не нужно, а вместе с ним ушла и телефонная возня с двумя тапами. */
import { $, $i, S, clamp, mob, sim } from './state';
import { PRESETS, Preset, PresetCfg } from './presets';
import { cardChips } from './chips-view';
import { fitMath, prettyEq } from './math-preview';
import { autosizeEq } from './highlight';
import { applySystem } from './apply';
import { makeIC, setIC } from './ic';
import { buildLegend } from './diag';
import { buildScen } from './scen';
import { clearXT, draw } from './render';
import { setSmooth, syncPad, syncPlay, syncSpeed } from './controls';

const sel = $('preset') as HTMLSelectElement;
const pbtn = $('presetbtn'), plist = $('plist');
let hiIdx = -1;
let fitted = false;                    // скобки формул дорисованы? (см. openList)

const isOpen = () => plist.classList.contains('on');
const itemAt = (i: number) => plist.children[i] as HTMLElement | undefined;

export function syncPresetBtn() {
  const i = +sel.value;
  pbtn.textContent = i >= 0 ? PRESETS[i].name : '— своё уравнение —';
}

function markHi() {
  [...plist.children].forEach((el, i) => {
    el.classList.toggle('hi', i === hiIdx);
    el.classList.toggle('cur', i === +sel.value);
  });
}

function openList(on: boolean) {
  plist.classList.toggle('on', on);
  pbtn.classList.toggle('open', on);
  /* Скобки формул рисуются по измеренной высоте содержимого (fitMath), а у
     закрытого списка вся высота нулевая: пока он `display:none`, мерить нечего.
     Поэтому первый показ — и есть момент, когда их можно дорисовать. */
  if (on && !fitted) { fitted = true; fitMath(plist); }
  hiIdx = on ? +sel.value : -1;
  markHi();
  if (on && hiIdx >= 0) itemAt(hiIdx)!.scrollIntoView({ block:'nearest' });
}

function choose(i: number) {
  openList(false);
  pbtn.blur();                       // чтобы пробел сразу пускал счёт, а не открывал список
  sel.value = String(i);
  sel.dispatchEvent(new Event('change'));
}

export function initPresetList() {
  /* первым пунктом — «своё уравнение»: выбрать нельзя, но он показывается,
     как только текст в поле перестал совпадать с каким-либо пресетом */
  const own = document.createElement('option');
  own.value = '-1'; own.textContent = '— своё уравнение —'; own.disabled = true;
  sel.appendChild(own);
  PRESETS.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = String(i); o.textContent = p.name; sel.appendChild(o);
  });
  sel.onchange = () => { const i = +sel.value; if (i >= 0) loadPreset(PRESETS[i]); };

  PRESETS.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'pitem'; d.dataset.i = String(i); d.setAttribute('role', 'option');
    /* Имя — textContent, а не в разметку: в именах есть «φ⁴» и тире, но подставлять
       чужой текст в innerHTML незачем. Формула и значки — уже готовый HTML. */
    d.innerHTML = '<div class="phead"><span class="nm"></span>' + cardChips(i) + '</div>' +
      '<div class="pform">' + prettyEq(p.eq) + '</div>' +
      '<div class="note"></div>';
    (d.querySelector('.nm') as HTMLElement).textContent = p.name;
    (d.querySelector('.note') as HTMLElement).textContent = p.note;
    plist.appendChild(d);
  });

  pbtn.onclick = () => openList(!isOpen());
  plist.addEventListener('pointerover', e => {
    const it = (e.target as HTMLElement).closest('.pitem') as HTMLElement | null;
    if (it) { hiIdx = +it.dataset.i!; markHi(); }
  });
  plist.addEventListener('click', e => {
    const it = (e.target as HTMLElement).closest('.pitem') as HTMLElement | null;
    if (!it) return;
    /* Один тап (клик) выбирает — и на телефоне тоже. Промежуточный шаг «тап
       показывает формулу, кнопка „выбрать“ применяет» был нужен, пока формулу
       негде было увидеть до выбора; теперь она в самой карточке. */
    choose(+it.dataset.i!);
  });
  document.addEventListener('pointerdown', e => {
    if (isOpen() && !$('presetbox').contains(e.target as Node)) openList(false);
  });
  /* Карточки разложены в столько колонок, сколько влезло (grid auto-fill), поэтому
     «вниз» — это не «следующий по счёту», а «через колонку». Число колонок берётся
     у самой сетки: считать его по ширине значило бы дублировать правило из CSS. */
  const cols = () => getComputedStyle(plist).gridTemplateColumns.split(' ').length;
  pbtn.addEventListener('keydown', e => {
    if (e.key === 'Escape') { openList(false); return; }
    const step = e.key === 'ArrowDown' ? cols() : e.key === 'ArrowUp' ? -cols()
               : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step) {
      e.preventDefault();
      if (!isOpen()) { openList(true); return; }
      hiIdx = clamp((hiIdx < 0 ? +sel.value : hiIdx) + step, 0, PRESETS.length - 1);
      markHi(); itemAt(hiIdx)!.scrollIntoView({ block:'nearest' });
      return;
    }
    if (isOpen() && (e.key === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      if (hiIdx >= 0) choose(hiIdx);
    }
  });
  // на телефоне список занимает почти весь экран, и его высота считается от
  // текущей — при повороте она меняется вдвое; заодно снимаем зависшую подсветку
  addEventListener('resize', () => { if (isOpen() && mob.matches) openList(false); });
}

/** Грузит пресет; `si` — номер сценария у пресетов со списком `sc`. Сценарий
 *  накладывается поверх пресета (`ic`, `N`, `y`, `k0` — его), поэтому дальше
 *  везде читается `cfg`, а не `p`: общее написано в пресете один раз. */
export function loadPreset(p: Preset, si?: number) {
  S.running = false; syncPlay();
  const idx = PRESETS.indexOf(p); if (idx >= 0) { sel.value = String(idx); syncPresetBtn(); }
  S.scen = p.sc ? clamp((si as number) | 0, 0, p.sc.length - 1) : -1;
  const cfg: PresetCfg = p.sc ? Object.assign({}, p, p.sc[S.scen]) : p;
  // Запас за окном — часть постановки (кольцо становится длиннее), поэтому
  // пресет задаёт его наравне с L и N, а чего в пресете нет, то сбрасывается:
  // иначе задача считалась бы не тем, что написано в пресете.
  S.pad = cfg.pad || 1; syncPad();
  $i('N').value = String(cfg.N); $i('L').value = String(cfg.L);
  sim.resize(cfg.N*S.pad, cfg.L*S.pad);
  $i('eq').value = cfg.eq;
  autosizeEq();
  S.sel = 0; S.ic = []; S.icI = []; S.vis = [];
  S.k0 = cfg.k0 || 0; $i('k0').value = String(S.k0);
  if (!applySystem(cfg.eq, Object.assign({}, cfg.p || {}))) return;
  S.autodt = true; $i('autodt').checked = true;
  S.yMin = cfg.y[0]; S.yMax = cfg.y[1];
  $i('ymin').value = String(S.yMin); $i('ymax').value = String(S.yMax);
  for (const comp of sim.model!.comps) {
    const d = cfg.ic![comp.name];
    const q = d ? makeIC(Object.assign({ x0:0, edge:S.edge }, d), comp.complex)
                : { re:new Float64Array(sim.N), im:null };
    setIC(comp.ci, q.re, q.im);
  }
  const first = cfg.ic![sim.model!.comps[0].name];
  if (first && first.tool) {
    S.tool = first.tool === 'noise' ? 'sech' : first.tool;
    S.width = first.w || S.width; $i('wid').value = String(S.width);
    [...$('tools').children].forEach(x =>
      x.classList.toggle('on', (x as HTMLElement).dataset.tool === S.tool));
  }
  if (cfg.vis) for (const c of sim.model!.comps) if (c.name in cfg.vis) S.vis[c.ci] = cfg.vis[c.name];
  if (cfg.sel) { const c = sim.model!.comps.find(q => q.name === cfg.sel); if (c) S.sel = c.ci; }
  // темп пресета — это и есть «×1»: скорость всегда сбрасывается вместе с задачей
  S.baseSpf = cfg.spf || 6; S.spf = S.baseSpf; $i('spf').value = String(S.spf); syncSpeed();
  setSmooth(!!cfg.smooth);
  buildLegend(sim.model!);
  buildScen(idx);                      // подсветить выбранный сценарий
  sim.t = 0; clearXT();
  // у некоторых задач автоподбор dt (он рассчитан на адвекцию u·ux) слишком осторожен
  S.autodt = !cfg.fixdt; $i('autodt').checked = S.autodt;
  sim.setDt(cfg.dt); $i('dt').value = String(cfg.dt);
  draw();
}
