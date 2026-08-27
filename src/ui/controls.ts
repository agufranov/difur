/* ================= пульт, переключатели, скорость, сетка, клавиши ================= */
import { $, $i, S, clamp, sim } from './state';
import { ICON, toolIcon } from './icons';
import { TOOLS } from './presets';
import { clearXT, draw, pushRow } from './render';
import { updateDiag } from './diag';
import { refreshDt } from './loop';
import { commit, setIC } from './ic';
import { makeProfile } from './geometry';
import { syncFx } from './chips-view';
import { applySystem } from './apply';

/* data-icon — то, по чему видно состояние кнопки снаружи (в том числе тесту):
   у svg нет textContent, а раньше проверяли именно его */
export function syncPlay(){
  const k = S.running ? 'pause' : 'play';
  $('play').dataset.icon = k;
  $('play').innerHTML = ICON[k];
  $('play').classList.toggle('on', S.running);
}

export function setSmooth(on: boolean) {
  S.smooth = !!on;
  sim.smooth = S.smooth ? 1 : 0;
  $('smooth').classList.toggle('on', S.smooth);
  syncFx();                            // «гашение включено» — фишка, и её включает эта кнопка
}

/* ================= кнопки начальных данных ================= */
export function buildTools() {
  const box = $('tools');
  box.innerHTML = '';
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.dataset.tool = t.id;
    b.setAttribute('data-tip', t.name + '|' + t.tip);
    b.className = t.id === S.tool ? 'on' : '';
    b.innerHTML = toolIcon(t.id);
    box.appendChild(b);
  }
}

/* ================= скорость ================= */
/** «×1» — не 6 шагов, а темп, который задал пресет (`S.baseSpf`): у КдФ это 10,
 *  у волнового 10, по умолчанию 6. Иначе после загрузки пресета ни одна кнопка
 *  не была бы подсвечена. Точность от множителя не зависит вовсе — это только
 *  число шагов на кадр, а кадр всё равно обрывается по бюджету. */
const SPEEDS = [1, 2, 5, 10, 25, 50];

function buildSpeed() {
  $('speed').innerHTML = SPEEDS.map(k =>
    '<button data-k="' + k + '">×' + k + '</button>').join('');
  syncSpeed();
}
export function syncSpeed() {
  for (const b of $('speed').children as HTMLCollectionOf<HTMLElement>)
    b.classList.toggle('on', S.spf === Math.round(S.baseSpf * +b.dataset.k!));
}

function regrid() {
  const N = +$i('N').value, L = Math.max(0.1, +$i('L').value);
  const oldN = sim.N;
  const old = sim.model!.comps.map(c => Float64Array.from(sim.getU(c.ci)));
  const oldI = sim.model!.comps.map(c => c.complex ? Float64Array.from(sim.getUi(c.ci)) : null);
  sim.resize(N, L);
  // пересадка на новую сетку линейной интерполяцией — мнимую часть тем же приёмом,
  // иначе смена N у комплексного поля стирала бы фазу
  const resample = (src: Float64Array) => {
    const out = new Float64Array(N);
    for (let j = 0; j < N; j++) {
      const q = j*oldN/N, i0 = Math.floor(q) % oldN, f = q - Math.floor(q);
      out[j] = src[i0]*(1-f) + src[(i0+1)%oldN]*f;
    }
    return out;
  };
  for (let c = 0; c < sim.M; c++)
    setIC(c, resample(old[c]), oldI[c] ? resample(oldI[c]!) : null);
  clearXT(); refreshDt(true); draw();
  syncFx();                            // фишки по S(k) читаются на тех k, что есть в сетке
}

export function initControls() {
  $('stepb').innerHTML = ICON.step;
  $('reset').innerHTML = ICON.reset;
  $('apply').innerHTML = ICON.apply;

  $('smooth').onclick = () => setSmooth(!S.smooth);

  $('play').onclick = () => { if (S.dead) return; S.running = !S.running; syncPlay(); };
  $('stepb').onclick = () => {
    if (S.dead) return;
    // шаг — это «посмотреть по кадрам», поэтому он сначала останавливает счёт:
    // иначе кадр анимации тут же затирает то, что хотели разглядеть
    if (S.running) { S.running = false; syncPlay(); }
    for (let i = 0; i < S.spf; i++) sim.step();
    if (!sim.diagnostics().finite) { S.dead = true; syncPlay(); }
    pushRow(); draw(); updateDiag();
  };
  $('reset').onclick = () => {
    S.running = false; syncPlay();          // сброс всегда ставит на паузу: иначе t=0 промелькнёт
    for (let c = 0; c < sim.M; c++) if (S.ic[c]) sim.setU(c, S.ic[c]!, S.icI[c]);
    sim.t = 0; S.dead = false; clearXT(); refreshDt(true); draw();
  };
  $('zero').onclick = () => commit(new Float64Array(sim.N), false);
  $('rand').onclick = () => commit(makeProfile({ tool:'noise', A:0.5 }), false);

  $('apply').onclick = () => applySystem($i('eq').value, sim.model ? sim.model.params : {});
  $i('eq').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('apply').click(); }
  });

  $('tools').addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button[data-tool]') as HTMLElement | null;
    if (!b) return;
    S.tool = b.dataset.tool!;
    [...$('tools').children].forEach(x => x.classList.toggle('on', x === b));
  });

  $i('spf').oninput = () => { S.spf = clamp(+$i('spf').value|0, 1, 2000); syncSpeed(); };
  $i('dt').oninput = () => { const v = +$i('dt').value; if (v > 0) { S.autodt = false; $i('autodt').checked = false; sim.setDt(v); } };
  $i('autodt').onchange = () => { S.autodt = $i('autodt').checked; refreshDt(true); };
  $i('coarsedt').onchange = () => { S.coarse = $i('coarsedt').checked; refreshDt(true); };

  buildSpeed();
  $('speed').addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button[data-k]') as HTMLElement | null;
    if (!b) return;
    S.spf = clamp(Math.round(S.baseSpf * +b.dataset.k!), 1, 2000);
    $i('spf').value = String(S.spf);
    syncSpeed();
  });
  $i('k0').oninput = () => S.k0 = +$i('k0').value || 0;
  $i('wid').oninput = () => S.width = Math.max(1e-3, +$i('wid').value);
  $i('edge').oninput = () => S.edge = Math.max(1e-3, +$i('edge').value);
  $i('addm').onchange = () => S.add = $i('addm').checked;
  $i('live').onchange = () => S.live = $i('live').checked;
  $i('autoy').onchange = () => S.autoY = $i('autoy').checked;
  $i('showic').onchange = () => S.showIC = $i('showic').checked;
  $i('ymin').oninput = () => { S.yMin = +$i('ymin').value; S.autoY = false; $i('autoy').checked = false; };
  $i('ymax').oninput = () => { S.yMax = +$i('ymax').value; S.autoY = false; $i('autoy').checked = false; };

  $i('N').onchange = regrid;
  $i('L').onchange = regrid;

  window.addEventListener('keydown', e => {
    const t = e.target as HTMLElement;
    const tag = t.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (t.id === 'presetbtn') return;   // на кнопке списка пробел открывает список
    if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
    if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') $('reset').click();
  });
}
