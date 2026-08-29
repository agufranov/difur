/* Общее состояние интерфейса. Модульных границ у старого app.js не было —
   секции связывал десяток верхнеуровневых let/const; теперь это явный стор:
   S — состояние UI, sim — единственный экземпляр решателя, view — размеры
   холста, rt — счётчики кадра. */
import { Sim } from '../core';

/* телефонная раскладка. Условие обязано совпадать с @media в src/styles/main.css
   символ в символ: стили прячут боковую панель в шторку, а этот matchMedia
   переносит пульт в нижнюю строку. Разъедутся — пульт окажется в двух местах
   сразу. Второе условие — телефон лёжа, там мало высоты, а не ширины. */
export const MOB = '(max-width:760px), (max-height:480px) and (max-width:1000px)';
export const mob = matchMedia(MOB);

/* цвет — по полю; компоненты (u, ut, utt) — тем же цветом, но пунктиром */
export const COLORS = ['#5ad1ff','#ffb454','#63d68a','#ff7ba8','#b18cff','#ffe066','#8ce8d0'];

export const $ = (id: string) => document.getElementById(id) as HTMLElement;
/** то же, но для полей ввода: .value/.checked есть только у HTMLInputElement */
export const $i = (id: string) => document.getElementById(id) as HTMLInputElement;

export const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
export const wrapd = (d: number, L: number) => d - L * Math.round(d / L);
export const escHTML = (s: string) =>
  s.replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' } as Record<string, string>)[c]);
/** то же для значения атрибута: кавычка внутри `data-tip` порвала бы разметку */
export const escAttr = (s: string) => escHTML(s).replace(/"/g, '&quot;');

/** перетаскивание мышью: перо — след точек, остальные инструменты — профиль */
export type Drag =
  | { pen: true; lastPx: number; lastPy: number }
  | { pen?: undefined; px0: number; py0: number; x0: number; A: number; w: number };

export interface UIState {
  tool: string; width: number; edge: number; add: boolean; live: boolean;
  running: boolean; spf: number; baseSpf: number; autodt: boolean; coarse: boolean;
  autoY: boolean; yMin: number; yMax: number; showIC: boolean;
  sel: number; vis: boolean[]; ic: (Float64Array | null)[]; icI: (Float64Array | null)[];
  base: Float64Array | null; drag: Drag | null; dead: boolean;
  scen: number; k0: number; wasRunning: boolean; smooth: boolean; appliedEq: string | null;
  pad: number;
}

export const S: UIState = {
  tool:'sech', width:2, edge:0.4, add:false, live:false,
  running:false, spf:6, baseSpf:6, autodt:true, coarse:false,
  autoY:true, yMin:-1, yMax:4, showIC:true,
  sel:0, vis:[], ic:[], icI:[], base:null, drag:null, dead:false,
  scen:-1,                             // выбранный сценарий пресета (-1 — сценариев нет)
  pad:1,                               // расчётная область шире окна показа во столько раз (1, 2, 4)
  k0:0,                                // импульс: фаза e^{ik₀x} у комплексного поля
  wasRunning:false,                    // счёт до нажатия мыши — вернуть после отпускания
  smooth:false,                        // гашение осцилляций опрокидывания
  appliedEq:null as string | null      // текст, который сейчас стоит в модели
};

export const sim = new Sim();

/** размеры холста графика в CSS-пикселях; ставит fitCanvas() */
export const view = { PW: 800, PH: 400 };

/** Длина того, что видно. Расчётное кольцо `sim.L` может быть шире окна в
 *  `S.pad` раз: кольцо от этого не размыкается, но волна, доехав до края экрана,
 *  уезжает в невидимый запас, а не влетает сразу же с другой стороны. Всё, что
 *  на экране, отмеряется отсюда; всё, что про счёт (dx, k, диагностика), —
 *  по-прежнему от `sim.L`. */
export const viewL = () => sim.L / S.pad;

/** Полоска-радар (поле целиком) занимает верх холста, и график съезжает под неё.
 *  Функция, а не поле в `view`: поле пришлось бы синхронизировать при каждой
 *  смене запаса, а забытая синхронизация проявилась бы съехавшей мышью. */
export const RADAR_H = 26;
export const topInset = () => S.pad > 1 ? RADAR_H + 8 : 0;

/** счётчики кадра. stepBudgetMs — сколько миллисекунд кадра отдаём счёту;
    меняется только из тестов (setBudget): под virtual-time в headless
    performance.now() стоит, и обрыв кадра иначе не воспроизвести. */
export const rt = { stepBudgetMs: 12, stepsDone: 0, stepsPerSec: 0, spsT0: 0, spsN: 0 };
