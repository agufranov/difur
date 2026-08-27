/* ================= разбор одного уравнения ================= */
import { FUNCS, errAt, span, splitAtoms, tokenize } from './lexer';
import type { Node, ParsedEq, Tok } from './types';

export function parseOne(src: string, fields: string[], warn?: ((m: string) => void) | null): ParsedEq {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  /* ошибка указывает на текущий (или заданный) токен */
  const bad = (msg: string, tk?: Tok) => { tk = tk || peek(); return errAt(msg, tk.i, tk.j - tk.i); };
  const eat = (t: string) => { if (toks[p].t !== t) throw bad('Ожидалось «' + t + '»'); return toks[p++]; };

  function expr(): Node {
    let a = term();
    for (;;) {
      const t = peek().t;
      if (t === '+') { p++; a = { k:'add', a, b:term() }; }
      else if (t === '-') { p++; a = { k:'sub', a, b:term() }; }
      else return a;
    }
  }
  function term(): Node {
    let a = unary();
    for (;;) {
      const t = peek().t;
      if (t === '*') { p++; a = { k:'mul', a, b:unary() }; }
      else if (t === '/') { p++; a = { k:'div', a, b:unary() }; }
      else if (t === 'num' || t === 'id' || t === '(') a = { k:'mul', a, b:unary() };
      else return a;
    }
  }
  function unary(): Node {
    if (peek().t === '-') { p++; return { k:'neg', a:unary() }; }
    if (peek().t === '+') { p++; return unary(); }
    return power();
  }
  function power(): Node {
    const base = atom();
    if (peek().t === '^') { p++; return { k:'pow', a:base, b:unary() }; }
    return base;
  }
  function atom(): Node {
    const tk = peek();
    if (tk.t === 'num') { p++; return { k:'num', v:tk.v as number }; }
    if (tk.t === '(') { p++; const e = expr(); eat(')'); return e; }
    if (tk.t === 'id') {
      p++;
      const name = tk.v as string;
      if (FUNCS[name] && peek().t === '(') { p++; const a = expr(); eat(')'); return { k:'fn', name, a }; }
      if (name === 'x') return { k:'x' };
      if (name === 't') return { k:'time' };
      if (name === 'pi') return { k:'num', v:Math.PI };
      if (name === 'e') return { k:'num', v:Math.E };
      if (name === 'i') return { k:'imag' };
      let parts;
      try { parts = splitAtoms(name, fields); }
      catch (e) { throw span(e as Error, tk.i, tk.j - tk.i); }
      if (parts) {
        let node: Node = parts[0];
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
  let rhs: Node | null = null;
  if (peek().t === '=') { p++; rhs = expr(); }
  if (peek().t !== 'end') throw bad('Лишние символы в конце выражения');
  return { src, lhs, rhs, ast: rhs ? { k:'sub', a:lhs, b:rhs } : lhs };
}

/* ================= обходы ================= */
export function walk(node: Node, fn: (n: Node) => void) {
  fn(node);
  const q = node as { a?: Node; b?: Node };
  if (q.a) walk(q.a, fn);
  if (q.b) walk(q.b, fn);
}
export function flatten(node: Node, sign: number, out: { node: Node; sign: number }[]) {
  if (node.k === 'add') { flatten(node.a, sign, out); flatten(node.b, sign, out); }
  else if (node.k === 'sub') { flatten(node.a, sign, out); flatten(node.b, -sign, out); }
  else if (node.k === 'neg') { flatten(node.a, -sign, out); }
  else out.push({ node, sign });
}
export function contains(node: Node, pred: (n: Node) => boolean): boolean {
  let f = false;
  walk(node, n => { if (pred(n)) f = true; });
  return f;
}
