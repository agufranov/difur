/* ================= всплывающие подсказки ================= */
import { $, clamp } from './state';

const tip = $('tip');
let tipFor: HTMLElement | null = null, tipTimer = 0;

function placeTip(el: HTMLElement) {
  const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect(), gap = 9;
  tip.classList.remove('up','dn','lf');
  /* в правой панели подсказка уходит влево от всей панели — иначе закрывает соседние кнопки */
  const panel = el.closest('aside');
  const edge = panel ? panel.getBoundingClientRect().left : 0;
  if (panel && edge - t.width - gap >= 6) {
    const top = clamp(r.top + r.height/2 - t.height/2, 6, Math.max(6, innerHeight - t.height - 6));
    tip.style.left = (edge - t.width - gap) + 'px';
    tip.style.top = top + 'px';
    tip.classList.add('lf');
    tip.style.setProperty('--ay', clamp(r.top + r.height/2 - top, 12, t.height - 12) + 'px');
    return;
  }
  const up = r.top - t.height - gap >= 6;
  const left = clamp(r.left + r.width/2 - t.width/2, 6, Math.max(6, innerWidth - t.width - 6));
  tip.style.left = left + 'px';
  tip.style.top = (up ? r.top - t.height - gap : r.bottom + gap) + 'px';
  tip.classList.add(up ? 'up' : 'dn');
  tip.style.setProperty('--ax', clamp(r.left + r.width/2 - left, 12, t.width - 12) + 'px');
}
function showTip(el: HTMLElement) {
  const raw = el.getAttribute('data-tip') || '', i = raw.indexOf('|');
  tip.innerHTML = '<b></b><i></i>';
  (tip.querySelector('b') as HTMLElement).textContent = i < 0 ? raw : raw.slice(0, i);
  (tip.querySelector('i') as HTMLElement).textContent = i < 0 ? '' : raw.slice(i + 1);
  tip.classList.add('on');
  placeTip(el);
}
export function hideTip() { clearTimeout(tipTimer); tip.classList.remove('on'); tipFor = null; }

export function initTips() {
  document.addEventListener('pointerover', ev => {
    const t = ev.target as HTMLElement;
    const el = t.closest ? (t.closest('[data-tip]') as HTMLElement | null) : null;
    if (el === tipFor) return;
    clearTimeout(tipTimer);
    tipFor = el;
    if (!el) { tip.classList.remove('on'); return; }
    tipTimer = window.setTimeout(() => { if (tipFor === el) showTip(el); }, 130);
  });
  document.addEventListener('pointerdown', hideTip, true);
  window.addEventListener('blur', hideTip);
  document.querySelector('aside')!.addEventListener('scroll', hideTip);

  /* На тачскрине наведения нет, а в подсказках лежит половина объяснений — что делает
     «крупный шаг», почему гашение меняет задачу. Поэтому долгое нажатие (420 мс)
     показывает ту же подсказку. Клик после долгого нажатия давится: иначе «подержать
     ▶, чтобы прочитать» заодно пускало бы счёт. Уход пальца больше чем на 10 px —
     это уже прокрутка панели, подсказку отменяем. */
  let pressT = 0, pressX = 0, pressY = 0, pressShown = false;
  const endPress = () => clearTimeout(pressT);

  document.addEventListener('pointerdown', ev => {
    pressShown = false;
    if (ev.pointerType === 'mouse') return;
    const t = ev.target as HTMLElement;
    const el = t.closest ? (t.closest('[data-tip]') as HTMLElement | null) : null;
    if (!el) return;
    pressX = ev.clientX; pressY = ev.clientY;
    clearTimeout(pressT);
    pressT = window.setTimeout(() => { pressShown = true; tipFor = el; showTip(el); }, 420);
  });
  document.addEventListener('pointermove', ev => {
    if (ev.pointerType !== 'mouse' && Math.hypot(ev.clientX - pressX, ev.clientY - pressY) > 10)
      endPress();
  });
  document.addEventListener('pointerup', endPress);
  document.addEventListener('pointercancel', endPress);
  document.addEventListener('click', ev => {
    if (!pressShown) return;
    pressShown = false;
    ev.preventDefault(); ev.stopPropagation();     // capture: до обработчиков самой кнопки
  }, true);
}
