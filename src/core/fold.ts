/* ================= свёртка констант и линейные члены ================= */
import { CX, Cx, cxAbs, cxAdd, cxDiv, cxMul, cxNeg, cxPow, cxSub, isReal } from './complex';
import { contains } from './parser';
import type { DNode, Node } from './types';

/** значение константного выражения — всегда комплексное (у вещественного im === 0) */
export function constVal(node: Node, P: Record<string, number>): Cx {
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
      return CX(node.name === 'sech' ? 1/Math.cosh(v.re)
                                     : (Math as unknown as Record<string, (x: number) => number>)[node.name](v.re)); }
    default: throw new Error('не константа');
  }
}
export function tryConst(node: Node, P: Record<string, number>): Cx | null {
  try { return constVal(node, P); } catch (e) { return null; }
}

/** c · ∂ₓⁿ(компонента) ?  ci(node) отображает атом в номер компоненты.
    Коэффициент `c` комплексный: `i*uxx` — такой же диагональный член, как `2*uxx`. */
export function asLinear(node: Node, P: Record<string, number>,
                         ci: (n: DNode) => number): { c: Cx; ci: number; n: number } | null {
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
export function coefOfAtom(node: Node, isT: (n: Node) => boolean, P: Record<string, number>): Cx {
  const has = (n: Node) => contains(n, isT);
  const cst = (n: Node) => {               // множитель обязан быть константой
    try { return constVal(n, P); }
    catch (e) {
      if (/Неизвестный параметр/.test((e as Error).message)) throw e;
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
