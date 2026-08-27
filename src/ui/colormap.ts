/* ================= цветовые карты диаграммы x–t и фазовая раскраска ================= */
import { clamp } from './state';

export function cmap(s: number): [number, number, number] {
  s = clamp(s, -1, 1);
  const bg: [number, number, number] = [10,14,21];
  let c1, c2, t;
  if (s >= 0) { c1 = [255,157,61]; c2 = [255,244,214]; t = s; }
  else { c1 = [58,140,232]; c2 = [186,228,255]; t = -s; }
  let r,g,b;
  if (t < 0.75) { const q = t/0.75;
    r = bg[0]+(c1[0]-bg[0])*q; g = bg[1]+(c1[1]-bg[1])*q; b = bg[2]+(c1[2]-bg[2])*q; }
  else { const q = (t-0.75)/0.25;
    r = c1[0]+(c2[0]-c1[0])*q; g = c1[1]+(c2[1]-c1[1])*q; b = c1[2]+(c2[2]-c1[2])*q; }
  return [r,g,b];
}

/** тон -> rgb (s=0.85, l задаётся); нужен для комплексной диаграммы, где цвет
    приходится писать прямо в пиксели, а не строкой CSS */
export function hue2rgb(h: number, l: number): [number, number, number] {
  const s = 0.85, C = (1 - Math.abs(2*l - 1))*s, hp = h/60, X = C*(1 - Math.abs(hp % 2 - 1));
  let r=0,g=0,b=0;
  if (hp < 1) { r=C; g=X; } else if (hp < 2) { r=X; g=C; }
  else if (hp < 3) { g=C; b=X; } else if (hp < 4) { g=X; b=C; }
  else if (hp < 5) { r=X; b=C; } else { r=C; b=X; }
  const m = l - C/2;
  return [(r+m)*255, (g+m)*255, (b+m)*255];
}

/* ---- комплексное поле: кривая — модуль, цвет вдоль неё — фаза ----
   Фаза периодична, и тон периодичен — они подходят друг другу без всякой шкалы:
   arg = 0 красный, π/2 зелёный, π голубой. Частота смены тона вдоль x — это
   локальное k, то есть импульс виден прямо на картинке. */
export const phaseHue = (re: number, im: number) =>
  (Math.atan2(im, re)*57.29577951308232 + 360) % 360;
export const phaseColor = (re: number, im: number, l?: number, a?: number) =>
  'hsl(' + phaseHue(re, im).toFixed(0) + ' 85% ' + (l || 62) + '%' +
  (a === undefined ? '' : ' / ' + a) + ')';

/** Комплексная диаграмма x–t — domain coloring: тон = фаза, яркость = |ψ|.
    Ради неё фича во многом и делается: дисперсия, интерференция и фазовые сдвиги
    видны как узор, а не как «что-то шевелится». */
export function cmapCx(re: number, im: number, sc: number): [number, number, number] {
  const v = clamp(Math.hypot(re, im)/sc, 0, 1);
  const bg: [number, number, number] = [10,14,21];
  if (v < 1e-4) return bg;
  const col = hue2rgb(phaseHue(re, im), 0.55);
  const q = Math.pow(v, 0.7);                     // слабые места иначе не видно вовсе
  return [bg[0]+(col[0]-bg[0])*q, bg[1]+(col[1]-bg[1])*q, bg[2]+(col[2]-bg[2])*q];
}
