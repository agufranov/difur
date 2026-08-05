/* app.js — интерфейс: система уравнений, поля разными цветами,
   рисование начальных данных мышью, диаграмма x–t */
(function () {
'use strict';
const { Sim, buildSystem, parseOne, tokenize, scanFields, splitAtoms } = DifurCore;
const $ = id => document.getElementById(id);

/* телефонная раскладка. Условие обязано совпадать с @media в index.html символ
   в символ: стили прячут боковую панель в шторку, а этот matchMedia переносит
   пульт в нижнюю строку. Разъедутся — пульт окажется в двух местах сразу.
   Второе условие — телефон лёжа, там мало высоты, а не ширины. */
const MOB = '(max-width:760px), (max-height:480px) and (max-width:1000px)';
const mob = matchMedia(MOB);

/* цвет — по полю; компоненты (u, ut, utt) — тем же цветом, но пунктиром */
const COLORS = ['#5ad1ff','#ffb454','#63d68a','#ff7ba8','#b18cff','#ffe066','#8ce8d0'];

/* ================= пресеты ================= */

/* синус-Гордон: два кинка навстречу (упруго отталкиваются) плюс пара
   антикинков-«статистов» вдали — они нужны только чтобы поле было периодическим */
const SG = (function () {
  const c1 = -0.2, c2 = -0.6;                 // оба горба влево, правый догоняет левый
  const G = c => 1/Math.sqrt(1 - c*c);
  const K = (x,x0,g) => 4*Math.atan(Math.exp( g*(x-x0)));
  const A = (x,x0)   => 4*Math.atan(Math.exp(-(x-x0))) - 2*Math.PI;   // неподвижные «статисты»
  const B = (x,x0,c) => -2*G(c)*c/Math.cosh(G(c)*(x-x0));             // ut кинка со скоростью c
  return {
    u:  x => K(x,-12,G(c1)) + K(x,0,G(c2)) + A(x,25) + A(x,45),
    ut: x => B(x,-12,c1) + B(x,0,c2) };
})();

/* плато скорости шире горба — горб едет как твёрдое тело */
const plateau = (x, x0, w, e) => 0.5*(Math.tanh((x-x0+w)/e) - Math.tanh((x-x0-w)/e));

const PRESETS = [
  { name:'Кортевег–де Фриз (солитоны)', eq:'ut + u*ux + uxxx = 0', L:40, N:512, dt:0.005,
    y:[-1,4], ic:{ u:{tool:'sech',A:3,w:2} } },
  { name:'мКдФ', eq:'ut + 6u^2*ux + uxxx = 0', L:40, N:512, dt:0.002, y:[-0.5,2],
    ic:{ u:{tool:'sech',A:1,w:1.5} } },
  { name:'Бюргерс (ударная волна)', eq:'ut + u*ux = nu*uxx', p:{nu:0.02}, L:20, N:512, dt:0.002,
    y:[-1.5,1.5], ic:{ u:{tool:'sin',A:1,w:5} } },
  { name:'Курамото–Сивашинский (хаос)', eq:'ut + u*ux + uxx + uxxxx = 0', L:100, N:512, dt:0.05,
    y:[-3.5,3.5], ic:{ u:{tool:'noise',A:0.5,w:2} } },
  { name:'Теплопроводность', eq:'ut = k*uxx', p:{k:0.5}, L:20, N:256, dt:0.01, y:[-0.3,1.3],
    ic:{ u:{tool:'step',A:1,w:3} } },
  { name:'Перенос', eq:'ut + c*ux = 0', p:{c:1}, L:20, N:256, dt:0.01, y:[-0.3,1.3],
    ic:{ u:{tool:'step',A:1,w:2} } },
  { name:'Эйри (чистая дисперсия)', eq:'ut + uxxx = 0', L:40, N:512, dt:0.005, y:[-1,1.3],
    ic:{ u:{tool:'gauss',A:1,w:1} } },
  { name:'Кавахара', eq:'ut + u*ux + uxxx - uxxxxx = 0', L:40, N:512, dt:0.002, y:[-1,3],
    ic:{ u:{tool:'sech',A:2,w:2} } },
  { name:'Фишер–КПП (фронт)', eq:'ut = D*uxx + r*u*(1-u)', p:{D:0.2,r:1}, L:40, N:512, dt:0.01,
    y:[-0.2,1.3], ic:{ u:{tool:'step',A:1,w:3} } },
  { name:'Аллен–Кан', eq:'ut = eps*uxx + u - u^3', p:{eps:0.1}, L:40, N:512, dt:0.005,
    y:[-1.4,1.4], ic:{ u:{tool:'noise',A:0.4,w:2} } },

  { name:'▸ Волновое уравнение (utt)', eq:'utt = c^2*uxx', p:{c:1}, L:40, N:512, dt:0.01,
    y:[-1.2,1.2], ic:{ u:{tool:'gauss',A:1,w:1.5}, ut:{tool:'const',A:0} } },
  { name:'▸ Клейн–Гордон (utt)', eq:'utt = uxx - m^2*u - u^3', p:{m:1}, L:40, N:512, dt:0.005,
    y:[-1.5,1.5], ic:{ u:{tool:'gauss',A:1.2,w:2}, ut:{tool:'const',A:0} } },
  { name:'▸ Волна с трением u–v–z', eq:'utt = -v*ut\nvt = -V*ut\nzt = -u*v*vxx*ux',
    p:{V:0.5}, L:20, N:256, dt:0.005, y:[-1.6,2],
    ic:{ u:{tool:'gauss',A:1,w:1.5}, ut:{tool:'const',A:-1}, v:{tool:'const',A:0.3}, z:{tool:'const',A:0} } },
  { name:'▸ FitzHugh–Nagumo (2 поля)', eq:'ut = Du*uxx + u - u^3/3 - v\nvt = Dv*vxx + eps*(u + a - b*v)',
    p:{Du:1,Dv:0,eps:0.08,a:0.7,b:0.8}, L:60, N:512, dt:0.02, y:[-2.5,2.5],
    ic:{ u:{tool:'step',A:2.7,w:5,base:-1.2}, v:{tool:'const',A:-0.6} } },
  { name:'▸ Хищник–жертва (2 поля)', eq:'ut = a*uxx + u*(1-u) - u*v\nvt = b*vxx + c*u*v - d*v',
    p:{a:0.05,b:0.5,c:2,d:0.6}, L:60, N:512, dt:0.01, y:[-0.2,1.6],
    ic:{ u:{tool:'const',A:0.5}, v:{tool:'gauss',A:0.3,w:2} } },

  { name:'★ Опрокидывание горба (Бюргерс без вязкости)', eq:'ut + u*ux = 0', L:20, N:512,
    dt:0.002, y:[-0.3,1.2], smooth:true,
    ic:{ u:{tool:'gauss',A:1,w:2} } },
  { name:'★ Упругий отскок солитонов (синус-Гордон)', eq:'utt = uxx - sin(u)', L:100, N:1024,
    dt:0.01, fixdt:true, spf:10, y:[-0.3,1.8], sel:'ut', vis:{ u:false, ut:true },
    ic:{ u:{fn:SG.u}, ut:{fn:SG.ut} } },
  { name:'★ Перенос горба со своей скоростью', eq:'ut = -v*ux\nvt = -v*vx + nu*vxx',
    p:{nu:0.05}, L:60, N:512, dt:0.003, y:[-0.5,1.3],
    ic:{ u:{fn:x => Math.exp(-Math.pow((x+12)/2,2)) + Math.exp(-Math.pow((x-12)/2,2))},
         v:{fn:x => 0.3*plateau(x,-12,5,1.5) - 0.3*plateau(x,12,5,1.5)} } }
];

/* ================= инструменты рисования ================= */
/* форма для миниатюры: s ∈ [-1,1] -> значение (масштаб произвольный) */
const PEN_PTS = [[-1,.12],[-.72,.62],[-.5,.22],[-.16,.92],[.14,.34],[.46,.76],[.74,.28],[1,.55]];
function toolShape(id, s) {
  switch (id) {
    case 'sech':  { const c = Math.cosh(s/0.16); return 1/(c*c); }   // острее, с хвостами
    case 'gauss': return Math.exp(-(s/0.42)*(s/0.42));               // шире и круглее
    case 'step':  return 0.5*(Math.tanh((s+0.45)/0.12) - Math.tanh((s-0.45)/0.12));
    case 'sin':   return Math.cos(2.5*Math.PI*s);
    case 'const': return 0.62;
    case 'noise': return 0.46*Math.sin(3.1*Math.PI*s+0.7) + 0.3*Math.sin(7.3*Math.PI*s+2.1)
                       + 0.16*Math.sin(11.5*Math.PI*s+4.2);
    case 'pen': {
      for (let i = 1; i < PEN_PTS.length; i++)
        if (s <= PEN_PTS[i][0]) {
          const a = PEN_PTS[i-1], b = PEN_PTS[i];
          return a[1] + (b[1]-a[1])*(s-a[0])/(b[0]-a[0]);
        }
      return PEN_PTS[PEN_PTS.length-1][1];
    }
    default: return 0;
  }
}

/** миниатюра профиля: тот же график, что нарисует инструмент */
function toolIcon(id) {
  const W = 60, H = 26, PAD = 4, n = id === 'pen' ? PEN_PTS.length*6 : 56;
  const v = [];
  let lo = 0, hi = 1;
  for (let i = 0; i < n; i++) {
    const y = toolShape(id, -1 + 2*i/(n-1));
    v.push(y); lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  const Y = u => (H-PAD - (u-lo)/(hi-lo)*(H-2*PAD)).toFixed(1);
  const X = i => (2 + i/(n-1)*(W-4)).toFixed(1);
  let d = '';
  for (let i = 0; i < n; i++) d += (i ? 'L' : 'M') + X(i) + ' ' + Y(v[i]);
  const zero = lo < 0 ? '<line class="zero" x1="1" y1="'+Y(0)+'" x2="'+(W-1)+'" y2="'+Y(0)+'"/>' : '';
  const nib = id === 'pen'
    ? '<circle cx="'+X(n-1)+'" cy="'+Y(v[n-1])+'" r="2.6" fill="currentColor"/>' : '';
  return '<svg viewBox="0 0 '+W+' '+H+'" aria-hidden="true">' + zero +
         '<path class="sh" d="' + d + '"/>' + nib + '</svg>';
}

/* Иконки пульта и «применить» — рисованные, а не юникодные глифы. Глифы взяли не
   из того шрифта: ⏭ система считает эмодзи и рисует цветной картинкой с подложкой,
   ⟲ приходит из запасного шрифта и выходит вдвое мельче соседей. У svg такой
   зависимости нет — размер и цвет задаём мы. */
const ICON = {
  play:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 4.2 19 12 6.5 19.8z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor">' +
         '<rect x="6.6" y="4.5" width="4" height="15" rx="1"/>' +
         '<rect x="13.4" y="4.5" width="4" height="15" rx="1"/></svg>',
  step:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 4.2 15 12 4.5 19.8z"/>' +
         '<rect x="16.6" y="4.2" width="3.2" height="15.6" rx="1"/></svg>',
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
         'stroke-linecap="round" stroke-linejoin="round">' +
         '<polyline points="2.5 4.5 2.5 10.5 8.5 10.5"/>' +
         '<path d="M5 15a8.5 8.5 0 1 0 2-8.8l-4.5 4.3"/></svg>',
  apply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
         'stroke-linecap="round" stroke-linejoin="round">' +
         '<path d="M20 5.5v5a3 3 0 0 1-3 3H5"/><polyline points="9.5 10 5 13.5 9.5 17"/></svg>'
};

const TOOLS = [
  { id:'sech',  name:'Шапочка',   tip:'sech²-горб — профиль солитона КдФ. Тянуть ↕ амплитуда, ↔ ширина' },
  { id:'gauss', name:'Гаусс',     tip:'Колокол exp(−(x/w)²) — гладкий, без длинных хвостов' },
  { id:'step',  name:'Ступенька', tip:'Плато шириной w со сглаженным краем (см. поле «край»)' },
  { id:'sin',   name:'Синус',     tip:'Косинус с целым числом периодов на отрезке — точно периодичен' },
  { id:'const', name:'Константа', tip:'Ровное значение по всему x: высота задаётся мышью' },
  { id:'pen',   name:'Перо',      tip:'Рисовать профиль от руки, точка за точкой' },
  { id:'noise', name:'Шум',       tip:'Восемь гармоник со случайными фазами — затравка для неустойчивостей' }
];

/* ================= состояние ================= */
const S = {
  tool:'sech', width:2, edge:0.4, add:false, live:false,
  running:false, spf:6, baseSpf:6, autodt:true, coarse:false,
  autoY:true, yMin:-1, yMax:4, showIC:true,
  sel:0, vis:[], ic:[], base:null, drag:null, dead:false,
  wasRunning:false,                    // счёт до нажатия мыши — вернуть после отпускания
  smooth:false,                        // гашение осцилляций опрокидывания
  appliedEq:null                       // текст, который сейчас стоит в модели
};

const sim = new Sim();
const plot = $('plot'), pctx = plot.getContext('2d');
const xt = $('xt'), xctx = xt.getContext('2d');
const XT_W = 1200, XT_H = 400, XT_MAX = 8;
xt.width = XT_W; xt.height = XT_H;
let xtBuf = [], xtScale = [], lastFrameDt = 0;
let PW = 800, PH = 400;

/* ================= утилиты ================= */
const clamp = (v,a,b) => v < a ? a : v > b ? b : v;
const wrapd = (d,L) => d - L * Math.round(d / L);
const compColor = c => COLORS[sim.model.fields.indexOf(c.f) % COLORS.length];

function x2px(x){ return (x + sim.L/2) / sim.L * PW; }
function px2x(px){ return px / PW * sim.L - sim.L/2; }
function u2py(u){ return (S.yMax - u) / (S.yMax - S.yMin) * PH; }
function py2u(py){ return S.yMax - py / PH * (S.yMax - S.yMin); }

function profile(tool, x, x0, A, w, edge, L) {
  const d = wrapd(x - x0, L);
  switch (tool) {
    case 'sech':  { const c = Math.cosh(d/w); return A/(c*c); }
    case 'gauss': return A * Math.exp(-(d/w)*(d/w));
    case 'step':  return A * 0.5 * (Math.tanh((d + w)/edge) - Math.tanh((d - w)/edge));
    case 'sin':   { const m = Math.max(1, Math.round(L/(2*w))); return A*Math.cos(2*Math.PI*m*d/L); }
    case 'const': return A;
    default: return 0;
  }
}

function makeProfile(desc) {
  const N = sim.N, out = new Float64Array(N);
  const base = desc.base || 0;
  if (desc.fn) { for (let j = 0; j < N; j++) out[j] = desc.fn(sim.x[j], sim.L); return out; }
  if (desc.tool === 'noise') {
    for (let m = 1; m <= 8; m++) {
      const ph = Math.random()*2*Math.PI, a = desc.A*(Math.random()*2-1)/m;
      for (let j = 0; j < N; j++) out[j] += a*Math.sin(2*Math.PI*m*sim.x[j]/sim.L + ph);
    }
    for (let j = 0; j < N; j++) out[j] += base;
    return out;
  }
  for (let j = 0; j < N; j++)
    out[j] = base + profile(desc.tool, sim.x[j], desc.x0 || 0, desc.A, desc.w, desc.edge || S.edge, sim.L);
  return out;
}

/* ================= начальные данные ================= */
function commit(u, keepTime) {
  sim.setU(S.sel, u);
  S.ic[S.sel] = Float64Array.from(sim.getU(S.sel));
  if (!keepTime) { sim.t = 0; clearXT(); }
  S.dead = false;
  refreshDt(true);
  draw();
}

function clearXT() {
  xtBuf = []; xtScale = [];
  for (let c = 0; c < Math.min(sim.M, XT_MAX); c++) {
    const img = xctx.createImageData(XT_W, XT_H), d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i]=10; d[i+1]=14; d[i+2]=21; d[i+3]=255; }
    xtBuf.push(img); xtScale.push(1e-6);
  }
  showXT();
}

/* ================= диаграмма x–t ================= */
function cmap(s) {
  s = clamp(s, -1, 1);
  const bg = [10,14,21];
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

function pushRow() {
  const N = sim.N, dg = sim.diagnostics();
  for (let c = 0; c < xtBuf.length; c++) {
    const u = sim.getU(c), d = xtBuf[c].data;
    const mx = isFinite(dg.per[c].max) ? dg.per[c].max : 0;
    xtScale[c] = Math.max(mx, xtScale[c]*0.995, 1e-6);
    const sc = xtScale[c];
    d.copyWithin(0, XT_W*4);
    const off = (XT_H-1)*XT_W*4;
    for (let px = 0; px < XT_W; px++) {
      const j = Math.min(N-1, Math.floor(px*N/XT_W));
      const col = cmap(u[j]/sc);
      d[off+4*px] = col[0]; d[off+4*px+1] = col[1]; d[off+4*px+2] = col[2]; d[off+4*px+3] = 255;
    }
  }
  showXT();
}
function showXT() {
  if (xtBuf[S.sel]) xctx.putImageData(xtBuf[S.sel], 0, 0);
  else { xctx.fillStyle = '#0a0e15'; xctx.fillRect(0,0,XT_W,XT_H); }
  const n = sim.model ? sim.model.comps[S.sel].name : '';
  $('xtag').textContent = 'диаграмма x–t: ' + n + ' (время вниз)';
}

/* ================= отрисовка ================= */
function fitCanvas() {
  const r = plot.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  PW = Math.max(50, r.width); PH = Math.max(50, r.height);
  plot.width = Math.round(PW*dpr); plot.height = Math.round(PH*dpr);
  pctx.setTransform(dpr,0,0,dpr,0,0);
}

function niceStep(range) {
  const raw = range/6, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw/p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10)*p;
}

function curve(arr, color, dash, width, alpha) {
  const ctx = pctx, N = sim.N;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  for (let j = 0; j < N; j++) {
    const X = x2px(sim.x[j]), Y = u2py(arr[j]);
    j ? ctx.lineTo(X,Y) : ctx.moveTo(X,Y);
  }
  ctx.stroke();
  ctx.restore();
}

function draw() {
  const c = pctx;
  c.clearRect(0,0,PW,PH);
  c.fillStyle = '#0e1420'; c.fillRect(0,0,PW,PH);
  c.font = '10px Consolas,monospace'; c.lineWidth = 1;

  const sy = niceStep(S.yMax - S.yMin);
  for (let v = Math.ceil(S.yMin/sy)*sy; v <= S.yMax; v += sy) {
    const y = u2py(v), zero = Math.abs(v) < 1e-9;
    c.strokeStyle = zero ? '#2f4560' : '#18222f';
    c.beginPath(); c.moveTo(0,y); c.lineTo(PW,y); c.stroke();
    c.fillStyle = '#5d708a';
    c.fillText(v.toFixed(Math.max(0, -Math.floor(Math.log10(sy)))), 4, y-3);
  }
  const sx = niceStep(sim.L);
  for (let v = Math.ceil(-sim.L/2/sx)*sx; v <= sim.L/2; v += sx) {
    const x = x2px(v);
    c.strokeStyle = '#18222f';
    c.beginPath(); c.moveTo(x,0); c.lineTo(x,PH); c.stroke();
    c.fillStyle = '#41536b'; c.fillText(v.toFixed(0), x+3, PH-6);
  }
  if (!sim.model) return;

  // начальные условия — призраком
  if (S.showIC)
    for (const comp of sim.model.comps)
      if (S.vis[comp.ci] && S.ic[comp.ci])
        curve(S.ic[comp.ci], compColor(comp), [3,4], 1, 0.28);

  // заливка под выбранным полем
  const sel = sim.model.comps[S.sel];
  if (S.vis[S.sel]) {
    const col = compColor(sel), u = sim.getU(S.sel);
    const g = c.createLinearGradient(0, u2py(S.yMax), 0, u2py(S.yMin));
    g.addColorStop(0, col + '33'); g.addColorStop(1, col + '03');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(x2px(sim.x[0]), u2py(0));
    for (let j = 0; j < sim.N; j++) c.lineTo(x2px(sim.x[j]), u2py(u[j]));
    c.lineTo(x2px(sim.x[sim.N-1]), u2py(0)); c.closePath(); c.fill();
  }

  for (const comp of sim.model.comps) {
    if (!S.vis[comp.ci]) continue;
    const isSel = comp.ci === S.sel;
    if (isSel) { c.shadowColor = compColor(comp) + '99'; c.shadowBlur = 8; }
    curve(sim.getU(comp.ci), compColor(comp),
          comp.d ? [7,4] : [], isSel ? 2.2 : 1.5, comp.d ? 0.85 : 1);
    c.shadowBlur = 0;
  }
}

/* ================= автомасштаб ================= */
const Y_LIMIT = 1000;     // дальше автомасштаб не уезжает: при разносе видно, что разнесло, и хватит

function autoscale() {
  if (!S.autoY || S.drag || !sim.model) return;
  let lo = Infinity, hi = -Infinity;
  for (const comp of sim.model.comps) {
    if (!S.vis[comp.ci]) continue;
    const u = sim.getU(comp.ci);
    for (let j = 0; j < sim.N; j++) {
      if (u[j] < lo) lo = u[j];
      if (u[j] > hi) hi = u[j];
    }
  }
  if (!isFinite(lo) || !isFinite(hi)) return;
  const pad = Math.max(0.2, (hi-lo)*0.18);
  const tMin = clamp(lo-pad, -Y_LIMIT, Y_LIMIT);
  const tMax = clamp(hi+pad, -Y_LIMIT, Y_LIMIT);
  // после разноса возвращаемся сразу: плавность нужна для дыхания решения,
  // а не для проезда трёх порядков подряд
  const snap = (S.yMax - S.yMin) > 8*(tMax - tMin);
  const w = snap ? 1 : 0.12;
  S.yMin += (tMin - S.yMin)*w;
  S.yMax += (tMax - S.yMax)*w;
  $('ymin').value = S.yMin.toFixed(2); $('ymax').value = S.yMax.toFixed(2);
}

/* ================= шаг по времени ================= */
/** «крупный шаг»: множитель на эвристические пределы автоподбора.
 *  2 — потому что замерено: солитон КдФ 1.8e-5 -> 3.9e-4 (глазом не видно),
 *  все пресеты живы, «Δ за шаг» не перескакивает порог тревоги. 3 уже перескакивает. */
const COARSE_K = 2;

function refreshDt(force) {
  if (!S.autodt || !sim.model) return;
  const d = sim.diagnostics(), dx = sim.L/sim.N, K = S.coarse ? COARSE_K : 1;
  // предел линейной части — настоящая устойчивость, его K не трогает
  let dt = Math.min(0.02*K, sim.dtLimit());
  if (sim.model.nonlin) {
    const amp = Math.max(0.3, Math.min(1e3, isFinite(d.max) ? d.max : 1));
    dt = Math.min(dt, K*0.15*dx/amp);
    if (sim.model.maxOrder >= 3) dt = Math.min(dt, K*3*Math.pow(dx, 1.5));
  }
  dt = clamp(dt, 1e-7, 0.05);
  if (force || Math.abs(dt - sim.dt) > 0.05*sim.dt) { sim.setDt(dt); $('dt').value = dt.toPrecision(3); }
}

/* ================= кадр ================= */
/** Сколько миллисекунд кадра отдаём счёту. Остальное — отрисовка и браузер.
 *  Из-за этого потолка «шагов/кадр» можно ставить любым: тяжёлая сетка
 *  просто уронит fps, а не подвесит вкладку на секунды.
 *  Меняется только из тестов (`setBudget`): под virtual-time в headless
 *  `performance.now()` стоит, и обрыв иначе не воспроизвести. */
let stepBudgetMs = 12;

let stepsDone = 0, stepsPerSec = 0, spsT0 = 0, spsN = 0;

/** шаги одного кадра: не больше S.spf и не дольше бюджета. Возвращает сделанное */
function frameSteps() {
  const w0 = performance.now();
  let i = 0;
  for (; i < S.spf; i++) {
    sim.step();
    // время смотрим не каждый шаг: на мелкой сетке сам замер сопоставим с шагом
    if ((i & 7) === 7 && performance.now() - w0 > stepBudgetMs) { i++; break; }
  }
  return i;
}

function frame() {
  if (S.running && !S.dead) {
    const t0 = sim.t;
    refreshDt(false);
    stepsDone = frameSteps(); spsN += stepsDone;
    lastFrameDt = sim.t - t0;
    if (!sim.diagnostics().finite) { S.dead = true; S.running = false; syncPlay(); }
    pushRow();
  } else stepsDone = 0;

  const now = performance.now();
  if (now - spsT0 > 500) { stepsPerSec = spsN*1000/(now - spsT0); spsT0 = now; spsN = 0; }

  autoscale();
  draw();
  updateDiag();
  requestAnimationFrame(frame);
}

/** одна форма записи числа на весь интерфейс: экспонента только там, где иначе
 *  получится «0.0000» или частокол цифр */
function fmt(v, dg) {
  return isFinite(v) ? (Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-3)
         ? v.toExponential(2) : v.toFixed(dg === undefined ? 4 : dg)) : '∞';
}

function updateDiag() {
  if (!sim.model) return;
  const d = sim.diagnostics();
  const f = fmt;
  // показания поля — в его строке легенды, а не в общей таблице: они относятся
  // к конкретной кривой, и читать их удобнее рядом с ней
  for (const comp of sim.model.comps) {
    const el = legendVals[comp.ci]; if (!el) continue;
    el.textContent = 'max ' + f(d.per[comp.ci].max, 3) + ' · ∫ ' + f(d.per[comp.ci].mass, 3);
  }
  // общие показания — в нижней строке: это не настройка, а то, как идёт счёт,
  // и смотрят на них не открывая никаких панелей
  const q = v => '<span class="q">' + v + '</span>';
  let h = 't ' + q(d.t.toFixed(3)) + ' · Δ/шаг ' + q(f(d.perStep));
  // видно, упёрлись мы в железо или просто мало просим: приписка — когда кадр
  // обрывается по бюджету, а не по числу шагов
  if (S.running && stepsPerSec > 0)
    h += ' · ' + q(Math.round(stepsPerSec)) + ' шаг/с' +
         (stepsDone < S.spf ? ' (упёрлось в кадр)' : '');
  // на ударной волне потеря энергии физична (её теряет и точное решение),
  // поэтому ругаемся только когда гашение становится главным процессом
  if (S.smooth)
    h += ' · гашение <span class="q" style="color:' +
         (d.loss > 0.1 ? 'var(--accent2)' : 'var(--ok)') + '">' +
         (100*d.loss).toFixed(d.loss < 0.01 ? 2 : 1) + ' %/ед.вр.</span>';

  let st = '', col = '';
  if (S.dead) { col = 'var(--bad)';
    st = 'решение разошлось — уменьши dt, сгладь данные или поменяй знак'; }
  else if (d.perStep > 0.1) { col = 'var(--accent2)';
    st = 'за шаг решение меняется на ' + (100*d.perStep).toFixed(0) + '% — уменьши dt'; }
  else if (S.smooth && d.loss > 0.25) { col = 'var(--accent2)';
    st = 'гашение снимает ' + (100*d.loss).toFixed(0) + '% энергии за единицу времени — ' +
         'считается уже не исходная задача, а её вязкая версия: возьми сетку помельче'; }

  // На телефоне строка одна и узкая: числа и тревога делить её не могут, поэтому
  // тревога вытесняет числа. Счёт, вставший молча и без объяснения, — худшее,
  // что может случиться, поэтому важнее всего именно она.
  const bt = $('bart'), bm = $('barmsg'), phone = mob.matches;
  if (phone) h = 't ' + q(d.t.toFixed(2)) + ' · Δ ' + q(f(d.perStep, 2));  // короче — иначе обрежется
  if (phone && st) { bt.textContent = S.dead ? 'решение разошлось' : st; bt.style.color = col; }
  else { bt.innerHTML = h; bt.style.color = ''; }
  bm.textContent = phone ? '' : st;
  bm.style.color = col;
  // строка узкая, длинная тревога обрезается — полный текст остаётся в подсказке
  if (st && !phone) bm.setAttribute('data-tip', 'Что случилось|' + st);
  else bm.removeAttribute('data-tip');
}

/* ================= система уравнений ================= */
function showWarnings(m) {
  const w = sim.stabilityWarning();
  const msgs = m.warnings.slice();
  if (w) msgs.push(w.comp + ': неустойчиво при больших k (рост ' + w.growth.toPrecision(3) + ')');
  $('warn').innerHTML = msgs.map(s => '⚠ ' + s).join('<br>');
  syncMsg();
}

/** только смена значения константы: структура та же, DOM ползунков не трогаем */
function updateParams(params) {
  try {
    const m = sim.setSystem($('eq').value, params);
    showError(null);
    showWarnings(m);
    refreshDt(true);
  } catch (e) { showError(e); }
}

function applySystem(text, params) {
  /* применённый текст всегда канонический: лишние пробелы и пустые строки убраны,
     операторы расставлены единообразно. Непонятный текст formatEq не трогает,
     иначе правка ломала бы то, что человек ещё дописывает. */
  text = formatEq(text);
  if ($('eq').value !== text) { $('eq').value = text; autosizeEq(); }
  const prev = sim.model ? sim.model.comps.map(c => c.name) : null;
  const prevIC = S.ic, prevVis = S.vis;
  try {
    const m = sim.setSystem(text, params || (sim.model ? sim.model.params : {}));
    showError(null);
    showWarnings(m);
    S.appliedEq = text;

    // начальные данные и видимость: переносим по именам компонент, новые — нули
    const ic = [], vis = [];
    for (const c of m.comps) {
      const j = prev ? prev.indexOf(c.name) : -1;
      const keep = j >= 0 && prevIC[j] && prevIC[j].length === sim.N;
      ic[c.ci] = keep ? prevIC[j] : new Float64Array(sim.N);
      vis[c.ci] = j >= 0 ? prevVis[j] !== false : c.d === 0;
      if (!keep) sim.setU(c.ci, ic[c.ci]);
    }
    S.ic = ic; S.vis = vis;
    if (S.sel >= m.comps.length) S.sel = 0;
    buildLegend(m); buildParamUI(m); clearXT();
    S.dead = false; refreshDt(true);
    syncEqUI();
    $('eq').blur();          // применилось — отпускаем поле, чтобы работал пробел
    return true;
  } catch (e) {
    showError(e);
    syncEqUI();
    return false;
  }
}

/** Легенда поверх графика: она же список полей, она же их показания.
 *  Строится только при пересборке модели или смене выбора/видимости; числа
 *  каждый кадр переписывает `updateDiag` в готовые `.v` (`legendVals`) —
 *  перестраивать разметку 60 раз в секунду было бы и дороже, и опаснее:
 *  под курсором исчезал бы тот самый узел, по которому кликают. */
let legendVals = [];
function buildLegend(m) {
  const box = $('legend');
  box.innerHTML = '';
  legendVals = [];
  for (const comp of m.comps) {
    const b = document.createElement('div');
    b.className = 'lgd' + (comp.ci === S.sel ? ' sel' : '') + (S.vis[comp.ci] ? '' : ' off');
    b.style.color = compColor(comp);
    b.innerHTML = '<span class="dot' + (S.vis[comp.ci] ? '' : ' off') + '"></span>' +
                  '<span class="nm">' + comp.name + '</span><span class="v"></span>';
    b.querySelector('.dot').onclick = ev => {
      ev.stopPropagation();
      S.vis[comp.ci] = !S.vis[comp.ci];
      buildLegend(m); draw();
    };
    b.onclick = () => { S.sel = comp.ci; S.vis[comp.ci] = true; buildLegend(m); showXT(); draw(); };
    box.appendChild(b);
    legendVals[comp.ci] = b.querySelector('.v');
  }
  $('selname').textContent = '→ ' + m.comps[S.sel].name;
  updateDiag();
}

/* ---- параметры: логарифмический ползунок ---- */
const LO = -4, HI = 3;                     // 10^LO … 10^HI
function buildParamUI(m) {
  const box = $('pars');
  if (!m.paramNames.length) {
    box.innerHTML = '<div class="note">нет — любая лишняя буква станет константой, ' +
                    'например <code>ut + u*ux = nu*uxx</code></div>';
    return;
  }
  box.innerHTML = '';
  for (const name of m.paramNames) {
    const div = document.createElement('div');
    div.className = 'par';
    div.innerHTML =
      '<div class="top"><label>' + name + '</label>' +
      '<button class="sg" title="знак">±</button>' +
      '<input type="number" step="any" style="width:92px"></div>' +
      '<input type="range" min="' + LO + '" max="' + HI + '" step="0.01">' +
      '<div class="sc"><span>10<sup>' + LO + '</sup></span><span>1</span><span>10<sup>' + HI + '</sup></span></div>';
    const num = div.querySelector('input[type=number]');
    const rng = div.querySelector('input[type=range]');
    const sgn = div.querySelector('button.sg');
    let sign = m.params[name] < 0 ? -1 : 1;

    const show = v => {
      num.value = +v.toPrecision(4);
      sign = v < 0 ? -1 : 1;
      sgn.textContent = sign < 0 ? '−' : '+';
      sgn.style.color = sign < 0 ? 'var(--bad)' : 'var(--ok)';
      rng.value = clamp(Math.log10(Math.abs(v) || Math.pow(10, LO)), LO, HI);
    };
    const set = v => { m.params[name] = v; updateParams(m.params); };

    show(m.params[name]);
    rng.oninput = () => { const v = sign*Math.pow(10, +rng.value); num.value = +v.toPrecision(4); set(v); };
    num.oninput = () => { const v = +num.value; if (!isNaN(v)) { show(v); set(v); } };
    sgn.onclick = () => { const v = -(+num.value || Math.pow(10, +rng.value)); show(v); set(v); };
    box.appendChild(div);
  }
}

/* ================= поле ввода: ошибка, селект, кнопка «применить» ================= */

const escHTML = s => s.replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' })[c]);

/** ошибка в #err; сам текст (с раскраской и меткой ошибки) рисует paintEq */
function showError(e) {
  $('err').textContent = e ? e.message : '';
  $('eq').classList.toggle('bad', !!e);
  paintEq(e);
  syncMsg();
}

/** строка сообщений живёт под полем ввода — там, где текст, из-за которого она
    появилась. Пустую убираем целиком: иначе пустая строка вместе с отступом
    шапки навсегда съедала бы высоту у графика. Холст подгонит ResizeObserver. */
function syncMsg() {
  $('msg').classList.toggle('on', !!($('err').textContent || $('warn').textContent));
}

/** подложка #eqhl: раскрашенная копия текста поля, поверх — метка ошибки */
function paintEq(e) {
  const hl = $('eqhl');
  hl.innerHTML = hlHTML($('eq').value, e);
  hl.scrollTop = $('eq').scrollTop;
}

/** проверка текста на лету — модель не трогается */
function validate() {
  let e = null;
  try { buildSystem($('eq').value, Object.assign({}, sim.model ? sim.model.params : {})); }
  catch (err) { e = err; }
  showError(e);
  return !e;
}

/* «своё уравнение» ↔ пресет: сравниваем текст без пробелов и пустых строк */
function normEq(s) {
  return s.split(/[\n;]+/).map(l => l.trim()).filter(l => l && l[0] !== '#')
          .join('\n').replace(/[ \t]+/g, '');
}
function matchPreset(text) {
  const n = normEq(text);
  for (let i = 0; i < PRESETS.length; i++) if (normEq(PRESETS[i].eq) === n) return i;
  return -1;
}
function syncEqUI() {
  const text = $('eq').value;
  $('preset').value = String(matchPreset(text));      // -1 — пункт «своё уравнение»
  syncPresetBtn();
  $('apply').disabled = text === S.appliedEq;
}

/* ================= запись уравнения =================
   Три вещи растут из одного и того же разбора ядра:
   `formatEq` — канонический текст поля ввода (проход по токенам),
   `hlHTML`   — раскраска этого текста на подложке `#eqhl` (те же токены),
   `prettyEq` — формула для превью, свёрстанная по AST (`parseOne`): дробь
                этажеркой, степень верхним индексом, скобки рисуются под высоту
                содержимого.
   Разбор — тот же, что у решателя, поэтому склейка `uvvxxux` и в раскраске,
   и в формуле разбирается ровно так, как её поймёт ядро. */

const GREEK = { alpha:'α', beta:'β', gamma:'γ', delta:'δ', eps:'ε', epsilon:'ε',
  zeta:'ζ', eta:'η', theta:'θ', kappa:'κ', lambda:'λ', mu:'μ', nu:'ν', xi:'ξ',
  rho:'ρ', sigma:'σ', tau:'τ', phi:'φ', chi:'χ', psi:'ψ', omega:'ω' };
const EQFUNCS = { sin:1, cos:1, tan:1, exp:1, log:1, sqrt:1, abs:1,
                  tanh:1, sinh:1, cosh:1, sech:1, sign:1 };
const EQCONSTS = { x:1, t:1, pi:1, e:1 };

/* цвет поля — тот же, что у его кривой на графике (порядок полей даёт scanFields) */
function fieldColor(f, fields) {
  const i = fields.indexOf(f);
  return COLORS[(i < 0 ? 0 : i) % COLORS.length];
}

/** канонический текст одной строки; при непонятном тексте — вернуть как есть */
function renderLine(src) {
  let toks;
  try { toks = tokenize(src); } catch (e) { return src; }
  let out = '', i = 0;
  while (i < toks.length && toks[i].t !== 'end') {
    const tk = toks[i], pv = i ? toks[i-1] : null;
    /* унарный плюс/минус: в начале строки и после любого оператора или «(» */
    const unary = !pv || '+-*/^(,='.indexOf(pv.t) >= 0;
    i++;
    switch (tk.t) {
      case 'num': out += src.slice(tk.i, tk.j); break;
      case 'id':  out += tk.v; break;
      case '=':   out += ' = '; break;
      case '+':   out += unary ? '+' : ' + '; break;
      case '-':   out += unary ? '-' : ' - '; break;
      case ',':   out += ', '; break;
      default:    out += tk.t;                                // * / ^ ( )
    }
  }
  return out;
}

/* ---------- формула: вёрстка по AST ----------
   Каждый узел возвращает { h — html, p — приоритет (нужны ли скобки),
   tall — содержит ли этажерку (тогда скобки рисуются, а не берутся из шрифта) }. */
const P_SUM = 1, P_PROD = 2, P_ATOM = 3;
const box = (h, tall) => ({ h, p:P_ATOM, tall:!!tall });

/** число; pi и e ядро подставляет значением — возвращаем им имя обратно */
function numHTML(v) {
  if (v === Math.PI) return '<span class="cn">π</span>';
  if (v === Math.E) return '<i class="cn">e</i>';
  const a = Math.abs(v);
  if (a && (a < 1e-4 || a >= 1e6)) {
    const p = v.toExponential(3).split('e');
    return (+p[0]) + '·10<sup>' + (+p[1]) + '</sup>';
  }
  return String(+v.toPrecision(12));
}

/** скобки: обычные — глифом, вокруг этажерки — рисованные под высоту */
function paren(x) {
  if (!x.tall) return box('<span class="pn">(</span>' + x.h + '<span class="pn">)</span>');
  return box('<span class="grp"><span class="dlm" data-d="("></span><span class="gb">' +
             x.h + '</span><span class="dlm" data-d=")"></span></span>', true);
}
const wrap = (x, need) => x.p < need ? paren(x) : x;

function mathNode(n, F) {
  switch (n.k) {
    case 'num':  return box(numHTML(n.v));
    case 'x':    return box('<i class="cn">x</i>');
    case 'time': return box('<i class="cn">t</i>');
    case 'par':  return box('<i>' + escHTML(GREEK[n.name] || n.name) + '</i>');
    case 'd': {
      const sub = n.dt ? 't'.repeat(n.dt) : 'x'.repeat(n.dx);
      return box('<b style="color:' + fieldColor(n.f, F) + '">' + n.f +
                 (sub ? '<sub>' + sub + '</sub>' : '') + '</b>');
    }
    case 'add': case 'sub': {
      const a = mathNode(n.a, F);
      let b = mathNode(n.b, F);
      /* «a − (b − c)» и «a + (−b)» без скобок читались бы неверно */
      if (n.b.k === 'neg' || (n.k === 'sub' && b.p < P_PROD)) b = paren(b);
      return { h: a.h + '<span class="bo">' + (n.k === 'add' ? '+' : '−') + '</span>' + b.h,
               p:P_SUM, tall:a.tall || b.tall };
    }
    case 'neg': {
      const a = wrap(mathNode(n.a, F), P_PROD);
      return { h:'<span class="un">−</span>' + a.h, p:P_PROD, tall:a.tall };
    }
    case 'mul': {
      const a = wrap(mathNode(n.a, F), P_PROD), b = wrap(mathNode(n.b, F), P_PROD);
      /* «6u²», «2π» — числу множитель дописывается вплотную, остальное через «·» */
      const dot = n.a.k === 'num' && n.b.k !== 'num' ? '' : '<span class="mu">·</span>';
      return { h:a.h + dot + b.h, p:P_PROD, tall:a.tall || b.tall };
    }
    case 'div': {
      const a = mathNode(n.a, F), b = mathNode(n.b, F);
      return { h:'<span class="frac"><span class="fnum">' + a.h + '</span>' +
                  '<span class="fden">' + b.h + '</span></span>', p:P_ATOM, tall:true };
    }
    case 'pow': {
      const a = mathNode(n.a, F), e = mathNode(n.b, F);
      const base = (a.p < P_ATOM || a.tall) ? paren(a) : a;
      return { h: base.h + '<sup>' + e.h + '</sup>', p:P_ATOM, tall:base.tall };
    }
    case 'fn': {
      const a = mathNode(n.a, F);
      /* корень — знаком радикала: путь считается по высоте, поэтому дробь под ним
         тоже накрывается целиком */
      if (n.name === 'sqrt')
        return { h:'<span class="rt"><span class="dlm" data-d="√"></span>' +
                    '<span class="rb">' + a.h + '</span></span>', p:P_ATOM, tall:true };
      return box('<span class="fnm">' + n.name + '</span>' + paren(a).h, a.tall);
    }
    default: return box('?');
  }
}

/** одно уравнение целиком (обе части) */
function mathEq(src, fields) {
  const eq = parseOne(src, fields);
  const l = mathNode(eq.lhs, fields).h;
  return eq.rhs ? l + '<span class="eqs">=</span>' + mathNode(eq.rhs, fields).h : l;
}

/** уравнения по строкам; комментарии («# …») сохраняются */
function eqLines(text, html) {
  /* строки режутся до tokenize: «;» — разделитель уравнений, а не токен ядра */
  const raws = text.split(/[\n;]+/).map(s => s.trim()).filter(s => s);
  let fields = [];
  try { fields = scanFields(raws.join('\n')); } catch (e) { return null; }
  const out = [];
  for (const line of raws) {
    const h = line.indexOf('#');
    const code = (h >= 0 ? line.slice(0, h) : line).trim();
    const cmt = h >= 0 ? line.slice(h).trim() : '';
    let f = '';
    /* недописанное уравнение не форматируется вовсе — показываем как есть */
    if (code) {
      if (!html) f = renderLine(code);
      else { try { f = mathEq(code, fields); } catch (e) { f = escHTML(code); } }
    }
    const c = cmt ? (html ? '<span class="cm">' + escHTML(cmt) + '</span>' : cmt) : '';
    out.push(f && c ? f + '  ' + c : f || c);
  }
  return out;
}

/** канонический текст для поля ввода; при непонятном тексте — вернуть как есть */
function formatEq(text) {
  const ls = eqLines(text, false);
  return ls && ls.length ? ls.join('\n') : text;
}

/** формула для превью: система нескольких уравнений собирается под скобкой */
function prettyEq(text) {
  const ls = eqLines(text, true);
  if (!ls || !ls.length) return escHTML(text);
  const body = ls.map(l => '<div class="pl">' + l + '</div>').join('');
  if (ls.length < 2) return '<div class="peq">' + body + '</div>';
  return '<div class="peq"><span class="brace dlm" data-d="{"></span>' +
         '<div class="pls">' + body + '</div></div>';
}

/* ---------- рисованные скобки ----------
   Путь считается в пикселях по уже измеренной высоте, поэтому линия везде одной
   толщины, а скобка садится ровно по содержимому. Глиф «{», растянутый
   font-size'ом, этого не умеет: он ехал по вертикали и тяжелел вместе с ростом. */
function delimPath(kind, W, H) {
  const t = 1.2, b = H - 1.2, mid = H/2, w = W - 1.2;
  if (kind === '{') {
    const s = w*0.62, r = Math.max(2, Math.min(9, (mid - t)*0.9));
    return 'M' + w + ' ' + t + 'Q' + s + ' ' + t + ' ' + s + ' ' + (t + r) +
           'L' + s + ' ' + (mid - r) + 'Q' + s + ' ' + mid + ' 0.9 ' + mid +
           'Q' + s + ' ' + mid + ' ' + s + ' ' + (mid + r) +
           'L' + s + ' ' + (b - r) + 'Q' + s + ' ' + b + ' ' + w + ' ' + b;
  }
  if (kind === '(' || kind === ')') {
    const d = Math.min(w*0.8, H*0.13)*1.33;              // выгиб дуги
    const x0 = kind === '(' ? w : 1.2, xc = kind === '(' ? w - d : 1.2 + d;
    return 'M' + x0 + ' ' + t + 'C' + xc + ' ' + (t + H*0.26) + ' ' +
           xc + ' ' + (b - H*0.26) + ' ' + x0 + ' ' + b;
  }
  return 'M0 ' + (H*0.55) + 'L' + (w*0.3) + ' ' + (H*0.47) +      // √
         'L' + (w*0.6) + ' ' + b + 'L' + w + ' 0.6';             // 0.6 — впритык к черте сверху
}

/** дорисовать скобки в готовой (уже размеченной) формуле */
function fitMath(root) {
  for (const el of root.querySelectorAll('.dlm')) {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) continue;
    el.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h +
                   '"><path d="' + delimPath(el.dataset.d, w, h) + '"/></svg>';
  }
}

/* ---------- раскраска поля ввода ----------
   Подложка #eqhl держит копию текста, раскрашенную по токенам ядра: поля — цветом
   своей кривой, хвост производной тем же цветом побледнее, константы, функции,
   числа и комментарии — своими. Текст обязан совпадать с текстом поля символ
   в символ, иначе раскраска уедет относительно каретки. */
function eqSegments(text) {
  let fields = [];
  try { fields = scanFields(text); } catch (e) {}
  const segs = [];
  const push = (a, b, cls, color) => { if (b > a) segs.push({ a, b, cls, color }); };

  const code = (src, off) => {
    let toks;
    /* до места ошибки текст всё равно раскрашивается — человек его как раз правит */
    try { toks = tokenize(src); }
    catch (e) { try { toks = tokenize(src.slice(0, e.pos)); } catch (e2) { return; } }
    for (let i = 0; i < toks.length && toks[i].t !== 'end'; i++) {
      const tk = toks[i], v = tk.v;
      if (tk.t === 'num') { push(off + tk.i, off + tk.j, 'nu'); continue; }
      if (tk.t !== 'id')  { push(off + tk.i, off + tk.j, 'op'); continue; }
      if (EQFUNCS[v] && toks[i+1] && toks[i+1].t === '(') {
        push(off + tk.i, off + tk.j, 'fn'); continue;
      }
      let atoms = null;
      try { atoms = splitAtoms(v, fields); } catch (e) {}   // смешанные производные
      if (!atoms) { push(off + tk.i, off + tk.j, EQCONSTS[v] ? 'cn' : 'pr'); continue; }
      if (tk.j - tk.i !== v.length) {                        // запись вида u_{xx}
        push(off + tk.i, off + tk.j, 'fd', fieldColor(atoms[0].f, fields)); continue;
      }
      let p = off + tk.i;
      for (const a of atoms) {                               // склейка uvvxxux — по атомам
        const col = fieldColor(a.f, fields), n = a.dt + a.dx;
        push(p, p + 1, 'fd', col);
        push(p + 1, p + 1 + n, 'fd dv', col);
        p += 1 + n;
      }
    }
  };

  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i < text.length && text[i] !== '\n' && text[i] !== ';') continue;
    const raw = text.slice(start, i), h = raw.indexOf('#');
    code(h >= 0 ? raw.slice(0, h) : raw, start);
    if (h >= 0) push(start + h, i, 'cm');
    if (text[i] === ';') push(i, i + 1, 'op');
    start = i + 1;
  }
  return segs;
}

/** раскрашенная копия текста; e — ошибка, её кусок берётся в одну метку .mk */
function hlHTML(text, e) {
  let a = -1, b = -1;
  if (e && e.pos !== undefined) {
    a = clamp(e.pos, 0, text.length);
    b = clamp(a + (e.len || 1), a, text.length);
  }
  const parts = [];
  let pos = 0;
  for (const s of eqSegments(text)) {
    if (s.a > pos) parts.push({ a:pos, b:s.a });
    parts.push(s); pos = s.b;
  }
  if (pos < text.length) parts.push({ a:pos, b:text.length });

  const cuts = [];                       // куски рвутся по границам ошибки
  for (const p of parts) {
    let s = p.a;
    for (const q of [a, b]) if (q > s && q < p.b) { cuts.push({ p, a:s, b:q }); s = q; }
    cuts.push({ p, a:s, b:p.b });
  }
  let out = '', open = false;
  const mark = at => {
    if (a !== at) return;
    if (b > a) { out += '<span class="mk">'; open = true; }
    else out += '<span class="mk"> </span>';      // ошибка в конце текста — метка-пробел
  };
  for (const c of cuts) {
    if (open && c.a === b) { out += '</span>'; open = false; }
    mark(c.a);
    const s = escHTML(text.slice(c.a, c.b));
    out += c.p.cls ? '<span class="' + c.p.cls + '"' +
                     (c.p.color ? ' style="color:' + c.p.color + '"' : '') + '>' + s + '</span>'
                   : s;
  }
  if (open) out += '</span>'; else mark(text.length);
  return out + '\n';                     // последний перевод строки <pre> не показывает
}

/** высота поля ввода — ровно под текст (с учётом переноса длинных строк).
    Считается по scrollHeight, поэтому обёрнутая строка занимает столько же, сколько
    видно глазом; выше 40vh упирается в max-height из CSS и появляется прокрутка. */
function autosizeEq() {
  const el = $('eq');
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight + 2) + 'px';   // +2 — рамка (box-sizing:border-box)
}

$('eq').addEventListener('input', () => { autosizeEq(); syncEqUI(); validate(); });
$('eq').addEventListener('scroll', () => { $('eqhl').scrollTop = $('eq').scrollTop; });

/* ================= всплывающие подсказки ================= */
const tip = $('tip');
let tipFor = null, tipTimer = 0;

function placeTip(el) {
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
function showTip(el) {
  const raw = el.getAttribute('data-tip') || '', i = raw.indexOf('|');
  tip.innerHTML = '<b></b><i></i>';
  tip.querySelector('b').textContent = i < 0 ? raw : raw.slice(0, i);
  tip.querySelector('i').textContent = i < 0 ? '' : raw.slice(i + 1);
  tip.classList.add('on');
  placeTip(el);
}
function hideTip() { clearTimeout(tipTimer); tip.classList.remove('on'); tipFor = null; }

document.addEventListener('pointerover', ev => {
  const el = ev.target.closest ? ev.target.closest('[data-tip]') : null;
  if (el === tipFor) return;
  clearTimeout(tipTimer);
  tipFor = el;
  if (!el) { tip.classList.remove('on'); return; }
  tipTimer = setTimeout(() => { if (tipFor === el) showTip(el); }, 130);
});
document.addEventListener('pointerdown', hideTip, true);
window.addEventListener('blur', hideTip);
document.querySelector('aside').addEventListener('scroll', hideTip);

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
  const el = ev.target.closest ? ev.target.closest('[data-tip]') : null;
  if (!el) return;
  pressX = ev.clientX; pressY = ev.clientY;
  clearTimeout(pressT);
  pressT = setTimeout(() => { pressShown = true; tipFor = el; showTip(el); }, 420);
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

/* ================= кнопки начальных данных ================= */
function buildTools() {
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
buildTools();

/* ================= мышь ================= */
function localPos(ev) {
  const r = plot.getBoundingClientRect();
  return { px: ev.clientX - r.left, py: ev.clientY - r.top };
}

/** пока кнопка мыши нажата, счёт стоит: иначе профиль уезжает из-под курсора,
    а в режиме «рисовать на ходу» правка ложится на уже другое решение.
    После отпускания счёт возвращается, если шёл. */
function pauseForDraw() {
  S.wasRunning = S.running;
  if (S.running) { S.running = false; syncPlay(); }
}
function resumeAfterDraw() {
  if (S.wasRunning && !S.dead) { S.running = true; syncPlay(); }
  S.wasRunning = false;
}

plot.addEventListener('pointerdown', ev => {
  pauseForDraw();
  try { plot.setPointerCapture(ev.pointerId); } catch (e) {}
  const { px, py } = localPos(ev);
  const add = S.add || ev.altKey;
  S.base = add ? Float64Array.from(sim.getU(S.sel)) : new Float64Array(sim.N);
  S.vis[S.sel] = true;
  if (S.tool === 'pen') {
    S.drag = { pen:true, lastPx:px, lastPy:py };
    const u = Float64Array.from(S.base);
    penDot(u, px, py, px, py);
    sim.setU(S.sel, u);
  } else if (S.tool === 'noise') {
    const u = Float64Array.from(S.base);
    const n = makeProfile({ tool:'noise', A:Math.abs(py2u(py)) || 0.3 });
    for (let j = 0; j < sim.N; j++) u[j] += n[j];
    S.drag = null; commit(u, S.live); return;
  } else {
    S.drag = { px0:px, py0:py, x0:px2x(px), A:py2u(py), w:S.width };
    applyDrag();
  }
  draw();
});

plot.addEventListener('pointermove', ev => {
  if (!S.drag) return;
  const { px, py } = localPos(ev);
  if (S.drag.pen) {
    const u = Float64Array.from(sim.getU(S.sel));
    penDot(u, S.drag.lastPx, S.drag.lastPy, px, py);
    S.drag.lastPx = px; S.drag.lastPy = py;
    sim.setU(S.sel, u);
  } else {
    S.drag.A = py2u(py);
    if (Math.abs(px - S.drag.px0) > 6) {
      S.drag.w = Math.max(sim.L/sim.N*1.5, Math.abs(px2x(px) - S.drag.x0));
      $('wid').value = S.drag.w.toFixed(2);
    }
    applyDrag();
  }
  draw();
});

plot.addEventListener('pointerup', () => {
  resumeAfterDraw();                    // до выхода: «шум» рисуется в pointerdown и S.drag не ставит
  if (!S.drag) return;
  S.drag = null;
  if (S.tool !== 'pen') S.width = +$('wid').value;
  commit(Float64Array.from(sim.getU(S.sel)), S.live);
});
plot.addEventListener('pointercancel', resumeAfterDraw);

plot.addEventListener('wheel', ev => {
  ev.preventDefault();
  S.width = clamp(S.width*Math.exp(-ev.deltaY*0.0015), sim.L/sim.N, sim.L/2);
  $('wid').value = S.width.toFixed(2);
  if (S.drag && !S.drag.pen) { S.drag.w = S.width; applyDrag(); draw(); }
}, { passive:false });

function applyDrag() {
  const d = S.drag, N = sim.N, u = new Float64Array(N);
  const p = makeProfile({ tool:S.tool, x0:d.x0, A:d.A, w:d.w, edge:S.edge });
  for (let j = 0; j < N; j++) u[j] = S.base[j] + p[j];
  sim.setU(S.sel, u);
}

function penDot(u, px0, py0, px1, py1) {
  const steps = Math.max(1, Math.round(Math.abs(px1-px0)));
  for (let s = 0; s <= steps; s++) {
    const q = s/steps;
    const x = px2x(px0 + (px1-px0)*q), val = py2u(py0 + (py1-py0)*q);
    let j = Math.round((x + sim.L/2)/sim.L*sim.N);
    j = ((j % sim.N) + sim.N) % sim.N;
    u[j] = val;
    if (steps > 1) u[(j+1) % sim.N] = val;
  }
}

/* ================= кнопки ================= */
/* data-icon — то, по чему видно состояние кнопки снаружи (в том числе тесту):
   у svg нет textContent, а раньше проверяли именно его */
function syncPlay(){
  const k = S.running ? 'pause' : 'play';
  $('play').dataset.icon = k;
  $('play').innerHTML = ICON[k];
  $('play').classList.toggle('on', S.running);
}
$('stepb').innerHTML = ICON.step;
$('reset').innerHTML = ICON.reset;
$('apply').innerHTML = ICON.apply;

function setSmooth(on) {
  S.smooth = !!on;
  sim.smooth = S.smooth ? 1 : 0;
  $('smooth').classList.toggle('on', S.smooth);
}
$('smooth').onclick = () => setSmooth(!S.smooth);

$('play').onclick = () => { if (S.dead) return; S.running = !S.running; syncPlay(); };
$('stepb').onclick = () => {
  if (S.dead) return;
  // шаг — это «посмотреть по кадрам», поэтому он сначала останавливает счёт:
  // иначе кадр анимации тут же затирает то, что хотели разглядеть
  if (S.running) { S.running = false; syncPlay(); }
  const t0 = sim.t;
  for (let i = 0; i < S.spf; i++) sim.step();
  lastFrameDt = sim.t - t0;
  if (!sim.diagnostics().finite) { S.dead = true; syncPlay(); }
  pushRow(); draw(); updateDiag();
};
$('reset').onclick = () => {
  S.running = false; syncPlay();          // сброс всегда ставит на паузу: иначе t=0 промелькнёт
  for (let c = 0; c < sim.M; c++) if (S.ic[c]) sim.setU(c, S.ic[c]);
  sim.t = 0; S.dead = false; clearXT(); refreshDt(true); draw();
};
$('zero').onclick = () => commit(new Float64Array(sim.N), false);
$('rand').onclick = () => commit(makeProfile({ tool:'noise', A:0.5 }), false);

$('apply').onclick = () => applySystem($('eq').value, sim.model ? sim.model.params : {});
$('eq').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('apply').click(); }
});

$('tools').addEventListener('click', e => {
  const b = e.target.closest('button[data-tool]'); if (!b) return;
  S.tool = b.dataset.tool;
  [...$('tools').children].forEach(x => x.classList.toggle('on', x === b));
});

$('spf').oninput = () => { S.spf = clamp(+$('spf').value|0, 1, 2000); syncSpeed(); };
$('dt').oninput = () => { const v = +$('dt').value; if (v > 0) { S.autodt = false; $('autodt').checked = false; sim.setDt(v); } };
$('autodt').onchange = () => { S.autodt = $('autodt').checked; refreshDt(true); };
$('coarsedt').onchange = () => { S.coarse = $('coarsedt').checked; refreshDt(true); };

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
function syncSpeed() {
  for (const b of $('speed').children)
    b.classList.toggle('on', S.spf === Math.round(S.baseSpf * +b.dataset.k));
}
$('speed').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]'); if (!b) return;
  S.spf = clamp(Math.round(S.baseSpf * +b.dataset.k), 1, 2000);
  $('spf').value = S.spf;
  syncSpeed();
});
buildSpeed();
$('wid').oninput = () => S.width = Math.max(1e-3, +$('wid').value);
$('edge').oninput = () => S.edge = Math.max(1e-3, +$('edge').value);
$('addm').onchange = () => S.add = $('addm').checked;
$('live').onchange = () => S.live = $('live').checked;
$('autoy').onchange = () => S.autoY = $('autoy').checked;
$('showic').onchange = () => S.showIC = $('showic').checked;
$('ymin').oninput = () => { S.yMin = +$('ymin').value; S.autoY = false; $('autoy').checked = false; };
$('ymax').oninput = () => { S.yMax = +$('ymax').value; S.autoY = false; $('autoy').checked = false; };

function regrid() {
  const N = +$('N').value, L = Math.max(0.1, +$('L').value);
  const oldN = sim.N, old = sim.model.comps.map(c => Float64Array.from(sim.getU(c.ci)));
  sim.resize(N, L);
  for (let c = 0; c < sim.M; c++) {
    const nu = new Float64Array(N);
    for (let j = 0; j < N; j++) {
      const q = j*oldN/N, i0 = Math.floor(q) % oldN, f = q - Math.floor(q);
      nu[j] = old[c][i0]*(1-f) + old[c][(i0+1)%oldN]*f;
    }
    sim.setU(c, nu);
    S.ic[c] = Float64Array.from(sim.getU(c));
  }
  clearXT(); refreshDt(true); draw();
}
$('N').onchange = regrid;
$('L').onchange = regrid;

window.addEventListener('keydown', e => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.target.id === 'presetbtn') return;   // на кнопке списка пробел открывает список
  if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
  if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') $('reset').click();
});

/* ================= пресеты ================= */
const sel = $('preset');
/* первым пунктом — «своё уравнение»: выбрать нельзя, но он показывается,
   как только текст в поле перестал совпадать с каким-либо пресетом */
const own = document.createElement('option');
own.value = '-1'; own.textContent = '— своё уравнение —'; own.disabled = true;
sel.appendChild(own);
PRESETS.forEach((p, i) => {
  const o = document.createElement('option'); o.value = i; o.textContent = p.name; sel.appendChild(o);
});
sel.onchange = () => { const i = +sel.value; if (i >= 0) loadPreset(PRESETS[i]); };

/* --- свой выпадающий список: нужен ради превью по наведению --- */
const pbtn = $('presetbtn'), plist = $('plist'), eqprev = $('eqprev');
let hiIdx = -1;

const isOpen = () => plist.classList.contains('on');
const itemAt = i => plist.children[i];

function syncPresetBtn() {
  const i = +sel.value;
  pbtn.textContent = i >= 0 ? PRESETS[i].name : '— своё уравнение —';
}

PRESETS.forEach((p, i) => {
  const d = document.createElement('div');
  d.className = 'pitem'; d.dataset.i = i; d.textContent = p.name;
  plist.appendChild(d);
});

/** превью формулы — справа от списка, по вертикали у самого пункта.
    На телефоне справа места нет, поэтому превью ложится внизу экрана во всю
    ширину и получает кнопку «выбрать»: тап по пункту показывает формулу, а не
    применяет её сразу — иначе вёрстку формулы на телефоне никто бы не увидел. */
function showPrev(i) {
  const el = itemAt(i); if (!el) return;
  const phone = mob.matches;
  eqprev.innerHTML = prettyEq(PRESETS[i].eq) +
    (phone ? '<button class="pick" data-i="' + i + '">выбрать</button>' : '');
  fitMath(eqprev);                     // скобки рисуются по уже измеренной высоте
  eqprev.classList.toggle('phone', phone);
  eqprev.classList.add('on');
  if (phone) {                         // место и размер задаёт CSS, инлайн — снять
    eqprev.style.left = ''; eqprev.style.top = '';
    return;
  }
  const lr = plist.getBoundingClientRect(), ir = el.getBoundingClientRect();
  const w = eqprev.offsetWidth, h = eqprev.offsetHeight;
  const right = lr.right + 10;
  eqprev.style.left = (right + w + 8 <= innerWidth ? right
                       : Math.max(8, lr.left - w - 10)) + 'px';
  eqprev.style.top = clamp(ir.top - 10, 8, Math.max(8, innerHeight - h - 8)) + 'px';
}
const hidePrev = () => eqprev.classList.remove('on');

function markHi() {
  [...plist.children].forEach((el, i) => {
    el.classList.toggle('hi', i === hiIdx);
    el.classList.toggle('cur', i === +sel.value);
  });
  if (hiIdx >= 0) showPrev(hiIdx); else hidePrev();
}

function openList(on) {
  plist.classList.toggle('on', on);
  pbtn.classList.toggle('open', on);
  hiIdx = on ? +sel.value : -1;
  markHi();
  if (on && hiIdx >= 0) itemAt(hiIdx).scrollIntoView({ block:'nearest' });
}

function choose(i) {
  openList(false);
  pbtn.blur();                       // чтобы пробел сразу пускал счёт, а не открывал список
  sel.value = String(i);
  sel.dispatchEvent(new Event('change'));
}

pbtn.onclick = () => openList(!isOpen());
plist.addEventListener('pointerover', e => {
  const it = e.target.closest('.pitem');
  if (it) { hiIdx = +it.dataset.i; markHi(); }
});
// на телефоне палец уходит с пункта сразу после тапа — превью не должно гаснуть
plist.addEventListener('pointerleave', () => { if (!mob.matches) hidePrev(); });
plist.addEventListener('click', e => {
  const it = e.target.closest('.pitem');
  if (!it) return;
  const i = +it.dataset.i;
  // телефон: первый тап показывает формулу, второй по тому же пункту — применяет
  if (mob.matches && hiIdx !== i) { hiIdx = i; markHi(); return; }
  choose(i);
});
eqprev.addEventListener('click', e => {
  const b = e.target.closest('.pick');
  if (b) choose(+b.dataset.i);
});
document.addEventListener('pointerdown', e => {
  // превью с кнопкой «выбрать» лежит вне #presetbox — по нему список не закрываем,
  // иначе кнопка исчезнет из-под пальца ещё до click
  if (isOpen() && !$('presetbox').contains(e.target) && !eqprev.contains(e.target))
    openList(false);
});
pbtn.addEventListener('keydown', e => {
  if (e.key === 'Escape') { openList(false); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!isOpen()) { openList(true); return; }
    hiIdx = clamp((hiIdx < 0 ? +sel.value : hiIdx) + (e.key === 'ArrowDown' ? 1 : -1),
                  0, PRESETS.length - 1);
    markHi(); itemAt(hiIdx).scrollIntoView({ block:'nearest' });
    return;
  }
  if (isOpen() && (e.key === 'Enter' || e.code === 'Space')) {
    e.preventDefault();
    if (hiIdx >= 0) choose(hiIdx);
  }
});

function loadPreset(p) {
  S.running = false; syncPlay();
  const idx = PRESETS.indexOf(p); if (idx >= 0) { sel.value = idx; syncPresetBtn(); }
  $('N').value = p.N; $('L').value = p.L;
  sim.resize(p.N, p.L);
  $('eq').value = p.eq;
  autosizeEq();
  S.sel = 0; S.ic = []; S.vis = [];
  if (!applySystem(p.eq, Object.assign({}, p.p || {}))) return;
  S.autodt = true; $('autodt').checked = true;
  S.yMin = p.y[0]; S.yMax = p.y[1];
  $('ymin').value = S.yMin; $('ymax').value = S.yMax;
  for (const comp of sim.model.comps) {
    const d = p.ic[comp.name];
    const arr = d ? makeProfile(Object.assign({ x0:0, edge:S.edge }, d)) : new Float64Array(sim.N);
    sim.setU(comp.ci, arr);
    S.ic[comp.ci] = Float64Array.from(sim.getU(comp.ci));
  }
  const first = p.ic[sim.model.comps[0].name];
  if (first && first.tool) {
    S.tool = first.tool === 'noise' ? 'sech' : first.tool;
    S.width = first.w || S.width; $('wid').value = S.width;
    [...$('tools').children].forEach(x => x.classList.toggle('on', x.dataset.tool === S.tool));
  }
  if (p.vis) for (const c of sim.model.comps) if (c.name in p.vis) S.vis[c.ci] = p.vis[c.name];
  if (p.sel) { const c = sim.model.comps.find(q => q.name === p.sel); if (c) S.sel = c.ci; }
  // темп пресета — это и есть «×1»: скорость всегда сбрасывается вместе с задачей
  S.baseSpf = p.spf || 6; S.spf = S.baseSpf; $('spf').value = S.spf; syncSpeed();
  setSmooth(!!p.smooth);
  buildLegend(sim.model);
  sim.t = 0; clearXT();
  // у некоторых задач автоподбор dt (он рассчитан на адвекцию u·ux) слишком осторожен
  S.autodt = !p.fixdt; $('autodt').checked = S.autodt;
  sim.setDt(p.dt); $('dt').value = p.dt;
  draw();
}

/* ================= телефон: шторка настроек ================= */

/** Пульт стоит в нижней строке всегда и никуда не переезжает. Переезжает
    скорость: на телефоне шесть кнопок «×N» в строку не влезают, и `#speedbox`
    уходит в шторку. Переезжает сам узел, а не копия: `syncSpeed`, обработчик
    кликов и тесты работают с тем же `#speed` и про переезд ничего не знают.
    Копия была бы вторым источником правды — подсветку текущего множителя
    пришлось бы держать в двух местах. */
function relayout() {
  const spd = $('speedbox'), home = mob.matches ? $('spdhome') : $('barspd');
  if (spd.parentNode !== home) home.appendChild(spd);
  $('hint').textContent = mob.matches
    ? 'тяни пальцем: ↕ амплитуда, ↔ ширина'
    : 'тяни мышью: ↕ амплитуда, ↔ ширина · колесо — ширина · Alt — добавить';
  if (!mob.matches) openSheet(false);         // вернулись на десктоп — панель снова на месте
}

const aside = document.querySelector('aside');
const sheetOpen = () => aside.classList.contains('open');
function openSheet(on) {
  aside.classList.toggle('open', on);
  $('scrim').classList.toggle('on', on);
  $('gear').classList.toggle('on', on);
  hideTip();
}
$('gear').onclick = () => openSheet(!sheetOpen());
$('scrim').onclick = () => openSheet(false);
$('sheetx').onclick = () => openSheet(false);
mob.addEventListener('change', () => { relayout(); fitCanvas(); draw(); });

/* ================= старт ================= */
relayout();
/* холст меняет размер не только вместе с окном: появилась строка ошибки — выросла
   шапка, открылась шторка, вылезла экранная клавиатура. ResizeObserver ловит все
   случаи одинаково, вместо ручного fitCanvas() из каждого такого места. */
new ResizeObserver(() => { fitCanvas(); draw(); }).observe($('pw'));
window.addEventListener('resize', () => { fitCanvas(); autosizeEq(); draw(); });
fitCanvas();
loadPreset(PRESETS[0]);
syncPlay();
requestAnimationFrame(frame);

window.__difur = { S, sim, PRESETS, MOB, loadPreset, px2x, py2u, x2px, u2py, applySystem,
                   prettyEq, fitMath, formatEq, refreshDt, frameSteps,
                   setBudget: ms => stepBudgetMs = ms,
                   stepInfo: () => ({ done: stepsDone, sps: stepsPerSec }) };

})();
