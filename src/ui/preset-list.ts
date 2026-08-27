/* ================= пресеты: список, превью, загрузка ================= */
import { $, $i, S, clamp, escHTML, mob, sim } from './state';
import { PRESETS, Preset, PresetCfg } from './presets';
import { chipRow, chipWhy } from './chips-view';
import { fitMath, prettyEq } from './math-preview';
import { autosizeEq } from './highlight';
import { applySystem } from './apply';
import { makeIC, setIC } from './ic';
import { buildLegend } from './diag';
import { buildScen } from './scen';
import { clearXT, draw } from './render';
import { setSmooth, syncPad, syncPlay, syncSpeed } from './controls';

const sel = $('preset') as HTMLSelectElement;
const pbtn = $('presetbtn'), plist = $('plist'), eqprev = $('eqprev');
let hiIdx = -1;

const isOpen = () => plist.classList.contains('on');
const itemAt = (i: number) => plist.children[i] as HTMLElement | undefined;

export function syncPresetBtn() {
  const i = +sel.value;
  pbtn.textContent = i >= 0 ? PRESETS[i].name : '— своё уравнение —';
}

/** превью формулы — справа от списка, по вертикали у самого пункта.
    На телефоне справа места нет, поэтому превью ложится внизу экрана во всю
    ширину и получает кнопку «выбрать»: тап по пункту показывает формулу, а не
    применяет её сразу — иначе вёрстку формулы на телефоне никто бы не увидел. */
const PREV_GAP = 8;                    // зазор между низом списка и верхом превью

function showPrev(i: number) {
  const el = itemAt(i); if (!el) return;
  const phone = mob.matches;
  /* Заголовок — имя пресета: в списке и на кнопке длинное имя обрезается
     многоточием («Опрокидывание горба (Бюргерс без…»), и целиком его негде
     прочитать. В превью оно переносится и видно полностью. */
  eqprev.innerHTML = '<div class="ttl">' + escHTML(PRESETS[i].name) + '</div>' +
    prettyEq(PRESETS[i].eq) + chipWhy(i) +
    (phone ? '<button class="pick" data-i="' + i + '">выбрать</button>' : '');
  fitMath(eqprev);                     // скобки рисуются по уже измеренной высоте
  eqprev.classList.toggle('phone', phone);
  eqprev.classList.add('on');
  if (phone) {                         // место и размер задаёт CSS, инлайн — снять
    eqprev.style.left = ''; eqprev.style.top = '';
    /* Превью лежит внизу экрана, список раскрывается сверху — и они налезали друг
       на друга: у длинной формулы с расшифровкой фишек превью съедало нижние
       пункты. Высота превью зависит от пресета, поэтому потолок списка считается
       по факту, от измеренного верхнего края превью, а не задаётся в CSS числом. */
    const top = eqprev.getBoundingClientRect().top;
    plist.style.maxHeight = Math.max(90, top - PREV_GAP - plist.getBoundingClientRect().top) + 'px';
    el.scrollIntoView({ block:'nearest' });   // список ужался — пункт под пальцем не прятать
    return;
  }
  const lr = plist.getBoundingClientRect(), ir = el.getBoundingClientRect();
  const w = eqprev.offsetWidth, h = eqprev.offsetHeight;
  const right = lr.right + 10;
  eqprev.style.left = (right + w + 8 <= innerWidth ? right
                       : Math.max(8, lr.left - w - 10)) + 'px';
  eqprev.style.top = clamp(ir.top - 10, 8, Math.max(8, innerHeight - h - 8)) + 'px';
}
function hidePrev() {
  eqprev.classList.remove('on');
  plist.style.maxHeight = '';          // потолок был подогнан под превью — вернуть в CSS
}

function markHi() {
  [...plist.children].forEach((el, i) => {
    el.classList.toggle('hi', i === hiIdx);
    el.classList.toggle('cur', i === +sel.value);
  });
  if (hiIdx >= 0) showPrev(hiIdx); else hidePrev();
}

function openList(on: boolean) {
  plist.classList.toggle('on', on);
  pbtn.classList.toggle('open', on);
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
    d.className = 'pitem'; d.dataset.i = String(i);
    d.innerHTML = '<span class="nm"></span>' + chipRow(i);
    (d.querySelector('.nm') as HTMLElement).textContent = p.name;   // имя — текстом, значки — рядом справа
    plist.appendChild(d);
  });

  pbtn.onclick = () => openList(!isOpen());
  plist.addEventListener('pointerover', e => {
    const it = (e.target as HTMLElement).closest('.pitem') as HTMLElement | null;
    if (it) { hiIdx = +it.dataset.i!; markHi(); }
  });
  // на телефоне палец уходит с пункта сразу после тапа — превью не должно гаснуть
  plist.addEventListener('pointerleave', () => { if (!mob.matches) hidePrev(); });
  plist.addEventListener('click', e => {
    const it = (e.target as HTMLElement).closest('.pitem') as HTMLElement | null;
    if (!it) return;
    const i = +it.dataset.i!;
    /* Телефон: тап по пункту только показывает формулу, применяет её одна кнопка —
       «выбрать» в превью. Раньше повторный тап по тому же пункту тоже применял, и
       список закрывался под пальцем у того, кто просто листал задачи и вернулся
       к уже открытой: выбор происходил там, где его не просили. */
    if (mob.matches) { hiIdx = i; markHi(); return; }
    choose(i);
  });
  eqprev.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('.pick') as HTMLElement | null;
    if (b) choose(+b.dataset.i!);
  });
  document.addEventListener('pointerdown', e => {
    // превью с кнопкой «выбрать» лежит вне #presetbox — по нему список не закрываем,
    // иначе кнопка исчезнет из-под пальца ещё до click
    if (isOpen() && !$('presetbox').contains(e.target as Node) && !eqprev.contains(e.target as Node))
      openList(false);
  });
  pbtn.addEventListener('keydown', e => {
    if (e.key === 'Escape') { openList(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen()) { openList(true); return; }
      hiIdx = clamp((hiIdx < 0 ? +sel.value : hiIdx) + (e.key === 'ArrowDown' ? 1 : -1),
                    0, PRESETS.length - 1);
      markHi(); itemAt(hiIdx)!.scrollIntoView({ block:'nearest' });
      return;
    }
    if (isOpen() && (e.key === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      if (hiIdx >= 0) choose(hiIdx);
    }
  });
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
