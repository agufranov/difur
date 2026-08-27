/* ================= лексика ================= */
import type { DNode, PosError, Tok } from './types';

export const FUNCS: Record<string, 1> = { sin:1, cos:1, tan:1, exp:1, log:1, sqrt:1, abs:1,
                tanh:1, sinh:1, cosh:1, sech:1, sign:1,
                /* работа с комплексным полем: |ψ|, ψ*, Re, Im, фаза */
                conj:1, re:1, im:1, arg:1 };
/** Функции, чей результат вещественный при любом аргументе. На них держится вся
    типизация: `vt = abs(u)` при комплексном u даёт вещественное v, и только
    поэтому «комплексность» не расползается по системе от одного поля ко всем. */
export const REALFN: Record<string, 1> = { abs:1, re:1, im:1, arg:1 };
export const RESERVED: Record<string, 1> = { x:1, t:1, e:1, pi:1, i:1 };

/** ошибка с координатами куска текста, на который она указывает (для подсветки) */
export function span(e: PosError, pos?: number, len?: number): PosError {
  if (e.pos === undefined && pos !== undefined) { e.pos = pos; e.len = Math.max(1, len || 1); }
  return e;
}
export function errAt(msg: string, pos?: number, len?: number): PosError {
  return span(new Error(msg), pos, len);
}

/** у каждого токена есть i…j — где он стоит в исходной строке */
export function tokenize(src: string): Tok[] {
  const toks: Tok[] = []; let i = 0;
  const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';
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
export function splitAtoms(name: string, fields: string[]): DNode[] | null {
  const out: DNode[] = [];
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
export function scanFields(text: string): string[] {
  const set: string[] = [];
  for (const tk of tokenize(text)) {
    if (tk.t !== 'id') continue;
    const m = /^([A-Za-z])(t+)$/.exec(tk.v as string);
    if (!m) continue;
    if (RESERVED[m[1]]) throw errAt('Поле не может называться «' + m[1] + '»', tk.i, tk.j - tk.i);
    if (set.indexOf(m[1]) < 0) set.push(m[1]);
  }
  return set;
}
