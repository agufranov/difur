/* ================= запись уравнения =================
   Три вещи растут из одного и того же разбора ядра:
   `formatEq` — канонический текст поля ввода (проход по токенам),
   `hlHTML`   — раскраска этого текста на подложке `#eqhl` (те же токены,
                см. src/ui/highlight.ts),
   `prettyEq` — формула для превью, свёрстанная по AST (`parseOne`): дробь
                этажеркой, степень верхним индексом, скобки рисуются под высоту
                содержимого.
   Разбор — тот же, что у решателя, поэтому склейка `uvvxxux` и в раскраске,
   и в формуле разбирается ровно так, как её поймёт ядро. */
import { parseOne, scanFields, tokenize } from '../core';
import type { Node } from '../core';
import { COLORS, escHTML } from './state';

const GREEK: Record<string, string> = { alpha:'α', beta:'β', gamma:'γ', delta:'δ', eps:'ε', epsilon:'ε',
  zeta:'ζ', eta:'η', theta:'θ', kappa:'κ', lambda:'λ', mu:'μ', nu:'ν', xi:'ξ',
  rho:'ρ', sigma:'σ', tau:'τ', phi:'φ', chi:'χ', psi:'ψ', omega:'ω' };
export const EQFUNCS: Record<string, 1> = { sin:1, cos:1, tan:1, exp:1, log:1, sqrt:1, abs:1,
                  tanh:1, sinh:1, cosh:1, sech:1, sign:1 };
export const EQCONSTS: Record<string, 1> = { x:1, t:1, pi:1, e:1, i:1 };

/* цвет поля — тот же, что у его кривой на графике (порядок полей даёт scanFields) */
export function fieldColor(f: string, fields: string[]) {
  const i = fields.indexOf(f);
  return COLORS[(i < 0 ? 0 : i) % COLORS.length];
}

/** канонический текст одной строки; при непонятном тексте — вернуть как есть */
function renderLine(src: string): string {
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
interface MBox { h: string; p: number; tall: boolean }
const P_SUM = 1, P_PROD = 2, P_ATOM = 3;
const box = (h: string, tall?: boolean): MBox => ({ h, p:P_ATOM, tall:!!tall });

/** число; pi и e ядро подставляет значением — возвращаем им имя обратно */
function numHTML(v: number): string {
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
function paren(x: MBox): MBox {
  if (!x.tall) return box('<span class="pn">(</span>' + x.h + '<span class="pn">)</span>');
  return box('<span class="grp"><span class="dlm" data-d="("></span><span class="gb">' +
             x.h + '</span><span class="dlm" data-d=")"></span></span>', true);
}
const wrap = (x: MBox, need: number) => x.p < need ? paren(x) : x;

function mathNode(n: Node, F: string[]): MBox {
  switch (n.k) {
    case 'num':  return box(numHTML(n.v));
    case 'x':    return box('<i class="cn">x</i>');
    case 'time': return box('<i class="cn">t</i>');
    case 'imag': return box('<i class="cn">i</i>');
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
function mathEq(src: string, fields: string[]): string {
  const eq = parseOne(src, fields);
  const l = mathNode(eq.lhs, fields).h;
  return eq.rhs ? l + '<span class="eqs">=</span>' + mathNode(eq.rhs, fields).h : l;
}

/** уравнения по строкам; комментарии («# …») сохраняются */
function eqLines(text: string, html: boolean): string[] | null {
  /* строки режутся до tokenize: «;» — разделитель уравнений, а не токен ядра */
  const raws = text.split(/[\n;]+/).map(s => s.trim()).filter(s => s);
  let fields: string[] = [];
  try { fields = scanFields(raws.join('\n')); } catch (e) { return null; }
  const out: string[] = [];
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
export function formatEq(text: string): string {
  const ls = eqLines(text, false);
  return ls && ls.length ? ls.join('\n') : text;
}

/** формула для превью: система нескольких уравнений собирается под скобкой */
export function prettyEq(text: string): string {
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
function delimPath(kind: string, W: number, H: number): string {
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
export function fitMath(root: HTMLElement) {
  for (const el of root.querySelectorAll<HTMLElement>('.dlm')) {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) continue;
    el.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h +
                   '"><path d="' + delimPath(el.dataset.d!, w, h) + '"/></svg>';
  }
}
