/* Публичное API ядра. Без единого обращения к DOM — инвариант слоя. */
export { FFT } from './fft';
export { Sim } from './sim';
export type { Diagnostics, PerComp } from './sim';
export { buildSystem, splitEqs } from './system';
export { parseOne, walk, flatten, contains } from './parser';
export { tokenize, scanFields, splitAtoms, FUNCS, REALFN, RESERVED, errAt, span } from './lexer';
export { phis } from './phis';
export { CX, cxAbs, cxMul } from './complex';
export type { Cx } from './complex';
export type { Node, DNode, Tok, PosError, Eq, Term, Comp, Cross, Model, NonlinFn } from './types';
