/* ================= холсты: график и диаграмма x–t ================= */
import { $, RADAR_H, S, clamp, sim, topInset, view, viewL } from './state';
import { cmap, cmapCx, phaseColor } from './colormap';
import { compColor, u2py, viewRange, x2px } from './geometry';

export const plot = $('plot') as HTMLCanvasElement;
export const pctx = plot.getContext('2d')!;
const xt = $('xt') as HTMLCanvasElement;
const xctx = xt.getContext('2d')!;
export const XT_W = 1200, XT_H = 400, XT_MAX = 8;
xt.width = XT_W; xt.height = XT_H;
let xtBuf: ImageData[] = [], xtScale: number[] = [];

export function clearXT() {
  xtBuf = []; xtScale = [];
  for (let c = 0; c < Math.min(sim.M, XT_MAX); c++) {
    const img = xctx.createImageData(XT_W, XT_H), d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i]=10; d[i+1]=14; d[i+2]=21; d[i+3]=255; }
    xtBuf.push(img); xtScale.push(1e-6);
  }
  showXT();
}

export function pushRow() {
  const N = sim.N, dg = sim.diagnostics();
  for (let c = 0; c < xtBuf.length; c++) {
    const u = sim.getU(c), d = xtBuf[c].data, cx = sim.isComplex(c), w = cx ? sim.getUi(c) : null;
    const mx = isFinite(dg.per[c].max) ? dg.per[c].max : 0;
    xtScale[c] = Math.max(mx, xtScale[c]*0.995, 1e-6);
    const sc = xtScale[c];
    d.copyWithin(0, XT_W*4);
    const off = (XT_H-1)*XT_W*4;
    for (let px = 0; px < XT_W; px++) {
      const j = Math.min(N-1, Math.floor(px*N/XT_W));
      const col = cx ? cmapCx(u[j], w![j], sc) : cmap(u[j]/sc);
      d[off+4*px] = col[0]; d[off+4*px+1] = col[1]; d[off+4*px+2] = col[2]; d[off+4*px+3] = 255;
    }
  }
  showXT();
}

export function showXT() {
  if (xtBuf[S.sel]) xctx.putImageData(xtBuf[S.sel], 0, 0);
  else { xctx.fillStyle = '#0a0e15'; xctx.fillRect(0,0,XT_W,XT_H); }
  // Диаграмма всегда показывает кольцо целиком, а границы окна отмечены
  // линиями: именно здесь заранее видно волну, которая идёт по запасу к экрану.
  // Запас не затемняем — затемнить его значило бы спрятать ровно то, ради чего
  // диаграмма и оставлена во всю ширину.
  if (S.pad > 1) {
    const a = XT_W*(1 - 1/S.pad)/2, b = XT_W - a;
    xctx.strokeStyle = '#7f93ad'; xctx.lineWidth = 2; xctx.setLineDash([6,5]);
    xctx.beginPath();
    xctx.moveTo(a,0); xctx.lineTo(a,XT_H); xctx.moveTo(b,0); xctx.lineTo(b,XT_H);
    xctx.stroke(); xctx.setLineDash([]);
  }
  const n = sim.model ? sim.model.comps[S.sel].name : '';
  $('xtag').textContent = 'диаграмма x–t: ' + n + ' (время вниз)'
    + (S.pad > 1 ? ' · всё кольцо, пунктир — края окна' : '');
}

/* ================= отрисовка ================= */
export function fitCanvas() {
  const r = plot.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  view.PW = Math.max(50, r.width); view.PH = Math.max(50, r.height);
  plot.width = Math.round(view.PW*dpr); plot.height = Math.round(view.PH*dpr);
  pctx.setTransform(dpr,0,0,dpr,0,0);
}

export function niceStep(range: number) {
  const raw = range/6, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw/p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10)*p;
}

/** |ψ| ломаной, каждый отрезок своим тоном; заливка под ней — тем же тоном */
function curveCx(ci: number, width: number, fill: boolean) {
  const ctx = pctx, N = sim.N, re = sim.getU(ci), im = sim.getUi(ci);
  const mod = (j: number) => Math.hypot(re[j], im[j]);
  if (fill) {
    const y0 = u2py(0);
    for (let j = 0; j < N - 1; j++) {
      ctx.fillStyle = phaseColor(re[j], im[j], 55, 0.22);
      const xa = x2px(sim.x[j]), xb = x2px(sim.x[j+1]);
      ctx.beginPath();
      ctx.moveTo(xa, y0); ctx.lineTo(xa, u2py(mod(j)));
      ctx.lineTo(xb, u2py(mod(j+1))); ctx.lineTo(xb, y0);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.save();
  ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (let j = 0; j < N - 1; j++) {
    ctx.strokeStyle = phaseColor(re[j], im[j]);
    ctx.beginPath();
    ctx.moveTo(x2px(sim.x[j]), u2py(mod(j)));
    ctx.lineTo(x2px(sim.x[j+1]), u2py(mod(j+1)));
    ctx.stroke();
  }
  ctx.restore();
}

/* ================= радар: поле целиком ================= */
/** Полоска сверху: всё расчётное кольцо в сжатом масштабе и рамка окна показа.
    Нужна ровно потому, что запас за окном невидим: без неё волна, ушедшая за
    край экрана, возвращалась бы через полкольца сюрпризом — а так её видно всю
    дорогу. При pad=1 полоски нет и график занимает холст целиком, как раньше. */
function radar() {
  const c = pctx, PW = view.PW, N = sim.N, H = RADAR_H;
  const top = 2, bot = H - 2;
  const X = (j: number) => j/(N-1)*PW;
  const Y = (u: number) => clamp(bot - (u - S.yMin)/(S.yMax - S.yMin)*(bot - top), top, bot);
  const [j0, j1] = viewRange();
  const wx0 = X(j0), wx1 = X(j1 - 1);
  c.save();
  c.fillStyle = '#0a0e15'; c.fillRect(0, 0, PW, H);          // запас — темнее
  c.fillStyle = '#0e1420'; c.fillRect(wx0, 0, wx1 - wx0, H); // окно — фоном графика
  if (sim.model)
    for (const comp of sim.model.comps) {
      if (!S.vis[comp.ci]) continue;
      const u = sim.getU(comp.ci), w = comp.complex ? sim.getUi(comp.ci) : null;
      c.strokeStyle = compColor(comp); c.lineWidth = 1;
      c.globalAlpha = comp.ci === S.sel ? 0.95 : 0.5;
      c.beginPath();
      for (let j = 0; j < N; j++) {
        const v = w ? Math.hypot(u[j], w[j]) : u[j];
        j ? c.lineTo(X(j), Y(v)) : c.moveTo(X(j), Y(v));
      }
      c.stroke();
    }
  c.globalAlpha = 1;
  c.strokeStyle = '#2f4560'; c.lineWidth = 1;
  c.strokeRect(wx0 + 0.5, 0.5, wx1 - wx0 - 1, H - 1);
  c.fillStyle = '#41536b'; c.font = '9px Consolas,monospace';
  c.fillText('кольцо L=' + sim.L.toFixed(0), 3, H - 5);
  c.restore();
}

function curve(arr: ArrayLike<number>, color: string, dash: number[], width: number, alpha?: number) {
  const ctx = pctx, N = sim.N;
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
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

export function draw() {
  const c = pctx, PW = view.PW, PH = view.PH, TOP = topInset();
  c.clearRect(0,0,PW,PH);
  c.fillStyle = '#0e1420'; c.fillRect(0,0,PW,PH);
  c.font = '10px Consolas,monospace'; c.lineWidth = 1;
  if (S.pad > 1) radar();

  const sy = niceStep(S.yMax - S.yMin);
  for (let v = Math.ceil(S.yMin/sy)*sy; v <= S.yMax; v += sy) {
    const y = u2py(v), zero = Math.abs(v) < 1e-9;
    c.strokeStyle = zero ? '#2f4560' : '#18222f';
    c.beginPath(); c.moveTo(0,y); c.lineTo(PW,y); c.stroke();
    c.fillStyle = '#5d708a';
    c.fillText(v.toFixed(Math.max(0, -Math.floor(Math.log10(sy)))), 4, y-3);
  }
  // сетка по x отмеряется по окну: за его краями холста нет
  const VL = viewL(), sx = niceStep(VL);
  for (let v = Math.ceil(-VL/2/sx)*sx; v <= VL/2; v += sx) {
    const x = x2px(v);
    c.strokeStyle = '#18222f';
    c.beginPath(); c.moveTo(x,TOP); c.lineTo(x,PH); c.stroke();
    c.fillStyle = '#41536b'; c.fillText(v.toFixed(0), x+3, PH-6);
  }
  if (!sim.model) return;
  // кривые обрезаются по полю графика: горб выше yMax иначе залез бы на радар
  c.save();
  c.beginPath(); c.rect(0, TOP, PW, PH - TOP); c.clip();

  // начальные условия — призраком (у комплексного поля призрак тоже по модулю)
  if (S.showIC)
    for (const comp of sim.model.comps)
      if (S.vis[comp.ci] && S.ic[comp.ci]) {
        let g = S.ic[comp.ci]!;
        if (S.icI[comp.ci]) {
          const w = S.icI[comp.ci]!, m = new Float64Array(g.length);
          for (let j = 0; j < g.length; j++) m[j] = Math.hypot(g[j], w[j]);
          g = m;
        }
        curve(g, compColor(comp), [3,4], 1, 0.28);
      }

  // заливка под выбранным полем
  const sel = sim.model.comps[S.sel];
  if (S.vis[S.sel] && !sel.complex) {
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
    if (comp.complex) { curveCx(comp.ci, isSel ? 2.4 : 1.6, isSel); continue; }
    if (isSel) { c.shadowColor = compColor(comp) + '99'; c.shadowBlur = 8; }
    curve(sim.getU(comp.ci), compColor(comp),
          comp.d ? [7,4] : [], isSel ? 2.2 : 1.5, comp.d ? 0.85 : 1);
    c.shadowBlur = 0;
  }
  c.restore();
}
