/* ================= генерация кода =================
   Явная часть системы считается одним циклом по сетке: `gen` кодирует
   вещественное выражение, `makeGen` — всё остальное. Граница между ними важнее,
   чем кажется: **вещественное поддерево кодируется ровно тем же текстом, что и
   до появления комплексных полей**, поэтому у вещественных задач сгенерированная
   функция осталась прежней слово в слово, а вместе с ней и эталоны точности. */
import { isReal } from './complex';
import { REALFN, errAt } from './lexer';
import { tryConst } from './fold';
import { walk } from './parser';
import type { Comp, DNode, Node, Term } from './types';

/** вещественный аргумент: conj и re — тождество, im — ноль, arg — 0 или π */
export function realFn(name: string, a: string): string {
  if (name === 'conj' || name === 're') return a;
  if (name === 'im') return '(0)';
  if (name === 'arg') return 'Math.atan2(0,' + a + ')';
  return (name === 'sech' ? 'sech(' : 'Math.' + name + '(') + a + ')';
}

export function gen(node: Node, ci: (n: DNode) => number): string {
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

/** пара строк-выражений; i === null означает «значение вещественно» */
interface Pair { r: string; i: string | null }

/** Кодогенератор явной части, знающий про комплексные значения.
    Возвращает `cxVal` (нужен ещё и для типизации компонент) и `build`. */
export function makeGen(P: Record<string, number>, ci: (n: DNode) => number, comps: Comp[]) {

  /* Комплексно ли ЗНАЧЕНИЕ выражения. Константы сворачиваются первыми, поэтому
     `i*i` — вещественная минус единица, а не «что-то с мнимой частью»: без этого
     `ut = i*i*uxx` объявляло бы поле комплексным, а оно теплопроводность. */
  function cxVal(n: Node): boolean {
    const cv = tryConst(n, P);
    if (cv) return cv.im !== 0;
    switch (n.k) {
      case 'd': { const j = ci(n); return j >= 0 && !!comps[j].complex; }
      case 'fn': return REALFN[n.name] ? false : cxVal(n.a);
      case 'num': case 'x': case 'time': case 'par': return false;
      default: { const q = n as { a?: Node; b?: Node };
        return !!(q.a && cxVal(q.a)) || !!(q.b && cxVal(q.b)); }
    }
  }

  /* «содержит комплексное внутри», а не «комплексно само». Разница — это `abs(u)`:
     значение вещественное, но посчитать его старым кодом нельзя, там вышло бы
     |Re ψ| вместо |ψ|. Ошибка такого сорта самая тихая из возможных — решение
     остаётся конечным и правдоподобным, — поэтому дерево проверяется целиком. */
  const cxIn = (n: Node) => { let f = false; walk(n, q => { if (cxVal(q)) f = true; }); return f; };

  const out: string[] = [];             // операторы тела цикла для текущей компоненты
  let nt = 0, where: Term | null = null;   // where — член, на который указывать ошибкой
  const T = () => 't' + (nt++);
  const atom = (s: string) => /^\(?-?[\w.$"[\]]+\)?$/.test(s);
  /** вещественное выражение, которое подставится дважды: иначе поддеревья
      удваиваются на каждом умножении и на `abs(u)^2*u` код растёт лавиной */
  const hold = (s: string) => { if (atom(s)) return s; const v = T(); out.push('const ' + v + '=' + s + ';'); return v; };
  const pair = (r: string, m: string): Pair => { const a = T(), b = T();
                           out.push('const ' + a + '=' + r + ',' + b + '=' + m + ';');
                           return { r:a, i:b }; };
  const num = (v: number) => '(' + v + ')';

  function mul(a: Pair, b: Pair): Pair {
    if (!a.i && !b.i) return { r:'(' + a.r + '*' + b.r + ')', i:null };
    if (!a.i) { const q = a; a = b; b = q; }               // вещественный множитель — вторым
    if (!b.i) { const q = hold(b.r); return pair('(' + a.r + '*' + q + ')', '(' + a.i + '*' + q + ')'); }
    return pair('(' + a.r + '*' + b.r + '-' + a.i + '*' + b.i + ')',
                '(' + a.r + '*' + b.i + '+' + a.i + '*' + b.r + ')');
  }
  function div(a: Pair, b: Pair): Pair {
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
  function em(node: Node): Pair {
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
                             'должно стоять вещественное число', where!.at, where!.len);
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
    throw errAt('не могу сгенерировать код', where!.at, where!.len);
  }

  /** тело цикла по сетке; usesTime — встретилось ли `t` */
  function build(): { body: string; usesTime: boolean } {
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
