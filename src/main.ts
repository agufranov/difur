/* Точка входа интерфейса. Вся DOM-обвязка секций живёт в их init*(), а здесь —
   только порядок: он повторяет порядок верхнеуровневых обработчиков старого
   монолитного app.js, чтобы поведение при загрузке осталось прежним. */
import './styles/main.css';
import { S, rt, sim, MOB, viewL } from './ui/state';
import { PRESETS } from './ui/presets';
import { CHIPS, FX } from './ui/chips';
import { px2x, py2u, u2py, x2px } from './ui/geometry';
import { applySystem } from './ui/apply';
import { initEqInput } from './ui/eq-input';
import { initTips } from './ui/tooltip';
import { initScen } from './ui/scen';
import { initPointer } from './ui/pointer';
import { buildTools, initControls, setPad, syncPlay } from './ui/controls';
import { initPresetList, loadPreset } from './ui/preset-list';
import { initMobile, relayout } from './ui/mobile';
import { draw, fitCanvas } from './ui/render';
import { frame, frameSteps, refreshDt } from './ui/loop';
import { autosizeEq } from './ui/highlight';
import { fitMath, formatEq, prettyEq } from './ui/math-preview';

initEqInput();
initTips();
initScen();
buildTools();
initPointer();
initControls();
initPresetList();
initMobile();

/* ================= старт ================= */
relayout();
/* холст меняет размер не только вместе с окном: появилась строка ошибки — выросла
   шапка, открылась шторка, вылезла экранная клавиатура. ResizeObserver ловит все
   случаи одинаково, вместо ручного fitCanvas() из каждого такого места. */
new ResizeObserver(() => { fitCanvas(); draw(); }).observe(document.getElementById('pw')!);
window.addEventListener('resize', () => { fitCanvas(); autosizeEq(); draw(); });
fitCanvas();
loadPreset(PRESETS[0]);
syncPlay();
requestAnimationFrame(frame);

/* контракт тестов (tests/ui-driver.js, tests/ui-mobile.js): единственный глобал */
declare global { interface Window { __difur: unknown } }
window.__difur = { S, sim, PRESETS, FX, CHIPS, MOB, loadPreset, px2x, py2u, x2px, u2py, applySystem,
                   viewL, setPad,
                   prettyEq, fitMath, formatEq, refreshDt, frameSteps,
                   setBudget: (ms: number) => rt.stepBudgetMs = ms,
                   stepInfo: () => ({ done: rt.stepsDone, sps: rt.stepsPerSec }) };
