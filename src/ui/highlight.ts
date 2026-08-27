/* ---------- раскраска поля ввода ----------
   Подложка #eqhl держит копию текста, раскрашенную по токенам ядра: поля — цветом
   своей кривой, хвост производной тем же цветом побледнее, константы, функции,
   числа и комментарии — своими. Текст обязан совпадать с текстом поля символ
   в символ, иначе раскраска уедет относительно каретки. */
import { scanFields, splitAtoms, tokenize } from '../core';
import type { PosError, Tok } from '../core';
import { $, $i, clamp, escHTML } from './state';
import { EQCONSTS, EQFUNCS, fieldColor } from './math-preview';

interface Seg { a: number; b: number; cls?: string; color?: string }

function eqSegments(text: string): Seg[] {
  let fields: string[] = [];
  try { fields = scanFields(text); } catch (e) {}
  const segs: Seg[] = [];
  const push = (a: number, b: number, cls?: string, color?: string) => {
    if (b > a) segs.push({ a, b, cls, color });
  };

  const code = (src: string, off: number) => {
    let toks: Tok[];
    /* до места ошибки текст всё равно раскрашивается — человек его как раз правит */
    try { toks = tokenize(src); }
    catch (e) { try { toks = tokenize(src.slice(0, (e as PosError).pos)); } catch (e2) { return; } }
    for (let i = 0; i < toks.length && toks[i].t !== 'end'; i++) {
      const tk = toks[i], v = tk.v as string;
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
export function hlHTML(text: string, e?: PosError | null): string {
  let a = -1, b = -1;
  if (e && e.pos !== undefined) {
    a = clamp(e.pos, 0, text.length);
    b = clamp(a + (e.len || 1), a, text.length);
  }
  const parts: Seg[] = [];
  let pos = 0;
  for (const s of eqSegments(text)) {
    if (s.a > pos) parts.push({ a:pos, b:s.a });
    parts.push(s); pos = s.b;
  }
  if (pos < text.length) parts.push({ a:pos, b:text.length });

  const cuts: { p: Seg; a: number; b: number }[] = [];   // куски рвутся по границам ошибки
  for (const p of parts) {
    let s = p.a;
    for (const q of [a, b]) if (q > s && q < p.b) { cuts.push({ p, a:s, b:q }); s = q; }
    cuts.push({ p, a:s, b:p.b });
  }
  let out = '', open = false;
  const mark = (at: number) => {
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
export function autosizeEq() {
  const el = $i('eq');
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight + 2) + 'px';   // +2 — рамка (box-sizing:border-box)
}
