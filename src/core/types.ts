/* Общий словарь типов ядра. Формы данных здесь — это фактический контракт
   между разбором, кодогенерацией, решателем и интерфейсом (превью формулы и
   раскраска ввода ходят по тем же AST-узлам). */
import type { Cx } from './complex';

/** узел AST; `d` — атом «производная поля» (dt=dx=0 — само поле) */
export type Node =
  | { k: 'num'; v: number }
  | { k: 'x' }
  | { k: 'time' }
  | { k: 'imag' }
  | { k: 'par'; name: string }
  | { k: 'd'; f: string; dt: number; dx: number }
  | { k: 'add'; a: Node; b: Node }
  | { k: 'sub'; a: Node; b: Node }
  | { k: 'mul'; a: Node; b: Node }
  | { k: 'div'; a: Node; b: Node }
  | { k: 'pow'; a: Node; b: Node }
  | { k: 'neg'; a: Node }
  | { k: 'fn'; name: string; a: Node };

export type DNode = Extract<Node, { k: 'd' }>;

/** у каждого токена есть i…j — где он стоит в исходной строке */
export interface Tok { t: string; v?: number | string; i: number; j: number }

/** ошибка с координатами куска текста, на который она указывает (для подсветки) */
export interface PosError extends Error { pos?: number; len?: number }

/** разобранное уравнение; at/len — смещение и длина строки в тексте системы */
export interface Eq {
  src: string;
  lhs: Node;
  rhs: Node | null;
  ast: Node;
  at: number;
  len: number;
}
export type ParsedEq = Omit<Eq, 'at' | 'len'>;

/** член явной части: coef·node */
export interface Term { node: Node; coef: Cx; at: number; len: number }

/** компонента состояния (поле или его производная по времени) */
export interface Comp {
  f: string;
  d: number;
  name: string;
  ci: number;
  terms: Term[];
  linear: { c: Cx; n: number }[];
  explicit: Term[];
  orders: number[];
  hasExplicit: boolean;
  complex: boolean;
}

/** явная линейная связь между компонентами (для оценки шага) */
export interface Cross { row: number; col: number; c: Cx; n: number }

/** сгенерированная явная часть: один цикл по сетке на всю систему */
export type NonlinFn = (
  C: Record<string, (...args: number[]) => void>,
  CT: Float64Array,
  D: Float64Array[][], Di: Float64Array[][],
  X: Float64Array, T: number,
  P: Record<string, number>,
  O: Float64Array[], Oi: Float64Array[],
  N: number,
) => void;

export interface Model {
  source: string;
  fields: string[];
  order: Record<string, number>;
  comps: Comp[];
  index: Record<string, number>;
  ci: (n: DNode) => number;
  cross: Cross[];
  nonlin: NonlinFn | null;
  params: Record<string, number>;
  paramNames: string[];
  warnings: string[];
  maxOrder: number;
  usesTime: boolean;
  complex: boolean;
}
