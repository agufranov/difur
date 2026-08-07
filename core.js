/* core.js — разбор СИСТЕМЫ уравнений вида
       utt = -v*ut
       vt  = -V*ut
       zt  = -u*v*vxx*ux
   и псевдоспектральный решатель с ETDRK4 (Cox–Matthews / Kassam–Trefethen).

   Поля — односимвольные буквы, у которых где-то встречается производная по
   времени (ut, vt, ztt, …).  Порядок по времени понижается автоматически:
   поле порядка m даёт m компонент состояния (u, ut, utt, …).
   Диагональная (по компонентам) линейная часть с постоянными коэффициентами
   считается точно экспонентой; всё остальное — явно, псевдоспектрально.
   Границы периодические, нелинейность защищена фильтром 2/3. */
(function (global) {
'use strict';

/* ================= FFT (radix-2, in-place) ================= */
class FFT {
  constructor(n) {
    if ((n & (n - 1)) !== 0) throw new Error('N должно быть степенью двойки');
    this.n = n;
    const bits = Math.round(Math.log2(n));
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let j = 0; j < bits; j++) if ((i >> j) & 1) r |= 1 << (bits - 1 - j);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos(-2 * Math.PI * i / n);
      this.sin[i] = Math.sin(-2 * Math.PI * i / n);
    }
  }
  run(re, im, inv) {
    const n = this.n, rev = this.rev, C = this.cos, S = this.sin;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const step = n / len, half = len >> 1;
      for (let i = 0; i < n; i += len) {
        for (let j = 0; j < half; j++) {
          const k = j * step;
          const wr = C[k], wi = inv ? -S[k] : S[k];
          const a = i + j, b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr;        im[a] += xi;
        }
      }
    }
    if (inv) { const s = 1 / n; for (let i = 0; i < n; i++) { re[i] *= s; im[i] *= s; } }
  }
  forward(re, im) { this.run(re, im, false); }
  inverse(re, im) { this.run(re, im, true); }
}

/* ================= лексика ================= */

const FUNCS = { sin:1, cos:1, tan:1, exp:1, log:1, sqrt:1, abs:1,
                tanh:1, sinh:1, cosh:1, sech:1, sign:1,
                /* работа с комплексным полем: |ψ|, ψ*, Re, Im, фаза */
                conj:1, re:1, im:1, arg:1 };
/** Функции, чей результат вещественный при любом аргументе. На них держится вся
    типизация: `vt = abs(u)` при комплексном u даёт вещественное v, и только
    поэтому «комплексность» не расползается по системе от одного поля ко всем. */
const REALFN = { abs:1, re:1, im:1, arg:1 };
const RESERVED = { x:1, t:1, e:1, pi:1, i:1 };

/* ================= комплексные числа =================
   Нужны ровно в одном месте — в свёртке констант, чтобы `i` дожила от текста
   уравнения до коэффициента диагонального символа. Ни состояние, ни кодогенерация
   этих объектов не видят: состояние и так лежит парой массивов re/im, а в явную
   часть комплексный коэффициент попасть не может (проверяется в buildSystem). */
const CX = (re, im) => ({ re, im: im || 0 });
const cxAdd = (a, b) => CX(a.re + b.re, a.im + b.im);
const cxSub = (a, b) => CX(a.re - b.re, a.im - b.im);
const cxNeg = a => CX(-a.re, -a.im);
const cxMul = (a, b) => CX(a.re*b.re - a.im*b.im, a.re*b.im + a.im*b.re);
const cxDiv = (a, b) => {
  const d = b.re*b.re + b.im*b.im;
  return CX((a.re*b.re + a.im*b.im)/d, (a.im*b.re - a.re*b.im)/d);
};
const cxAbs = a => Math.hypot(a.re, a.im);
const isReal = a => a.im === 0;
/** целая степень — точно, повторным умножением: `i^2` обязана дать ровно -1,
    а через exp/log вышло бы -1 + 1.2e-16i, и поле стало бы «комплексным» */
function cxPow(a, b) {
  if (!isReal(b)) throw new Error('не константа');
  if (isReal(a)) return CX(Math.pow(a.re, b.re));
  if (b.re !== Math.round(b.re)) throw new Error('не константа');
  let n = Math.abs(b.re), r = CX(1, 0);
  for (let q = 0; q < n; q++) r = cxMul(r, a);
  return b.re < 0 ? cxDiv(CX(1, 0), r) : r;
}

/* ================= комплексная арифметика явной части =================
   Явная часть — это цикл по сетке, который зовётся N·4 раза за шаг. Пара чисел
   объектом или массивом означала бы мусор для сборщика ровно там, где считается
   решение, поэтому функции кладут результат в общий `CT`, а сгенерированный код
   тут же его разбирает. Сложение и умножение сюда не попали нарочно: они
   разворачиваются в арифметику прямо в тексте функции. */
const CT = new Float64Array(2);
const CFN = {
  exp(ar, ai) { const m = Math.exp(ar); CT[0] = m*Math.cos(ai); CT[1] = m*Math.sin(ai); },
  log(ar, ai) { CT[0] = Math.log(Math.hypot(ar, ai)); CT[1] = Math.atan2(ai, ar); },
  sqrt(ar, ai) { const m = Math.sqrt(Math.hypot(ar, ai)), a = Math.atan2(ai, ar)/2;
                 CT[0] = m*Math.cos(a); CT[1] = m*Math.sin(a); },
  sin(ar, ai)  { CT[0] = Math.sin(ar)*Math.cosh(ai);  CT[1] = Math.cos(ar)*Math.sinh(ai); },
  cos(ar, ai)  { CT[0] = Math.cos(ar)*Math.cosh(ai);  CT[1] = -Math.sin(ar)*Math.sinh(ai); },
  sinh(ar, ai) { CT[0] = Math.sinh(ar)*Math.cos(ai);  CT[1] = Math.cosh(ar)*Math.sin(ai); },
  cosh(ar, ai) { CT[0] = Math.cosh(ar)*Math.cos(ai);  CT[1] = Math.sinh(ar)*Math.sin(ai); },
  sign(ar, ai) { const m = Math.hypot(ar, ai);        // z/|z| — направление на плоскости
                 CT[0] = m > 0 ? ar/m : 0; CT[1] = m > 0 ? ai/m : 0; },
  /** z^b с вещественным b — через полярную форму. Целые степени сюда не доходят:
      кодогенерация разворачивает их в умножения, чтобы `u^2` было ровно `u*u` */
  pow(ar, ai, b) { const m = Math.pow(Math.hypot(ar, ai), b), a = Math.atan2(ai, ar)*b;
                   CT[0] = m*Math.cos(a); CT[1] = m*Math.sin(a); },
  tan(ar, ai)  { const sr = Math.sin(ar)*Math.cosh(ai), si = Math.cos(ar)*Math.sinh(ai);
                 const cr = Math.cos(ar)*Math.cosh(ai), cq = -Math.sin(ar)*Math.sinh(ai);
                 const d = cr*cr + cq*cq;
                 CT[0] = (sr*cr + si*cq)/d; CT[1] = (si*cr - sr*cq)/d; },
  tanh(ar, ai) { const sr = Math.sinh(ar)*Math.cos(ai), si = Math.cosh(ar)*Math.sin(ai);
                 const cr = Math.cosh(ar)*Math.cos(ai), cq = Math.sinh(ar)*Math.sin(ai);
                 const d = cr*cr + cq*cq;
                 CT[0] = (sr*cr + si*cq)/d; CT[1] = (si*cr - sr*cq)/d; },
  sech(ar, ai) { const cr = Math.cosh(ar)*Math.cos(ai), cq = Math.sinh(ar)*Math.sin(ai);
                 const d = cr*cr + cq*cq; CT[0] = cr/d; CT[1] = -cq/d; }
};

/** ошибка с координатами куска текста, на который она указывает (для подсветки) */
function span(e, pos, len) {
  if (e.pos === undefined && pos !== undefined) { e.pos = pos; e.len = Math.max(1, len || 1); }
  return e;
}
function errAt(msg, pos, len) { return span(new Error(msg), pos, len); }

/** у каждого токена есть i…j — где он стоит в исходной строке */
function tokenize(src) {
  const toks = []; let i = 0;
  const isDigit = c => c >= '0' && c <= '9';
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      let j = i;
      while (j < src.length && (isDigit(src[j]) || src[j] === '.')) j++;
      if (src[j] === 'e' || src[j] === 'E') {
        let k = j + 1;
        if (src[k] === '+' || src[k] === '-') k++;
        if (isDigit(src[k] || '')) { while (isDigit(src[k] || '')) k++; j = k; }
      }
      const v = parseFloat(src.slice(i, j));
      if (!isFinite(v)) throw errAt('Не число: «' + src.slice(i, j) + '»', i, j - i);
      toks.push({ t: 'num', v, i, j }); i = j; continue;
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_{}]/.test(src[j])) j++;
      toks.push({ t: 'id', v: src.slice(i, j).replace(/[_{}]/g, ''), i, j });
      i = j; continue;
    }
    if ('+-*/^(),='.indexOf(c) >= 0) { toks.push({ t: c, i, j: i + 1 }); i++; continue; }
    throw errAt('Неизвестный символ «' + c + '»', i, 1);
  }
  toks.push({ t: 'end', i: src.length, j: src.length });
  return toks;
}

/* «uvvxxux» -> u · v · vxx · ux ;  «utt» -> ∂²u/∂t² */
function splitAtoms(name, fields) {
  const out = [];
  let i = 0;
  while (i < name.length) {
    const c = name[i];
    if (fields.indexOf(c) < 0) return null;
    let j = i + 1, dt = 0, dx = 0;
    if (name[j] === 'x') { while (name[j] === 'x') { dx++; j++; } }
    else if (name[j] === 't') { while (name[j] === 't') { dt++; j++; } }
    if (name[j] === 'x' || name[j] === 't')
      throw new Error('Смешанные производные («' + name + '») не поддерживаются');
    out.push({ k:'d', f:c, dt, dx });
    i = j;
  }
  return out.length ? out : null;
}

/** поля системы: буквы, у которых где-то есть производная по времени */
function scanFields(text) {
  const set = [];
  for (const tk of tokenize(text)) {
    if (tk.t !== 'id') continue;
    const m = /^([A-Za-z])(t+)$/.exec(tk.v);
    if (!m) continue;
    if (RESERVED[m[1]]) throw errAt('Поле не может называться «' + m[1] + '»', tk.i, tk.j - tk.i);
    if (set.indexOf(m[1]) < 0) set.push(m[1]);
  }
  return set;
}

/* ================= разбор одного уравнения ================= */
function parseOne(src, fields, warn) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  /* ошибка указывает на текущий (или заданный) токен */
  const bad = (msg, tk) => { tk = tk || peek(); return errAt(msg, tk.i, tk.j - tk.i); };
  const eat = t => { if (toks[p].t !== t) throw bad('Ожидалось «' + t + '»'); return toks[p++]; };

  function expr() {
    let a = term();
    for (;;) {
      const t = peek().t;
      if (t === '+') { p++; a = { k:'add', a, b:term() }; }
      else if (t === '-') { p++; a = { k:'sub', a, b:term() }; }
      else return a;
    }
  }
  function term() {
    let a = unary();
    for (;;) {
      const t = peek().t;
      if (t === '*') { p++; a = { k:'mul', a, b:unary() }; }
      else if (t === '/') { p++; a = { k:'div', a, b:unary() }; }
      else if (t === 'num' || t === 'id' || t === '(') a = { k:'mul', a, b:unary() };
      else return a;
    }
  }
  function unary() {
    if (peek().t === '-') { p++; return { k:'neg', a:unary() }; }
    if (peek().t === '+') { p++; return unary(); }
    return power();
  }
  function power() {
    const base = atom();
    if (peek().t === '^') { p++; return { k:'pow', a:base, b:unary() }; }
    return base;
  }
  function atom() {
    const tk = peek();
    if (tk.t === 'num') { p++; return { k:'num', v:tk.v }; }
    if (tk.t === '(') { p++; const e = expr(); eat(')'); return e; }
    if (tk.t === 'id') {
      p++;
      const name = tk.v;
      if (FUNCS[name] && peek().t === '(') { p++; const a = expr(); eat(')'); return { k:'fn', name, a }; }
      if (name === 'x') return { k:'x' };
      if (name === 't') return { k:'time' };
      if (name === 'pi') return { k:'num', v:Math.PI };
      if (name === 'e') return { k:'num', v:Math.E };
      if (name === 'i') return { k:'imag' };
      let parts;
      try { parts = splitAtoms(name, fields); }
      catch (e) { throw span(e, tk.i, tk.j - tk.i); }
      if (parts) {
        let node = parts[0];
        for (let i = 1; i < parts.length; i++) node = { k:'mul', a:node, b:parts[i] };
        return node;
      }
      if (peek().t === '(' && warn)
        warn('«' + name + '(…)» понято как умножение ' + name + '·(…) — такой функции нет');
      return { k:'par', name };
    }
    throw bad(tk.t === 'end' ? 'Выражение оборвано' : 'Неожиданный элемент в выражении');
  }

  const lhs = expr();
  let rhs = null;
  if (peek().t === '=') { p++; rhs = expr(); }
  if (peek().t !== 'end') throw bad('Лишние символы в конце выражения');
  return { src, lhs, rhs, ast: rhs ? { k:'sub', a:lhs, b:rhs } : lhs };
}

/* ================= обходы ================= */
function walk(node, fn) {
  fn(node);
  if (node.a) walk(node.a, fn);
  if (node.b) walk(node.b, fn);
}
function flatten(node, sign, out) {
  if (node.k === 'add') { flatten(node.a, sign, out); flatten(node.b, sign, out); }
  else if (node.k === 'sub') { flatten(node.a, sign, out); flatten(node.b, -sign, out); }
  else if (node.k === 'neg') { flatten(node.a, -sign, out); }
  else out.push({ node, sign });
}
function contains(node, pred) {
  let f = false;
  walk(node, n => { if (pred(n)) f = true; });
  return f;
}
/** значение константного выражения — всегда комплексное (у вещественного im === 0) */
function constVal(node, P) {
  switch (node.k) {
    case 'num': return CX(node.v);
    case 'imag': return CX(0, 1);
    case 'par':
      if (!(node.name in P)) throw new Error('Неизвестный параметр ' + node.name);
      return CX(P[node.name]);
    case 'add': return cxAdd(constVal(node.a,P), constVal(node.b,P));
    case 'sub': return cxSub(constVal(node.a,P), constVal(node.b,P));
    case 'mul': return cxMul(constVal(node.a,P), constVal(node.b,P));
    case 'div': return cxDiv(constVal(node.a,P), constVal(node.b,P));
    case 'pow': return cxPow(constVal(node.a,P), constVal(node.b,P));
    case 'neg': return cxNeg(constVal(node.a,P));
    case 'fn': { const v = constVal(node.a,P);
      // четыре функции определены и на комплексном, и как раз они возвращают
      // вещественное — на них потом держится типизация выражений
      if (node.name === 're')   return CX(v.re);
      if (node.name === 'im')   return CX(v.im);
      if (node.name === 'conj') return CX(v.re, -v.im);
      if (node.name === 'abs')  return CX(cxAbs(v));
      if (node.name === 'arg')  return CX(Math.atan2(v.im, v.re));
      if (!isReal(v)) throw new Error('не константа');   // sin(i) и прочее — не наш случай
      return CX(node.name === 'sech' ? 1/Math.cosh(v.re) : Math[node.name](v.re)); }
    default: throw new Error('не константа');
  }
}
function tryConst(node, P) { try { return constVal(node, P); } catch (e) { return null; } }

/** c · ∂ₓⁿ(компонента) ?  ci(node) отображает атом в номер компоненты.
    Коэффициент `c` комплексный: `i*uxx` — такой же диагональный член, как `2*uxx`. */
function asLinear(node, P, ci) {
  switch (node.k) {
    case 'd': { const c = ci(node); return c < 0 ? null : { c:CX(1), ci:c, n:node.dx }; }
    case 'neg': { const r = asLinear(node.a,P,ci); return r ? { c:cxNeg(r.c), ci:r.ci, n:r.n } : null; }
    case 'mul': {
      const ra = asLinear(node.a,P,ci), rb = asLinear(node.b,P,ci);
      if (ra && !rb) { const c = tryConst(node.b,P); return c === null ? null : { c:cxMul(ra.c,c), ci:ra.ci, n:ra.n }; }
      if (rb && !ra) { const c = tryConst(node.a,P); return c === null ? null : { c:cxMul(rb.c,c), ci:rb.ci, n:rb.n }; }
      return null;
    }
    case 'div': {
      const ra = asLinear(node.a,P,ci); if (!ra) return null;
      const c = tryConst(node.b,P);
      return (c === null || cxAbs(c) === 0) ? null : { c:cxDiv(ra.c,c), ci:ra.ci, n:ra.n };
    }
    case 'pow': { const e = tryConst(node.b,P);
      return (e && isReal(e) && e.re === 1) ? asLinear(node.a,P,ci) : null; }
    default: return null;
  }
}

/** коэффициент при атоме, выделяемом предикатом isT (должен входить линейно) */
function coefOfAtom(node, isT, P) {
  const has = n => contains(n, isT);
  const cst = n => {                       // множитель обязан быть константой
    try { return constVal(n, P); }
    catch (e) {
      if (/Неизвестный параметр/.test(e.message)) throw e;
      throw new Error('Старшая производная по времени должна входить линейно, ' +
                      'с постоянным коэффициентом');
    }
  };
  switch (node.k) {
    // коэффициент комплексный: `i*ut = -uxx` — это тот же Шрёдингер, просто записанный
    // так, как его пишут физики, и делить на `i` мы обязаны уметь
    case 'd': if (isT(node)) return CX(1); break;
    case 'neg': return cxNeg(coefOfAtom(node.a, isT, P));
    case 'mul': {
      const a = has(node.a), b = has(node.b);
      if (a && !b) return cxMul(coefOfAtom(node.a,isT,P), cst(node.b));
      if (b && !a) return cxMul(coefOfAtom(node.b,isT,P), cst(node.a));
      break;
    }
    case 'div':
      if (has(node.a) && !has(node.b)) return cxDiv(coefOfAtom(node.a,isT,P), cst(node.b));
      break;
  }
  throw new Error('Старшая производная по времени должна входить линейно, с постоянным коэффициентом');
}

/* ================= генерация кода =================
   Явная часть системы считается одним циклом по сетке: `gen` кодирует
   вещественное выражение, `makeGen` — всё остальное. Граница между ними важнее,
   чем кажется: **вещественное поддерево кодируется ровно тем же текстом, что и
   до появления комплексных полей**, поэтому у вещественных задач сгенерированная
   функция осталась прежней слово в слово, а вместе с ней и эталоны точности. */

/** вещественный аргумент: conj и re — тождество, im — ноль, arg — 0 или π */
function realFn(name, a) {
  if (name === 'conj' || name === 're') return a;
  if (name === 'im') return '(0)';
  if (name === 'arg') return 'Math.atan2(0,' + a + ')';
  return (name === 'sech' ? 'sech(' : 'Math.' + name + '(') + a + ')';
}

function gen(node, ci) {
  switch (node.k) {
    case 'num': return '(' + node.v + ')';
    case 'x':   return 'X[i]';
    case 'time':return 'T';
    case 'par': return 'P["' + node.name + '"]';
    case 'd':   return 'D[' + ci(node) + '][' + node.dx + '][i]';
    case 'add': return '(' + gen(node.a,ci) + '+' + gen(node.b,ci) + ')';
    case 'sub': return '(' + gen(node.a,ci) + '-' + gen(node.b,ci) + ')';
    case 'mul': return '(' + gen(node.a,ci) + '*' + gen(node.b,ci) + ')';
    case 'div': return '(' + gen(node.a,ci) + '/' + gen(node.b,ci) + ')';
    case 'pow': return 'Math.pow(' + gen(node.a,ci) + ',' + gen(node.b,ci) + ')';
    case 'neg': return '(-' + gen(node.a,ci) + ')';
    case 'fn':  return realFn(node.name, gen(node.a,ci));
    // сеть безопасности: до сюда `i` доходить не должна — её ловит makeGen
    case 'imag': throw new Error('Мнимая единица в вещественном выражении');
    default: throw new Error('не могу сгенерировать код');
  }
}

/** Кодогенератор явной части, знающий про комплексные значения.
    Возвращает `cxVal` (нужен ещё и для типизации компонент) и `build`. */
function makeGen(P, ci, comps) {

  /* Комплексно ли ЗНАЧЕНИЕ выражения. Константы сворачиваются первыми, поэтому
     `i*i` — вещественная минус единица, а не «что-то с мнимой частью»: без этого
     `ut = i*i*uxx` объявляло бы поле комплексным, а оно теплопроводность. */
  function cxVal(n) {
    const cv = tryConst(n, P);
    if (cv) return cv.im !== 0;
    switch (n.k) {
      case 'd': { const j = ci(n); return j >= 0 && !!comps[j].complex; }
      case 'fn': return REALFN[n.name] ? false : cxVal(n.a);
      case 'num': case 'x': case 'time': case 'par': return false;
      default: return !!(n.a && cxVal(n.a)) || !!(n.b && cxVal(n.b));
    }
  }

  /* «содержит комплексное внутри», а не «комплексно само». Разница — это `abs(u)`:
     значение вещественное, но посчитать его старым кодом нельзя, там вышло бы
     |Re ψ| вместо |ψ|. Ошибка такого сорта самая тихая из возможных — решение
     остаётся конечным и правдоподобным, — поэтому дерево проверяется целиком. */
  const cxIn = n => { let f = false; walk(n, q => { if (cxVal(q)) f = true; }); return f; };

  const out = [];                       // операторы тела цикла для текущей компоненты
  let nt = 0, where = null;             // where — член, на который указывать ошибкой
  const T = () => 't' + (nt++);
  const atom = s => /^\(?-?[\w.$"[\]]+\)?$/.test(s);
  /** вещественное выражение, которое подставится дважды: иначе поддеревья
      удваиваются на каждом умножении и на `abs(u)^2*u` код растёт лавиной */
  const hold = s => { if (atom(s)) return s; const v = T(); out.push('const ' + v + '=' + s + ';'); return v; };
  const pair = (r, m) => { const a = T(), b = T();
                           out.push('const ' + a + '=' + r + ',' + b + '=' + m + ';');
                           return { r:a, i:b }; };
  const num = v => '(' + v + ')';

  function mul(a, b) {
    if (!a.i && !b.i) return { r:'(' + a.r + '*' + b.r + ')', i:null };
    if (!a.i) { const q = a; a = b; b = q; }               // вещественный множитель — вторым
    if (!b.i) { const q = hold(b.r); return pair('(' + a.r + '*' + q + ')', '(' + a.i + '*' + q + ')'); }
    return pair('(' + a.r + '*' + b.r + '-' + a.i + '*' + b.i + ')',
                '(' + a.r + '*' + b.i + '+' + a.i + '*' + b.r + ')');
  }
  function div(a, b) {
    if (!b.i) {
      const q = a.i ? hold(b.r) : b.r;
      return a.i ? pair('(' + a.r + '/' + q + ')', '(' + a.i + '/' + q + ')')
                 : { r:'(' + a.r + '/' + q + ')', i:null };
    }
    const d = T(), ai = a.i || '0';
    out.push('const ' + d + '=' + b.r + '*' + b.r + '+' + b.i + '*' + b.i + ';');
    return pair('((' + a.r + '*' + b.r + '+' + ai + '*' + b.i + ')/' + d + ')',
                '((' + ai + '*' + b.r + '-' + a.r + '*' + b.i + ')/' + d + ')');
  }

  /** узел -> {r, i}; i === null означает «значение вещественно» */
  function em(node) {
    if (!cxIn(node)) return { r: gen(node, ci), i:null };        // прежний путь, дословно
    const cv = tryConst(node, P);
    if (cv) return cv.im !== 0 ? pair(num(cv.re), num(cv.im)) : { r:num(cv.re), i:null };
    switch (node.k) {
      case 'd': { const j = ci(node);
        return { r:'D[' + j + '][' + node.dx + '][i]', i:'Di[' + j + '][' + node.dx + '][i]' }; }
      case 'add': case 'sub': {
        const s = node.k === 'add' ? '+' : '-', a = em(node.a), b = em(node.b);
        if (!a.i && !b.i) return { r:'(' + a.r + s + b.r + ')', i:null };
        return pair('(' + a.r + s + b.r + ')', '(' + (a.i || '0') + s + (b.i || '0') + ')');
      }
      case 'neg': { const a = em(node.a);
        return a.i ? pair('(-' + a.r + ')', '(-' + a.i + ')') : { r:'(-' + a.r + ')', i:null }; }
      case 'mul': return mul(em(node.a), em(node.b));
      case 'div': return div(em(node.a), em(node.b));
      case 'pow': {
        const b = em(node.b);
        if (b.i) throw errAt('Комплексный показатель степени не поддерживается: справа от «^» ' +
                             'должно стоять вещественное число', where.at, where.len);
        const a = em(node.a);
        if (!a.i) return { r:'Math.pow(' + a.r + ',' + b.r + ')', i:null };
        const e = tryConst(node.b, P);
        // целая степень — повторным умножением: `u^2` обязана быть ровно `u*u`,
        // иначе |ψ|² у НУШ считался бы через atan2/exp и терял точность на ровном месте
        if (e && isReal(e) && e.re === Math.round(e.re) && Math.abs(e.re) <= 8) {
          const n = Math.abs(e.re);
          if (n === 0) return { r:'(1)', i:null };
          let acc = a;
          for (let q = 1; q < n; q++) acc = mul(acc, a);
          return e.re > 0 ? acc : div({ r:'(1)', i:null }, acc);
        }
        out.push('C.pow(' + a.r + ',' + a.i + ',' + b.r + ');');
        return pair('CT[0]', 'CT[1]');
      }
      case 'fn': {
        const a = em(node.a);
        if (!a.i) return { r: realFn(node.name, a.r), i:null };
        switch (node.name) {
          case 'abs':  return { r:'Math.hypot(' + a.r + ',' + a.i + ')', i:null };
          case 're':   return { r:a.r, i:null };
          case 'im':   return { r:a.i, i:null };
          case 'arg':  return { r:'Math.atan2(' + a.i + ',' + a.r + ')', i:null };
          case 'conj': return { r:a.r, i:'(-' + a.i + ')' };
        }
        out.push('C.' + node.name + '(' + a.r + ',' + a.i + ');');
        return pair('CT[0]', 'CT[1]');
      }
    }
    throw errAt('не могу сгенерировать код', where.at, where.len);
  }

  /** тело цикла по сетке; usesTime — встретилось ли `t` */
  function build() {
    let body = 'const sech=function(z){return 1/Math.cosh(z);};\nfor(let i=0;i<N;i++){\n';
    let usesTime = false;
    for (const c of comps) {
      if (!c.hasExplicit) continue;
      out.length = 0;
      let e = '0', er = '0', ei = '0';
      for (const it of c.explicit) {
        where = it;
        const v = em(it.node);
        walk(it.node, n => { if (n.k === 'time') usesTime = true; });
        if (!c.complex) { e += '+(' + it.coef.re + ')*' + v.r; continue; }
        // (cr + i·cm)·(R + i·I); у вещественного члена I нет, и половина уходит
        const R = v.i ? v.r : hold(v.r), I = v.i;
        const cr = num(it.coef.re), cm = num(it.coef.im);
        er += '+(' + cr + '*' + R + (I ? '-' + cm + '*' + I : '') + ')';
        ei += '+(' + cm + '*' + R + (I ? '+' + cr + '*' + I : '') + ')';
      }
      if (out.length) body += ' ' + out.join('\n ') + '\n';
      body += c.complex
        ? ' O[' + c.ci + '][i]=' + er + ';\n Oi[' + c.ci + '][i]=' + ei + ';\n'
        : ' O[' + c.ci + '][i]=' + e + ';\n';
    }
    return { body: body + '}', usesTime };
  }

  return { cxVal, build };
}

/* ================= сборка системы ================= */

/** уравнения системы вместе со смещением в исходном тексте (нужно для подсветки) */
function splitEqs(text) {
  const out = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i < text.length && text[i] !== '\n' && text[i] !== ';') continue;
    const raw = text.slice(start, i);
    const lead = raw.length - raw.replace(/^\s+/, '').length;
    const src = raw.trim();
    if (src && src[0] !== '#') out.push({ src, at: start + lead });
    start = i + 1;
  }
  return out;
}

function buildSystem(text, params) {
  const P = params || {};
  const warns = [];
  const warn = m => { if (warns.indexOf(m) < 0) warns.push(m); };

  const fields = scanFields(text);
  if (!fields.length)
    throw new Error('Нет ни одной производной по времени (ut, vt, …) — нечего эволюционировать');

  const eqs = [];
  for (const L of splitEqs(text)) {
    let eq;
    try { eq = parseOne(L.src, fields, warn); }
    catch (e) {
      if (e.pos !== undefined) e.pos += L.at;          // позиция внутри строки -> внутри текста
      throw span(e, L.at, L.src.length);
    }
    eq.at = L.at; eq.len = L.src.length;
    eqs.push(eq);
  }

  /* Параметры (всё, что не поле и не служебное имя) — ДО разбора на диагональ и
     явную часть. Пока имени нет в `P`, `tryConst` на нём падает, и `k*uxx`
     уезжает в явную часть вместо точной экспоненты: разница видна на первом же
     построении модели с новым параметром, пока ползунок его не переставил. */
  const pars = [];
  for (const eq of eqs) walk(eq.ast, n => {
    if (n.k === 'par' && pars.indexOf(n.name) < 0) pars.push(n.name);
  });
  for (const nm of pars) if (!(nm in P)) P[nm] = 1;

  // порядок каждого поля по времени
  const order = {};
  fields.forEach(f => order[f] = 1);
  for (const eq of eqs) walk(eq.ast, n => {
    if (n.k === 'd' && n.dt > order[n.f]) order[n.f] = n.dt;
  });

  // какое уравнение какое поле определяет
  const isTopAtom = n => n.k === 'd' && n.dt > 0 && n.dt === order[n.f];
  const owner = {};
  for (const eq of eqs) {
    let f = null;
    const l = eq.lhs;
    if (l.k === 'd' && l.dx === 0 && l.dt === order[l.f]) f = l.f;
    if (!f) {
      const cand = [];
      walk(eq.ast, n => { if (isTopAtom(n) && cand.indexOf(n.f) < 0) cand.push(n.f); });
      if (cand.length === 1) f = cand[0];
      else throw errAt('Не понимаю, для какого поля уравнение «' + eq.src +
                       '». Пиши в виде  ' + (cand[0] || 'u') + 't = …', eq.at, eq.len);
    }
    if (owner[f]) throw errAt('Для поля ' + f + ' задано больше одного уравнения', eq.at, eq.len);
    owner[f] = eq;
  }
  for (const f of fields)
    if (!owner[f]) throw new Error('Нет уравнения для поля ' + f + ' (нужно ' + f + 't = …)');

  // компоненты состояния
  const comps = [];
  const index = {};
  for (const f of fields)
    for (let d = 0; d < order[f]; d++) {
      index[f + ':' + d] = comps.length;
      comps.push({ f, d, name: f + (d ? 't'.repeat(d) : ''), ci: comps.length });
    }
  const ci = n => {
    const k = index[n.f + ':' + n.dt];
    return k === undefined ? -1 : k;
  };

  // правые части
  for (const c of comps) c.terms = [];
  for (const f of fields) {
    const m = order[f];
    const eq = owner[f];
    for (let d = 0; d < m - 1; d++)                      // цепочка понижения порядка
      comps[index[f + ':' + d]].terms.push({ node:{ k:'d', f, dt:d+1, dx:0 }, coef:CX(1),
                                             at:eq.at, len:eq.len });

    const terms = [];
    flatten(eq.ast, 1, terms);
    const isT = n => n.k === 'd' && n.f === f && n.dt === m && n.dx === 0;
    let a = CX(0);
    const rest = [];
    for (const it of terms) {
      if (!contains(it.node, isT)) { rest.push(it); continue; }
      try { a = cxAdd(a, cxMul(CX(it.sign), coefOfAtom(it.node, isT, P))); }
      catch (e) { throw span(e, eq.at, eq.len); }
    }
    if (cxAbs(a) < 1e-14) throw errAt('Уравнение «' + eq.src + '» не разрешается относительно ' +
                                      f + 't'.repeat(m), eq.at, eq.len);
    const top = comps[index[f + ':' + (m-1)]];
    for (const it of rest) {
      if (contains(it.node, isTopAtom))
        throw errAt('Неявная система: в уравнении «' + eq.src +
                    '» старшая производная другого поля стоит не сама по себе', eq.at, eq.len);
      // коэффициент комплексный, если комплексна старшая производная по времени:
      // «i*ut = -uxx» даёт ut = i*uxx ровно здесь
      top.terms.push({ node: it.node, coef: cxDiv(CX(-it.sign), a), at:eq.at, len:eq.len });
    }
  }

  // классификация: диагональная линейная часть / явная часть
  const cross = [];        // {row, col, c, n} — явные линейные связи (для оценки шага)
  let anyExplicit = false;
  for (const c of comps) {
    c.linear = []; c.explicit = []; c.orders = [];
    for (const it of c.terms) {
      const r = asLinear(it.node, P, ci);
      if (r && r.ci === c.ci) { c.linear.push({ c: cxMul(it.coef, r.c), n: r.n }); continue; }
      if (r) cross.push({ row:c.ci, col:r.ci, c: cxMul(it.coef, r.c), n: r.n });
      c.explicit.push(it);
    }
    c.hasExplicit = c.explicit.length > 0;
    if (c.hasExplicit) anyExplicit = true;
  }

  /* ---- Комплексна ли компонента ----

     Вещественность решения держится на эрмитовой симметрии символа
     S(-k) = conj(S(k)). У вещественного коэффициента `c·(ik)^n` она есть при
     любом n — поэтому `uxxx` у КдФ с чисто мнимым символом `i·k³` даёт
     вещественное решение, а мнимый коэффициент её ломает: `i·(ik)²` при -k даёт
     то же самое, а не сопряжённое. Отсюда признак у диагонали: ненулевая мнимая
     часть хоть у одного коэффициента. **«Символ комплексный» ≠ «поле комплексное».**

     Дальше это надо распространить по системе: `i` в одном уравнении делает
     комплексным поле, поле — всё, куда оно входит множителем, и так далее.
     Считается неподвижной точкой снизу вверх (все вещественны, пока не доказано
     обратное) — за проход помечается хотя бы одна компонента, значит проходов не
     больше, чем компонент. Останавливают распространение `abs`, `re`, `im`, `arg`
     (REALFN): без них `vt = abs(u)` тащило бы комплексность на всю систему.

     Ошибаться тут можно только в сторону «комплексно»: лишняя мнимая часть
     окажется нулём и будет стоить памяти, а потерянная тихо испортит решение. */
  const G = makeGen(P, ci, comps);
  for (const c of comps) c.complex = false;
  for (let pass = 0; pass <= comps.length; pass++) {
    let moved = false;
    for (const c of comps) {
      if (c.complex) continue;
      // коэффициент члена комплексен у «i*ut = -uxx»: деление на i — это и есть
      // перевод записи физиков в ut = i*uxx
      if (c.linear.some(l => l.c.im !== 0) ||
          c.explicit.some(it => it.coef.im !== 0 || G.cxVal(it.node))) {
        c.complex = true; moved = true;
      }
    }
    if (!moved) break;
  }
  const anyComplex = comps.some(c => c.complex);

  // какие производные каких компонент нужны в физическом пространстве
  const need = comps.map(() => new Set());
  for (const c of comps)
    for (const it of c.explicit)
      walk(it.node, n => { if (n.k === 'd') { const j = ci(n); if (j >= 0) need[j].add(n.dx); } });
  comps.forEach((c, i) => c.orders = [...need[i]].sort((p, q) => p - q));

  // код
  let fn = null, usesTime = false;
  if (anyExplicit) {
    const r = G.build();
    usesTime = r.usesTime;
    // C и CT — комплексные функции и их выходная ячейка; у вещественной задачи
    // они просто не упоминаются в теле, и текст функции остаётся прежним
    fn = new Function('C','CT','D','Di','X','T','P','O','Oi','N', r.body);
  }

  let maxOrder = 0;
  for (const c of comps) {
    for (const l of c.linear) maxOrder = Math.max(maxOrder, l.n);
    for (const o of c.orders) maxOrder = Math.max(maxOrder, o);
  }

  return { source:text, fields, order, comps, index, ci, cross, nonlin:fn,
           params:P, paramNames:pars, warnings:warns, maxOrder, usesTime,
           complex:anyComplex };
}

/* ================= φ-функции (комплексные) ================= */
function phis(zr, zi) {
  const m = Math.hypot(zr, zi);
  let p1r,p1i,p2r,p2i,p3r,p3i;
  if (m < 1) {
    const f = [1,1,2,6,24,120,720,5040,40320,362880,3628800,39916800,479001600,
               6227020800,87178291200,1307674368000,20922789888000,355687428096000,
               6402373705728000,121645100408832000,2432902008176640000];
    p1r=p1i=p2r=p2i=p3r=p3i=0;
    let zr_n = 1, zi_n = 0;
    for (let n = 0; n <= 17; n++) {
      p1r += zr_n/f[n+1]; p1i += zi_n/f[n+1];
      p2r += zr_n/f[n+2]; p2i += zi_n/f[n+2];
      p3r += zr_n/f[n+3]; p3i += zi_n/f[n+3];
      const nr = zr_n*zr - zi_n*zi, nii = zr_n*zi + zi_n*zr;
      zr_n = nr; zi_n = nii;
    }
  } else {
    const ex = Math.exp(zr);
    const er = ex*Math.cos(zi), ei = ex*Math.sin(zi);
    const d = zr*zr + zi*zi;
    let ar = er - 1, ai = ei;
    p1r = (ar*zr + ai*zi)/d; p1i = (ai*zr - ar*zi)/d;
    ar = p1r - 1; ai = p1i;
    p2r = (ar*zr + ai*zi)/d; p2i = (ai*zr - ar*zi)/d;
    ar = p2r - 0.5; ai = p2i;
    p3r = (ar*zr + ai*zi)/d; p3i = (ai*zr - ar*zi)/d;
  }
  return [p1r,p1i,p2r,p2i,p3r,p3i];
}

/* ================= решатель ================= */
const F = n => new Float64Array(n);

class Sim {
  constructor() {
    this.N = 512; this.L = 40; this.dt = 0.004; this.t = 0;
    this.model = null; this.M = 0;
    this.smooth = 0;                 // 0 — выкл; >0 — сила гашения осцилляций
    this.smoothA = 16; this.smoothM = 4;   // подобраны численно, см. CLAUDE.md
    this.loss = 0;                   // доля энергии, снятая фильтром за последний шаг
    this._grid();
  }

  _grid() {
    const N = this.N;
    this.fft = new FFT(N);
    this.x = F(N);
    for (let j = 0; j < N; j++) this.x[j] = -this.L/2 + j*this.L/N;
    this.k = F(N);
    this.mask = F(N);
    for (let j = 0; j < N; j++) {
      const n = j <= N/2 ? j : j - N;
      this.k[j] = 2*Math.PI*n/this.L;
      this.mask[j] = Math.abs(n) < N/3 ? 1 : 0;
    }
    this.k[N/2] = 0;
    this.kmax = 2*Math.PI*Math.floor(N/3)/this.L;
    this.eta = F(N); this.hyp = F(N); this._hypM = 0;
    for (let j = 0; j < N; j++) this.eta[j] = Math.min(1, Math.abs(this.k[j])/this.kmax);
    this.tr = F(N); this.ti = F(N);
  }

  /** выделить память под M компонент */
  _alloc(M) {
    const N = this.N;
    this.M = M;
    const mk = () => { const a = []; for (let c = 0; c < M; c++) a.push(F(N)); return a; };
    this.vr = mk(); this.vi = mk();
    this.ar = mk(); this.ai = mk(); this.br = mk(); this.bi = mk(); this.cr = mk(); this.ci_ = mk();
    this.Nvr = mk(); this.Nvi = mk(); this.Nar = mk(); this.Nai = mk();
    this.Nbr = mk(); this.Nbi = mk(); this.Ncr = mk(); this.Nci = mk();
    this.U = mk(); this.Ui = mk(); this.OUT = mk(); this.OUTi = mk();
    this.Er = mk(); this.Ei = mk(); this.E2r = mk(); this.E2i = mk();
    this.Qr = mk(); this.Qi = mk();
    this.f1r = mk(); this.f1i = mk(); this.f2r = mk(); this.f2i = mk();
    this.f3r = mk(); this.f3i = mk(); this.Sr = mk(); this.Si = mk();
  }

  resize(N, L) {
    this.N = N; this.L = L;
    this._grid();
    if (this.model) this.setSystem(this.model.source, this.model.params);
  }

  setSystem(text, params) {
    const m = buildSystem(text, params);
    const N = this.N;
    const old = this.model ? this.U : null, oldComps = this.model ? this.model.comps : null;
    this.model = m;
    this._alloc(m.comps.length);

    // диагональные символы: c·(ik)^n, коэффициент c комплексный (у `i*uxx` он i)
    for (const c of m.comps) {
      const Sr = this.Sr[c.ci], Si = this.Si[c.ci];
      for (const l of c.linear)
        for (let j = 0; j < N; j++) {
          let pr = 1, pi = 0;
          for (let q = 0; q < l.n; q++) { const nr = -pi*this.k[j], ni = pr*this.k[j]; pr = nr; pi = ni; }
          Sr[j] += l.c.re*pr - l.c.im*pi; Si[j] += l.c.re*pi + l.c.im*pr;
        }
    }
    // (ik)^n для нужных производных
    this.ikp = [];
    for (const c of m.comps) {
      this.ikp[c.ci] = [];
      for (const n of c.orders) {
        const pr = F(N), pi = F(N);
        for (let j = 0; j < N; j++) {
          let ar = 1, ai = 0;
          for (let q = 0; q < n; q++) { const nr = -ai*this.k[j], ni = ar*this.k[j]; ar = nr; ai = ni; }
          pr[j] = ar; pi[j] = ai;
        }
        this.ikp[c.ci][n] = { re:pr, im:pi };
      }
    }
    // физические поля производных. `Di` заводится и для вещественных компонент,
    // но там остаётся нулём навсегда: у вещественного поля мнимая часть и есть
    // нуль, и код, который по ошибке в неё заглянет, прочитает правду, а не мусор
    this.D = m.comps.map(c => { const a = []; for (const n of c.orders) a[n] = F(N); return a; });
    this.Di = m.comps.map(c => { const a = []; for (const n of c.orders) a[n] = F(N); return a; });

    // перенос состояния со старой системы (совпадающие по имени компоненты)
    if (old) {
      for (const c of m.comps) {
        const j = oldComps.findIndex(o => o.name === c.name);
        if (j >= 0 && old[j].length === N) this.setU(c.ci, old[j]);
      }
    }
    this._rho();
    this.setDt(this.dt);
    return m;
  }

  /** спектральный радиус явной линейной части (степенной метод по каждому k) */
  _rho() {
    const m = this.model, M = this.M, N = this.N;
    this.rho = 0;
    if (!m.cross.length) return;
    const wr = new Float64Array(M), wi = new Float64Array(M);
    const yr = new Float64Array(M), yi = new Float64Array(M);
    const er = new Float64Array(m.cross.length), ei = new Float64Array(m.cross.length);
    const IT = 12;
    for (let j = 0; j < N; j++) {
      if (!this.mask[j]) continue;
      m.cross.forEach((e, q0) => {                       // c·(ik)^n
        let pr = 1, pi = 0;
        for (let q = 0; q < e.n; q++) { const nr = -pi*this.k[j], ni = pr*this.k[j]; pr = nr; pi = ni; }
        er[q0] = e.c.re*pr - e.c.im*pi; ei[q0] = e.c.re*pi + e.c.im*pr;
      });
      for (let c = 0; c < M; c++) { wr[c] = 1/(c+1); wi[c] = 0; }
      let g = 1, steps = 0;
      for (let it = 0; it < IT; it++) {
        yr.fill(0); yi.fill(0);
        m.cross.forEach((e, q0) => {
          yr[e.row] += er[q0]*wr[e.col] - ei[q0]*wi[e.col];
          yi[e.row] += er[q0]*wi[e.col] + ei[q0]*wr[e.col];
        });
        let nw = 0, ny = 0;
        for (let c = 0; c < M; c++) { nw += wr[c]*wr[c] + wi[c]*wi[c]; ny += yr[c]*yr[c] + yi[c]*yi[c]; }
        nw = Math.sqrt(nw); ny = Math.sqrt(ny);
        if (ny < 1e-300 || !isFinite(ny)) break;
        g *= ny/nw; steps++;
        for (let c = 0; c < M; c++) { wr[c] = yr[c]/ny; wi[c] = yi[c]/ny; }
      }
      if (steps) {
        const r = Math.pow(g, 1/steps);
        if (r > this.rho) this.rho = r;
      }
    }
  }

  setDt(dt) {
    this.dt = dt;
    const N = this.N;
    for (let c = 0; c < this.M; c++) {
      const Sr = this.Sr[c], Si = this.Si[c];
      for (let j = 0; j < N; j++) {
        const zr = dt*Sr[j], zi = dt*Si[j];
        const ex = Math.exp(zr), ex2 = Math.exp(zr/2);
        this.Er[c][j] = ex*Math.cos(zi);      this.Ei[c][j] = ex*Math.sin(zi);
        this.E2r[c][j] = ex2*Math.cos(zi/2);  this.E2i[c][j] = ex2*Math.sin(zi/2);
        const h = phis(zr/2, zi/2);
        this.Qr[c][j] = dt*0.5*h[0]; this.Qi[c][j] = dt*0.5*h[1];
        const p = phis(zr, zi);
        this.f1r[c][j] = dt*(p[0] - 3*p[2] + 4*p[4]); this.f1i[c][j] = dt*(p[1] - 3*p[3] + 4*p[5]);
        this.f2r[c][j] = dt*(p[2] - 2*p[4]);          this.f2i[c][j] = dt*(p[3] - 2*p[5]);
        this.f3r[c][j] = dt*(4*p[4] - p[2]);          this.f3i[c][j] = dt*(4*p[5] - p[3]);
      }
    }
  }

  /** мнимая часть начальных данных необязательна: у вещественного поля её нет */
  setU(c, arr, arrIm) {
    const N = this.N;
    this.vr[c].set(arr);
    if (arrIm) this.vi[c].set(arrIm); else this.vi[c].fill(0);
    this.fft.forward(this.vr[c], this.vi[c]);
    for (let j = 0; j < N; j++) { this.vr[c][j] *= this.mask[j]; this.vi[c][j] *= this.mask[j]; }
    this._sync(c);
  }
  /** Мнимую часть физического поля храним только у комплексных компонент.
      У вещественных она равна нулю математически, а численно там болтается
      мусор ~1e-17, и выбросить его — это проекция на инвариантное подпространство,
      а не потеря: ровно так решатель вёл себя до появления `i`, и все эталоны
      точности (КдФ 6e-9, ∫u dx на 1e-15) остаются те же бит в бит. */
  _sync(c) {
    this.tr.set(this.vr[c]); this.ti.set(this.vi[c]);
    this.fft.inverse(this.tr, this.ti);
    this.U[c].set(this.tr);
    if (this.model.comps[c].complex) this.Ui[c].set(this.ti); else this.Ui[c].fill(0);
  }
  getU(c) { return this.U[c || 0]; }
  getUi(c) { return this.Ui[c || 0]; }
  isComplex(c) { return !!this.model.comps[c || 0].complex; }

  _explicit(vr, vi, outR, outI, T) {
    const N = this.N, m = this.model;
    if (!m.nonlin) { for (let c = 0; c < this.M; c++) { outR[c].fill(0); outI[c].fill(0); } return; }
    for (const c of m.comps) {
      for (const n of c.orders) {
        const p = this.ikp[c.ci][n], ar = this.tr, ai = this.ti;
        const s = vr[c.ci], q = vi[c.ci];
        for (let j = 0; j < N; j++) {
          ar[j] = s[j]*p.re[j] - q[j]*p.im[j];
          ai[j] = s[j]*p.im[j] + q[j]*p.re[j];
        }
        this.fft.inverse(ar, ai);
        this.D[c.ci][n].set(ar);
        // у вещественной компоненты в `ai` болтается мусор ~1e-17; не переносить
        // его — та же проекция на инвариантное подпространство, что и в `_sync`
        if (c.complex) this.Di[c.ci][n].set(ai);
      }
    }
    m.nonlin(CFN, CT, this.D, this.Di, this.x, T, m.params, this.OUT, this.OUTi, N);
    for (const c of m.comps) {
      if (!c.hasExplicit) { outR[c.ci].fill(0); outI[c.ci].fill(0); continue; }
      outR[c.ci].set(this.OUT[c.ci]);
      if (c.complex) outI[c.ci].set(this.OUTi[c.ci]); else outI[c.ci].fill(0);
      this.fft.forward(outR[c.ci], outI[c.ci]);
      for (let j = 0; j < N; j++) { outR[c.ci][j] *= this.mask[j]; outI[c.ci][j] *= this.mask[j]; }
    }
  }

  step() {
    const N = this.N, dt = this.dt, t = this.t, M = this.M;
    this._explicit(this.vr, this.vi, this.Nvr, this.Nvi, t);
    for (let c = 0; c < M; c++)
      for (let j = 0; j < N; j++) {
        const er = this.E2r[c][j], ei = this.E2i[c][j], qr = this.Qr[c][j], qi = this.Qi[c][j];
        const vr = this.vr[c][j], vi = this.vi[c][j], nr = this.Nvr[c][j], ni = this.Nvi[c][j];
        this.ar[c][j] = er*vr - ei*vi + qr*nr - qi*ni;
        this.ai[c][j] = er*vi + ei*vr + qr*ni + qi*nr;
      }
    this._explicit(this.ar, this.ai, this.Nar, this.Nai, t + dt/2);
    for (let c = 0; c < M; c++)
      for (let j = 0; j < N; j++) {
        const er = this.E2r[c][j], ei = this.E2i[c][j], qr = this.Qr[c][j], qi = this.Qi[c][j];
        const vr = this.vr[c][j], vi = this.vi[c][j], nr = this.Nar[c][j], ni = this.Nai[c][j];
        this.br[c][j] = er*vr - ei*vi + qr*nr - qi*ni;
        this.bi[c][j] = er*vi + ei*vr + qr*ni + qi*nr;
      }
    this._explicit(this.br, this.bi, this.Nbr, this.Nbi, t + dt/2);
    for (let c = 0; c < M; c++)
      for (let j = 0; j < N; j++) {
        const er = this.E2r[c][j], ei = this.E2i[c][j], qr = this.Qr[c][j], qi = this.Qi[c][j];
        const ar = this.ar[c][j], ai = this.ai[c][j];
        const nr = 2*this.Nbr[c][j] - this.Nvr[c][j], ni = 2*this.Nbi[c][j] - this.Nvi[c][j];
        this.cr[c][j] = er*ar - ei*ai + qr*nr - qi*ni;
        this.ci_[c][j] = er*ai + ei*ar + qr*ni + qi*nr;
      }
    this._explicit(this.cr, this.ci_, this.Ncr, this.Nci, t + dt);
    for (let c = 0; c < M; c++) {
      for (let j = 0; j < N; j++) {
        const er = this.Er[c][j], ei = this.Ei[c][j];
        const vr = this.vr[c][j], vi = this.vi[c][j];
        const abr = this.Nar[c][j] + this.Nbr[c][j], abi = this.Nai[c][j] + this.Nbi[c][j];
        this.vr[c][j] = er*vr - ei*vi
          + this.f1r[c][j]*this.Nvr[c][j] - this.f1i[c][j]*this.Nvi[c][j]
          + 2*(this.f2r[c][j]*abr - this.f2i[c][j]*abi)
          + this.f3r[c][j]*this.Ncr[c][j] - this.f3i[c][j]*this.Nci[c][j];
        this.vi[c][j] = er*vi + ei*vr
          + this.f1r[c][j]*this.Nvi[c][j] + this.f1i[c][j]*this.Nvr[c][j]
          + 2*(this.f2r[c][j]*abi + this.f2i[c][j]*abr)
          + this.f3r[c][j]*this.Nci[c][j] + this.f3i[c][j]*this.Ncr[c][j];
      }
    }
    if (this.smooth > 0) this._damp();
    for (let c = 0; c < M; c++) this._sync(c);
    this.t += dt;
  }

  /** гашение осцилляций опрокидывания: гипервязкость в верхушке спектра.
      û *= exp(-dt·γ·η^{2m}),  η = |k|/kmax,  γ = A·max|u|/dx — скорость обхода
      ячейки. Шкала по dx и по амплитуде, поэтому от dt и от N результат не
      зависит, а разрешённое решение (у которого верхушка спектра пуста) остаётся
      на месте: k=0 не трогается вовсе, поэтому ∫u dx сохраняется точно.
      Сколько энергии снято — видно в `loss`: гашение не бесплатно и не должно
      быть незаметным. */
  _damp() {
    const N = this.N, dx = this.L/N;
    if (this._hypM !== this.smoothM) {
      this._hypM = this.smoothM;
      for (let j = 0; j < N; j++) this.hyp[j] = Math.pow(this.eta[j], 2*this.smoothM);
    }
    let U = 0;
    for (let c = 0; c < this.M; c++) {
      const u = this.U[c], w = this.Ui[c];             // амплитуда по модулю: у комплексного поля мнимая часть такая же полноправная
      for (let j = 0; j < N; j++) { const a = Math.hypot(u[j], w[j]); if (!(a <= U)) U = a; }
    }
    this.loss = 0;
    if (!(U > 0)) return;                       // пусто или уже NaN — гасить нечего
    const g = this.dt * this.smooth * this.smoothA * U / dx;
    let tot = 0, cut = 0;
    for (let j = 0; j < N; j++) {
      let e = 0;
      for (let c = 0; c < this.M; c++) e += this.vr[c][j]*this.vr[c][j] + this.vi[c][j]*this.vi[c][j];
      tot += e;
      const a = g*this.hyp[j];
      if (a < 1e-13) continue;
      const f = Math.exp(-a);
      cut += e*(1 - f*f);
      for (let c = 0; c < this.M; c++) { this.vr[c][j] *= f; this.vi[c][j] *= f; }
    }
    if (tot > 0) this.loss = cut/tot;
  }

  advance(n) { for (let i = 0; i < n; i++) this.step(); }

  diagnostics() {
    const N = this.N, dx = this.L/N, per = [];
    let gmax = 0, bad = false;
    for (let c = 0; c < this.M; c++) {
      const u = this.U[c], w = this.Ui[c], cx = this.model.comps[c].complex;
      let mx = 0, mass = 0, e2 = 0;
      for (let j = 0; j < N; j++) {
        // у комплексной компоненты «величина» — это модуль; у вещественной
        // hypot(u,0) = |u|, поэтому ветка одна и прежние числа не меняются
        const a = cx ? Math.hypot(u[j], w[j]) : Math.abs(u[j]);
        if (!(a <= mx)) mx = a;            // NaN протаскивается: NaN>mx дало бы false
        mass += u[j]; e2 += a*a;
      }
      // norm = ∫|u|² dx. У Шрёдингера это сохраняющаяся норма — лучший индикатор
      // того, что счёт идёт правильно, поэтому её видно в легенде
      per.push({ max:mx, mass:mass*dx, energy:0.5*e2*dx, norm:e2*dx, complex:!!cx });
      // сравнения с NaN всегда ложны, поэтому здоровая компонента не должна
      // затирать разошедшуюся — держим отдельный флаг
      if (!(mx < Infinity)) bad = true;
      else if (mx > gmax) gmax = mx;
    }
    // насколько решение меняется за один шаг: dt·max|правая часть| / масштаб решения.
    // Универсальнее числа Куранта — оно осмысленно только для адвекции.
    let rhs = 0;
    if (this.model && this.model.nonlin)
      for (const c of this.model.comps) {
        if (!c.hasExplicit) continue;
        const o = this.OUT[c.ci], w = c.complex ? this.OUTi[c.ci] : null;
        for (let j = 0; j < N; j++) {
          const a = w ? Math.hypot(o[j], w[j]) : Math.abs(o[j]);
          if (!(a <= rhs)) rhs = a;
        }
      }
    return { t:this.t, per, max:bad ? NaN : gmax,
             perStep: bad ? NaN : this.dt*rhs/Math.max(gmax, 1e-9),
             cfl:(bad ? NaN : gmax)*this.dt/dx,
             // доля энергии, которую гашение снимает за единицу времени
             loss: this.smooth > 0 && this.dt > 0 ? this.loss/this.dt : 0,
             finite:!bad && gmax < 1e8 };
  }

  /** Предупреждение о некорректности задачи: рост символа должен УСИЛИВАТЬСЯ с k
      (обратная диффузия). Равномерный рост на всех k — это обычная реакция
      (например +u у Фишера или FitzHugh–Nagumo), задача корректна. */
  stabilityWarning() {
    let out = null;
    for (const c of this.model.comps) {
      let hi = -Infinity, lo = -Infinity;
      for (let j = 0; j < this.N; j++) {
        if (!this.mask[j]) continue;
        const v = this.Sr[c.ci][j];
        if (Math.abs(this.k[j]) > this.kmax/2) { if (v > hi) hi = v; }
        else if (v > lo) lo = v;
      }
      if (hi > 1e-9 && hi > lo + 1e-9 && (!out || hi > out.growth))
        out = { growth:hi, comp:c.name };
    }
    return out;
  }

  /** ограничение шага явной части (RK4-подобное) */
  dtLimit() {
    return this.rho > 0 ? 2.2/this.rho : Infinity;
  }
}

global.DifurCore = { FFT, Sim, buildSystem, parseOne, tokenize, scanFields, splitAtoms, phis };

})(typeof window !== 'undefined' ? window : this);
