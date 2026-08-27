/* ================= сборка системы ================= */
import { CX, cxAbs, cxAdd, cxDiv, cxMul } from './complex';
import { errAt, scanFields, span } from './lexer';
import { flatten, contains, parseOne, walk } from './parser';
import { asLinear, coefOfAtom } from './fold';
import { makeGen } from './codegen';
import type { Comp, Cross, DNode, Eq, Model, Node, NonlinFn, PosError } from './types';

/** уравнения системы вместе со смещением в исходном тексте (нужно для подсветки) */
export function splitEqs(text: string): { src: string; at: number }[] {
  const out: { src: string; at: number }[] = [];
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

export function buildSystem(text: string, params?: Record<string, number>): Model {
  const P = params || {};
  const warns: string[] = [];
  const warn = (m: string) => { if (warns.indexOf(m) < 0) warns.push(m); };

  const fields = scanFields(text);
  if (!fields.length)
    throw new Error('Нет ни одной производной по времени (ut, vt, …) — нечего эволюционировать');

  const eqs: Eq[] = [];
  for (const L of splitEqs(text)) {
    let eq: Eq;
    try { eq = parseOne(L.src, fields, warn) as Eq; }
    catch (e) {
      const pe = e as PosError;
      if (pe.pos !== undefined) pe.pos += L.at;          // позиция внутри строки -> внутри текста
      throw span(pe, L.at, L.src.length);
    }
    eq.at = L.at; eq.len = L.src.length;
    eqs.push(eq);
  }

  /* Параметры (всё, что не поле и не служебное имя) — ДО разбора на диагональ и
     явную часть. Пока имени нет в `P`, `tryConst` на нём падает, и `k*uxx`
     уезжает в явную часть вместо точной экспоненты: разница видна на первом же
     построении модели с новым параметром, пока ползунок его не переставил. */
  const pars: string[] = [];
  for (const eq of eqs) walk(eq.ast, n => {
    if (n.k === 'par' && pars.indexOf(n.name) < 0) pars.push(n.name);
  });
  for (const nm of pars) if (!(nm in P)) P[nm] = 1;

  // порядок каждого поля по времени
  const order: Record<string, number> = {};
  fields.forEach(f => order[f] = 1);
  for (const eq of eqs) walk(eq.ast, n => {
    if (n.k === 'd' && n.dt > order[n.f]) order[n.f] = n.dt;
  });

  // какое уравнение какое поле определяет
  const isTopAtom = (n: Node) => n.k === 'd' && n.dt > 0 && n.dt === order[n.f];
  const owner: Record<string, Eq> = {};
  for (const eq of eqs) {
    let f: string | null = null;
    const l = eq.lhs;
    if (l.k === 'd' && l.dx === 0 && l.dt === order[l.f]) f = l.f;
    if (!f) {
      const cand: string[] = [];
      walk(eq.ast, n => { if (isTopAtom(n) && cand.indexOf((n as DNode).f) < 0) cand.push((n as DNode).f); });
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
  const comps: Comp[] = [];
  const index: Record<string, number> = {};
  for (const f of fields)
    for (let d = 0; d < order[f]; d++) {
      index[f + ':' + d] = comps.length;
      comps.push({ f, d, name: f + (d ? 't'.repeat(d) : ''), ci: comps.length,
                   terms: [], linear: [], explicit: [], orders: [],
                   hasExplicit: false, complex: false });
    }
  const ci = (n: DNode) => {
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

    const terms: { node: Node; sign: number }[] = [];
    flatten(eq.ast, 1, terms);
    const isT = (n: Node) => n.k === 'd' && n.f === f && n.dt === m && n.dx === 0;
    let a = CX(0);
    const rest: { node: Node; sign: number }[] = [];
    for (const it of terms) {
      if (!contains(it.node, isT)) { rest.push(it); continue; }
      try { a = cxAdd(a, cxMul(CX(it.sign), coefOfAtom(it.node, isT, P))); }
      catch (e) { throw span(e as Error, eq.at, eq.len); }
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
  const cross: Cross[] = [];  // {row, col, c, n} — явные линейные связи (для оценки шага)
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
  const need = comps.map(() => new Set<number>());
  for (const c of comps)
    for (const it of c.explicit)
      walk(it.node, n => { if (n.k === 'd') { const j = ci(n); if (j >= 0) need[j].add(n.dx); } });
  comps.forEach((c, i) => c.orders = [...need[i]].sort((p, q) => p - q));

  // код
  let fn: NonlinFn | null = null, usesTime = false;
  if (anyExplicit) {
    const r = G.build();
    usesTime = r.usesTime;
    // C и CT — комплексные функции и их выходная ячейка; у вещественной задачи
    // они просто не упоминаются в теле, и текст функции остаётся прежним
    fn = new Function('C','CT','D','Di','X','T','P','O','Oi','N', r.body) as unknown as NonlinFn;
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
