/* ================= φ-функции (комплексные) =================
   Ряд при |z|<1 и рекуррентно через exp при |z|≥1 — не через контурный интеграл:
   символ бывает комплексным (i·k³ у КдФ), и усреднение по окружности с взятием
   вещественной части там неверно. */
export function phis(zr: number, zi: number): number[] {
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
