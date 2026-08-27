/* ================= комплексные числа =================
   Нужны ровно в одном месте — в свёртке констант, чтобы `i` дожила от текста
   уравнения до коэффициента диагонального символа. Ни состояние, ни кодогенерация
   этих объектов не видят: состояние и так лежит парой массивов re/im, а в явную
   часть комплексный коэффициент попасть не может (проверяется в buildSystem). */
export interface Cx { re: number; im: number }

export const CX = (re: number, im?: number): Cx => ({ re, im: im || 0 });
export const cxAdd = (a: Cx, b: Cx) => CX(a.re + b.re, a.im + b.im);
export const cxSub = (a: Cx, b: Cx) => CX(a.re - b.re, a.im - b.im);
export const cxNeg = (a: Cx) => CX(-a.re, -a.im);
export const cxMul = (a: Cx, b: Cx) => CX(a.re*b.re - a.im*b.im, a.re*b.im + a.im*b.re);
export const cxDiv = (a: Cx, b: Cx) => {
  const d = b.re*b.re + b.im*b.im;
  return CX((a.re*b.re + a.im*b.im)/d, (a.im*b.re - a.re*b.im)/d);
};
export const cxAbs = (a: Cx) => Math.hypot(a.re, a.im);
export const isReal = (a: Cx) => a.im === 0;
/** целая степень — точно, повторным умножением: `i^2` обязана дать ровно -1,
    а через exp/log вышло бы -1 + 1.2e-16i, и поле стало бы «комплексным» */
export function cxPow(a: Cx, b: Cx): Cx {
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
export const CT = new Float64Array(2);
export const CFN = {
  exp(ar: number, ai: number) { const m = Math.exp(ar); CT[0] = m*Math.cos(ai); CT[1] = m*Math.sin(ai); },
  log(ar: number, ai: number) { CT[0] = Math.log(Math.hypot(ar, ai)); CT[1] = Math.atan2(ai, ar); },
  sqrt(ar: number, ai: number) { const m = Math.sqrt(Math.hypot(ar, ai)), a = Math.atan2(ai, ar)/2;
                 CT[0] = m*Math.cos(a); CT[1] = m*Math.sin(a); },
  sin(ar: number, ai: number)  { CT[0] = Math.sin(ar)*Math.cosh(ai);  CT[1] = Math.cos(ar)*Math.sinh(ai); },
  cos(ar: number, ai: number)  { CT[0] = Math.cos(ar)*Math.cosh(ai);  CT[1] = -Math.sin(ar)*Math.sinh(ai); },
  sinh(ar: number, ai: number) { CT[0] = Math.sinh(ar)*Math.cos(ai);  CT[1] = Math.cosh(ar)*Math.sin(ai); },
  cosh(ar: number, ai: number) { CT[0] = Math.cosh(ar)*Math.cos(ai);  CT[1] = Math.sinh(ar)*Math.sin(ai); },
  sign(ar: number, ai: number) { const m = Math.hypot(ar, ai);        // z/|z| — направление на плоскости
                 CT[0] = m > 0 ? ar/m : 0; CT[1] = m > 0 ? ai/m : 0; },
  /** z^b с вещественным b — через полярную форму. Целые степени сюда не доходят:
      кодогенерация разворачивает их в умножения, чтобы `u^2` было ровно `u*u` */
  pow(ar: number, ai: number, b: number) { const m = Math.pow(Math.hypot(ar, ai), b), a = Math.atan2(ai, ar)*b;
                   CT[0] = m*Math.cos(a); CT[1] = m*Math.sin(a); },
  tan(ar: number, ai: number)  { const sr = Math.sin(ar)*Math.cosh(ai), si = Math.cos(ar)*Math.sinh(ai);
                 const cr = Math.cos(ar)*Math.cosh(ai), cq = -Math.sin(ar)*Math.sinh(ai);
                 const d = cr*cr + cq*cq;
                 CT[0] = (sr*cr + si*cq)/d; CT[1] = (si*cr - sr*cq)/d; },
  tanh(ar: number, ai: number) { const sr = Math.sinh(ar)*Math.cos(ai), si = Math.cosh(ar)*Math.sin(ai);
                 const cr = Math.cosh(ar)*Math.cos(ai), cq = Math.sinh(ar)*Math.sin(ai);
                 const d = cr*cr + cq*cq;
                 CT[0] = (sr*cr + si*cq)/d; CT[1] = (si*cr - sr*cq)/d; },
  sech(ar: number, ai: number) { const cr = Math.cosh(ar)*Math.cos(ai), cq = Math.sinh(ar)*Math.sin(ai);
                 const d = cr*cr + cq*cq; CT[0] = cr/d; CT[1] = -cq/d; }
};
