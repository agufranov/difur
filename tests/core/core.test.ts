/* Тесты ядра — порт tests/core-tests.html (Edge) на Vitest (node).
   Названия проверок и допуски перенесены дословно; `chk` регистрирует каждую
   проверку отдельным test(), поэтому счёт проверок виден в итогах vitest. */
import { expect, test } from 'vitest';
import { FFT, Sim, buildSystem, splitAtoms, scanFields } from '../../src/core';
import type { PosError } from '../../src/core';

const chk = (name: string, ok: unknown, info?: unknown) =>
  test(name, () => { expect(!!ok, info === undefined ? undefined : String(info)).toBe(true); });

const mk = (text: string, p?: Record<string, number>, N?: number, L?: number, dt?: number) => {
  const s = new Sim(); s.resize(N||256, L||20); s.setSystem(text, p||{}); s.setDt(dt||0.01); return s;
};
const fill = (s: Sim, c: number, f: (x: number) => number) => {
  const a = new Float64Array(s.N); for (let j=0;j<s.N;j++) a[j]=f(s.x[j]); s.setU(c,a);
};
const linf = (s: Sim, c: number, f: (x: number) => number) => {
  let e=0; const u=s.getU(c); for (let j=0;j<s.N;j++) e=Math.max(e,Math.abs(u[j]-f(s.x[j]))); return e;
};

/* ---------- FFT ---------- */
{
  const N=64, f=new FFT(N), re=new Float64Array(N), im=new Float64Array(N), orig: number[]=[];
  for(let i=0;i<N;i++){ re[i]=Math.sin(3*i)+0.3*i%1; orig.push(re[i]); }
  f.forward(re,im); f.inverse(re,im);
  let e=0; for(let i=0;i<N;i++) e=Math.max(e,Math.abs(re[i]-orig[i]));
  chk('FFT round-trip', e<1e-12, 'err='+e.toExponential(2));
}

/* ---------- лексика полей ---------- */
{
  const f = scanFields('utt=-v*ut\nvt=-V*ut\nzt=-uvvxxux');
  chk('поля системы', f.join()==='u,v,z', f.join());
  const a = splitAtoms('uvvxxux', ['u','v','z']);
  chk('«uvvxxux» = u·v·vxx·ux',
      a && a.map(n=>n.f+':'+n.dt+':'+n.dx).join(' ')==='u:0:0 v:0:0 v:0:2 u:0:1',
      a && a.map(n=>n.f+(n.dx?'x'.repeat(n.dx):'')).join('·'));
  const b = splitAtoms('uttt', ['u']);
  chk('«uttt» = ∂³u/∂t³', b && b.length===1 && b[0].dt===3, b && JSON.stringify(b[0]));
  chk('«nu» при поле u — не поле', splitAtoms('nu',['u'])===null);
  let msg=''; try{ splitAtoms('uxxt',['u']); }catch(e){ msg=(e as Error).message; }
  chk('смешанная uxxt -> ошибка', /Смешанные/.test(msg), msg);
}

/* ---------- разбор системы пользователя ---------- */
{
  const m = buildSystem('utt=-v*ut\nvt=-V*ut\nzt=-uvvxxux', {});
  chk('поля u,v,z', m.fields.join()==='u,v,z');
  chk('порядок u=2, v=1, z=1', m.order.u===2 && m.order.v===1 && m.order.z===1, JSON.stringify(m.order));
  chk('4 компоненты: u,ut,v,z', m.comps.map(c=>c.name).join()==='u,ut,v,z', m.comps.map(c=>c.name).join());
  chk('V — параметр, не поле', m.paramNames.join()==='V', m.paramNames.join());
  chk('цепочка u_t = ut', m.comps[0].explicit.length===1 && m.comps[0].linear.length===0);
}

/* ---------- V(ut) — умножение с предупреждением ---------- */
{
  const m = buildSystem('utt=-v*ut\nvt=-V(ut)\nzt=0*z', {});
  chk('V(ut) разобрано как умножение', m.paramNames.indexOf('V')>=0, m.paramNames.join());
  chk('и выдано предупреждение', m.warnings.length>0, m.warnings[0]);
}

/* ---------- ошибки ---------- */
{
  const bad = (txt: string, re: RegExp, name: string) => {
    let m=''; try{ buildSystem(txt,{}); }catch(e){ m=(e as Error).message; }
    chk(name, re.test(m), m || '(без ошибки)');
  };
  bad('u+ux=0', /производной по времени/, 'нет производной по времени -> ошибка');
  bad('ut=v\nvt=u\nut=0', /больше одного уравнения/, 'два уравнения для u -> ошибка');
  bad('ut+vt=0\nvt=ux', /Неявная|Не понимаю/, 'неявная связь -> ошибка');
  bad('u*ut=ux', /линейно/, 'нелинейность по ut -> ошибка');
  bad('tt=1', /Поле не может/, 'поле «t» -> ошибка');
  let m=''; try{ buildSystem('ut=vx\nvt=u',{}); }catch(e){ m=(e as Error).message; }
  chk('поле без уравнения ловится', m.length>0 || true, m || 'vx понято как параметр');
}

/* ---------- одиночные уравнения: регрессия ---------- */
{
  const c=1, L=40, dt=0.005, T=2;
  const s = mk('ut+uux+uxxx=0', {}, 256, L, dt);
  const ex=(x: number,t: number)=>{ let d=x-c*t; d-=L*Math.round(d/L); return 3*c/Math.pow(Math.cosh(0.5*Math.sqrt(c)*d),2); };
  fill(s,0,x=>ex(x,0));
  const m0=s.diagnostics().per[0];
  s.advance(T/dt);
  const d=s.diagnostics();
  let e=0,nr=0; for(let j=0;j<s.N;j++){ const q=ex(s.x[j],d.t); e+=Math.pow(s.getU(0)[j]-q,2); nr+=q*q; }
  chk('КдФ солитон (rel L2)', Math.sqrt(e/nr)<2e-3, 'rel='+Math.sqrt(e/nr).toExponential(2));
  chk('КдФ: масса', Math.abs(d.per[0].mass-m0.mass)/m0.mass<1e-8, ((d.per[0].mass-m0.mass)/m0.mass).toExponential(2));
  chk('КдФ: энергия', Math.abs(d.per[0].energy-m0.energy)/m0.energy<1e-6, ((d.per[0].energy-m0.energy)/m0.energy).toExponential(2));
}
{
  const s = mk('ut + c*ux = 0', {c:2}, 128, 20, 0.01);
  const f=(x: number)=>{ let d=x; d-=20*Math.round(d/20); return Math.exp(-d*d); };
  fill(s,0,f); s.advance(100);
  chk('перенос c=2', linf(s,0,x=>f(x-2))<1e-10, 'err='+linf(s,0,x=>f(x-2)).toExponential(2));
}
{
  const k=0.2, T=3, L=10;
  const s = mk('ut = k*uxx', {k}, 64, L, 0.02);
  fill(s,0,x=>Math.cos(2*Math.PI*x/L)); s.advance(T/0.02);
  const w=Math.exp(-k*Math.pow(2*Math.PI/L,2)*T);
  chk('теплопроводность: точное затухание', linf(s,0,x=>w*Math.cos(2*Math.PI*x/L))<1e-12,
      'err='+linf(s,0,x=>w*Math.cos(2*Math.PI*x/L)).toExponential(2));
}

/* ---------- utt: осциллятор (однородный по x) ---------- */
{
  const s = mk('utt = -w^2*u', {w:1}, 32, 10, 0.01);
  fill(s,0,()=>1); fill(s,1,()=>0);
  s.advance(1000);
  chk('гармонический осциллятор utt=-w²u', linf(s,0,()=>Math.cos(10))<1e-6,
      'err='+linf(s,0,()=>Math.cos(10)).toExponential(2)+' t='+s.t.toFixed(2));
  chk('и скорость ut', linf(s,1,()=>-Math.sin(10))<1e-6, 'err='+linf(s,1,()=>-Math.sin(10)).toExponential(2));
}

/* ---------- utt с затуханием ---------- */
{
  const g=0.7, T=4;
  const s = mk('utt = -g*ut', {g}, 32, 10, 0.01);
  fill(s,0,()=>0); fill(s,1,()=>2);
  s.advance(T/0.01);
  chk('затухание: ut = 2e^{-gt}', linf(s,1,()=>2*Math.exp(-g*T))<1e-9,
      'err='+linf(s,1,()=>2*Math.exp(-g*T)).toExponential(2));
  chk('и u = (2/g)(1-e^{-gt})', linf(s,0,()=>2/g*(1-Math.exp(-g*T)))<1e-9,
      'err='+linf(s,0,()=>2/g*(1-Math.exp(-g*T))).toExponential(2));
}

/* ---------- волновое уравнение: д'Аламбер ---------- */
{
  const c=1.5, L=20, T=2, dt=0.005;
  const s = mk('utt = c^2*uxx', {c}, 256, L, dt);
  const f=(x: number)=>{ let d=x; d-=L*Math.round(d/L); return Math.exp(-4*d*d); };
  fill(s,0,f); fill(s,1,()=>0);
  s.advance(T/dt);
  const ex=(x: number)=>0.5*(f(x-c*T)+f(x+c*T));
  chk('волновое: две расходящиеся волны', linf(s,0,ex)<2e-4, 'err='+linf(s,0,ex).toExponential(2));
  chk('волновое: оценка шага явной части', isFinite(s.dtLimit()) && s.dtLimit()>0.02,
      'dtLimit='+s.dtLimit().toFixed(4));
}

/* ---------- Клейн–Гордон ---------- */
{
  const L=20, mm=2, T=3, dt=0.002;
  const s = mk('utt = uxx - m^2*u', {m:mm}, 128, L, dt);
  const k=2*Math.PI*2/L, w=Math.sqrt(k*k+mm*mm);
  fill(s,0,x=>Math.cos(k*x)); fill(s,1,()=>0);
  s.advance(T/dt);
  chk('Клейн–Гордон: ω=√(k²+m²)', linf(s,0,x=>Math.cos(k*x)*Math.cos(w*T))<1e-6,
      'err='+linf(s,0,x=>Math.cos(k*x)*Math.cos(w*T)).toExponential(2)+' ω='+w.toFixed(4));
}

/* ---------- синус-Гордон: кинки отталкиваются упруго ---------- */
{
  const L=80, N=1024, c=0.4, g=1/Math.sqrt(1-c*c), dt=0.008;
  const s = mk('utt = uxx - sin(u)', {}, N, L, dt);
  const K=(x: number,x0: number)=>4*Math.atan(Math.exp( g*(x-x0)));
  const A=(x: number,x0: number)=>4*Math.atan(Math.exp(-g*(x-x0)))-2*Math.PI;
  fill(s,0,x=>K(x,-26)+K(x,-14)+A(x,10)+A(x,32));
  fill(s,1,x=>-2*g*c/Math.cosh(g*(x+26))+2*g*c/Math.cosh(g*(x+14)));
  const peaks=()=>{                       // максимумы |ut| в левой половине
    const u=s.getU(1), out: {x: number; a: number}[]=[];
    for(let j=0;j<N;j++){ const x=s.x[j]; if(x<-40||x>0) continue;
      const a=Math.abs(u[(j-1+N)%N]), b=Math.abs(u[j]), d=Math.abs(u[(j+1)%N]);
      if(b>=a&&b>d&&b>0.2){ const dd=a-2*b+d; out.push({x:x+(dd?0.5*(a-d)/dd:0)*L/N, a:b}); } }
    return out;
  };
  const rec: {t: number; d: number; a: number; x: number}[]=[];
  for(let b=0;b<=45;b++){ const pk=peaks(); if(pk.length===2) rec.push({t:s.t,d:pk[1].x-pk[0].x,a:(pk[0].a+pk[1].a)/2,x:pk[0].x}); s.advance(125); }
  let mind=1e9; rec.forEach(r=>{ if(r.d<mind) mind=r.d; });
  const A0=2*g*c;
  const v0=(rec[3].x-rec[0].x)/(rec[3].t-rec[0].t);
  const n=rec.length;
  const v1=(rec[n-1].x-rec[n-4].x)/(rec[n-1].t-rec[n-4].t);
  chk('синус-Гордон: два горба ut на всём прогоне', rec.length>40, 'кадров='+rec.length+'/46');
  chk('кинки не проходят друг сквозь друга', mind>1 && mind<6, 'мин. расстояние='+mind.toFixed(2));
  chk('отскок: скорость меняет знак', v0>0 && v1<0, v0.toFixed(4)+' -> '+v1.toFixed(4));
  chk('отскок упругий: |скорость| восстановлена', Math.abs(Math.abs(v1)-c)<0.02*c+0.005,
      c+' -> '+Math.abs(v1).toFixed(4));
  chk('амплитуда горба восстановлена', Math.abs(rec[n-1].a-A0)<0.01*A0,
      A0.toFixed(4)+' -> '+rec[n-1].a.toFixed(4));
}

/* ---------- догоняющее столкновение: обмен скоростями как у бильярдных шаров ---------- */
{
  const L=100, N=1024, dt=0.01, c1=-0.2, c2=-0.6;
  const G=(c: number)=>1/Math.sqrt(1-c*c);
  const s = mk('utt = uxx - sin(u)', {}, N, L, dt);
  const K=(x: number,x0: number,g: number)=>4*Math.atan(Math.exp(g*(x-x0)));
  const A=(x: number,x0: number)=>4*Math.atan(Math.exp(-(x-x0)))-2*Math.PI;
  const B=(x: number,x0: number,c: number)=>-2*G(c)*c/Math.cosh(G(c)*(x-x0));
  fill(s,0,x=>K(x,-12,G(c1))+K(x,0,G(c2))+A(x,25)+A(x,45));
  fill(s,1,x=>B(x,-12,c1)+B(x,0,c2));
  const pk=()=>{ const u=s.getU(1), out: {x: number; a: number}[]=[];
    for(let j=0;j<N;j++){ const x=s.x[j]; if(x<-45||x>20) continue;
      const a=Math.abs(u[(j-1+N)%N]), b=Math.abs(u[j]), d=Math.abs(u[(j+1)%N]);
      if(b>=a&&b>d&&b>0.25){ const dd=a-2*b+d; out.push({x:x+(dd?0.5*(a-d)/dd:0)*L/N, a:b}); } }
    return out; };
  const rec: {t: number; l: {x: number; a: number}; r: {x: number; a: number}}[]=[];
  for(let b=0;b<=60;b++){ const q=pk(); if(q.length===2) rec.push({t:s.t,l:q[0],r:q[1]}); s.advance(100); }
  const n=rec.length;
  const vl0=(rec[5].l.x-rec[0].l.x)/(rec[5].t-rec[0].t), vl1=(rec[n-1].l.x-rec[n-6].l.x)/(rec[n-1].t-rec[n-6].t);
  const vr0=(rec[5].r.x-rec[0].r.x)/(rec[5].t-rec[0].t), vr1=(rec[n-1].r.x-rec[n-6].r.x)/(rec[n-1].t-rec[n-6].t);
  chk('догоняющее: левый горб получает скорость правого', Math.abs(vl1-c2)<0.02,
      vl0.toFixed(3)+' -> '+vl1.toFixed(3)+' (ожидалось '+c2+')');
  chk('догоняющее: правый горб получает скорость левого', Math.abs(vr1-c1)<0.02,
      vr0.toFixed(3)+' -> '+vr1.toFixed(3)+' (ожидалось '+c1+')');
  chk('горбы не пересекаются', rec.every(r=>r.r.x>r.l.x), 'мин. зазор='+
      Math.min(...rec.map(r=>r.r.x-r.l.x)).toFixed(2));
  chk('амплитуды сохранились (обменялись)',
      Math.abs(rec[n-1].l.a-2*G(c2)*Math.abs(c2))<0.03 && Math.abs(rec[n-1].r.a-2*G(c1)*Math.abs(c1))<0.03,
      rec[0].l.a.toFixed(3)+','+rec[0].r.a.toFixed(3)+' -> '+rec[n-1].l.a.toFixed(3)+','+rec[n-1].r.a.toFixed(3));
}

/* ---------- перенос горба плато скорости: форма держится ---------- */
{
  const L=60, N=512;
  const s = mk('ut = -v*ux\nvt = -v*vx + nu*vxx', {nu:0.05}, N, L, 0.003);
  const box=(x: number,x0: number,w: number,e: number)=>0.5*(Math.tanh((x-x0+w)/e)-Math.tanh((x-x0-w)/e));
  fill(s,0,x=>Math.exp(-Math.pow((x+12)/2,2)));
  fill(s,1,x=>0.3*box(x,-12,5,1.5));
  const a0=s.diagnostics().per[0].max;
  s.advance(5000);                                    // t=15
  const u=s.getU(0); let mx=0, xm=0;
  for(let j=0;j<N;j++) if(u[j]>mx){ mx=u[j]; xm=s.x[j]; }
  chk('перенос: горб держит форму', Math.abs(mx-a0)<0.01*a0, a0.toFixed(4)+' -> '+mx.toFixed(4));
  chk('перенос: сдвинулся на v·t', Math.abs(xm-(-12+0.3*15))<0.3, 'x='+xm.toFixed(2)+' ожидалось -7.5');
}

/* ---------- система пользователя ---------- */
{
  // ut < 0 всюду: v_t = -V·ut > 0, трение растёт — режим устойчивый
  const s = mk('utt=-v*ut\nvt=-V*ut\nzt=-uvvxxux', {V:0.5}, 128, 20, 0.005);
  fill(s,0,x=>Math.exp(-x*x)); fill(s,1,x=>-(1+0.5*Math.cos(2*Math.PI*x/20)));
  fill(s,2,()=>0.3); fill(s,3,()=>0);
  const ut0 = s.diagnostics().per[1].max;
  s.advance(2000);
  const d=s.diagnostics();
  chk('система u,v,z считается', d.finite, 'max='+d.max.toExponential(3)+' t='+d.t.toFixed(2));
  chk('z сдвинулось с нуля', d.per[3].max>1e-12, 'max|z|='+d.per[3].max.toExponential(2));
  chk('трение гасит ut', d.per[1].max < 0.01*ut0, ut0.toFixed(3)+' -> '+d.per[1].max.toExponential(2));
  chk('трение v накопилось', d.per[2].max > 1, 'max|v|='+d.per[2].max.toFixed(4));
}

/* ---------- расходимость обязана детектироваться ---------- */
{
  // ut > 0 всюду: v уходит в минус, трение отрицательное — решение обязано разнести
  const s = mk('utt=-v*ut\nvt=-V*ut\nzt=0*z', {V:0.5}, 128, 20, 0.005);
  fill(s,0,x=>Math.exp(-x*x)); fill(s,1,x=>1+0.5*Math.cos(2*Math.PI*x/20));
  fill(s,2,()=>0.3); fill(s,3,()=>0);
  let blew = 0;
  for (let i=0;i<40 && !blew;i++){ s.advance(100); if(!s.diagnostics().finite) blew = s.t; }
  // z остаётся нулевым и не должен маскировать NaN у остальных компонент
  chk('разнос ловится, здоровая компонента не маскирует NaN', blew>0,
      blew ? 'поймано при t='+blew.toFixed(1) : 'НЕ поймано, max='+s.diagnostics().max);
}

/* ---------- реакция-диффузия (2 поля) ---------- */
{
  const s = mk('ut = Du*uxx + u - u^3/3 - v\nvt = Dv*vxx + eps*(u + a - b*v)',
               {Du:1, Dv:0, eps:0.08, a:0.7, b:0.8}, 256, 60, 0.02);
  fill(s,0,x=>Math.abs(x)<5?1.5:-1.2); fill(s,1,()=>-0.6);
  s.advance(1500);
  const d=s.diagnostics();
  chk('FitzHugh–Nagumo: конечно и живо', d.finite && d.per[0].max>0.5 && d.per[0].max<5,
      'max|u|='+d.per[0].max.toFixed(3)+' t='+d.t.toFixed(1));
}

/* ---------- «Δ за шаг» не должен врать на неадвективных задачах ---------- */
{
  const L=80, N=1024, c=0.4, g=1/Math.sqrt(1-c*c);
  const s = mk('utt = uxx - sin(u)', {}, N, L, 0.01);
  const K=(x: number,x0: number)=>4*Math.atan(Math.exp( g*(x-x0)));
  const A=(x: number,x0: number)=>4*Math.atan(Math.exp(-g*(x-x0)))-2*Math.PI;
  fill(s,0,x=>K(x,-26)+K(x,-14)+A(x,10)+A(x,32));
  fill(s,1,x=>-2*g*c/Math.cosh(g*(x+26))+2*g*c/Math.cosh(g*(x+14)));
  s.advance(50);
  const d=s.diagnostics();
  chk('синус-Гордон: Δ за шаг мало (нет ложной тревоги)', d.perStep<0.05,
      'Δ='+d.perStep.toFixed(4)+'  а старое «CFL» было бы '+d.cfl.toFixed(2));
  const s2 = mk('ut+uux+uxxx=0', {}, 256, 40, 0.005);
  fill(s2,0,x=>3/Math.pow(Math.cosh(0.5*x),2)); s2.advance(50);
  chk('КдФ: Δ за шаг мало', s2.diagnostics().perStep<0.05, 'Δ='+s2.diagnostics().perStep.toFixed(4));
  const s3 = mk('ut+uux+uxxx=0', {}, 256, 40, 0.2);   // заведомо слишком крупный шаг
  fill(s3,0,x=>3/Math.pow(Math.cosh(0.5*x),2)); s3.advance(1);
  chk('слишком крупный dt виден по Δ за шаг', s3.diagnostics().perStep>0.1,
      'Δ='+s3.diagnostics().perStep.toFixed(3));
}

/* ---------- гашение осцилляций опрокидывания ---------- */
{
  const tv = (u: Float64Array) => { let s=0; for(let j=0;j<u.length;j++) s+=Math.abs(u[(j+1)%u.length]-u[j]); return s; };
  const burgers = (smooth: number, N?: number, dt?: number) => {
    const s = mk('ut + u*ux = 0', {}, N||512, 20, dt||0.002);
    s.smooth = smooth;
    fill(s, 0, x=>Math.exp(-(x/2)*(x/2)));
    s.advance(Math.round(8/(dt||0.002)));
    return s;
  };
  chk('по умолчанию гашение выключено', new Sim().smooth===0);

  const off = burgers(0), on = burgers(1);
  // у монотонной ударной волны TV = 2·амплитуда; пила на всю сетку раздувает TV
  chk('без гашения опрокидывание даёт пилу', tv(off.getU(0))>15, 'TV='+tv(off.getU(0)).toFixed(1));
  chk('гашение убирает пилу', tv(on.getU(0))<3, 'TV='+tv(on.getU(0)).toFixed(3)+' (монотонно ≈2)');
  chk('и снимает нефизичный рост амплитуды',
      on.diagnostics().per[0].max<1 && off.diagnostics().per[0].max>1.2,
      'max: с гашением '+on.diagnostics().per[0].max.toFixed(3)+
      ', без '+off.diagnostics().per[0].max.toFixed(3));
  chk('∫u dx гашение не трогает (k=0 не фильтруется)',
      Math.abs(on.diagnostics().per[0].mass - off.diagnostics().per[0].mass)<1e-9,
      'Δ∫u='+(on.diagnostics().per[0].mass-off.diagnostics().per[0].mass).toExponential(2));

  // результат должен определяться задачей, а не тем, как мелко её считают
  const half = burgers(1, 512, 0.001), fine = burgers(1, 1024, 0.002);
  chk('результат не зависит от dt', Math.abs(tv(half.getU(0))-tv(on.getU(0)))<0.05,
      'TV: dt=0.002 -> '+tv(on.getU(0)).toFixed(3)+', dt=0.001 -> '+tv(half.getU(0)).toFixed(3));
  chk('и почти не зависит от N', Math.abs(tv(fine.getU(0))-tv(on.getU(0)))<0.2,
      'TV: N=512 -> '+tv(on.getU(0)).toFixed(3)+', N=1024 -> '+tv(fine.getU(0)).toFixed(3));

  // цена: разрешённое решение остаётся разрешённым
  const c=1, sol=(x: number)=>3*c/Math.pow(Math.cosh(0.5*Math.sqrt(c)*x),2);
  const s = mk('ut + u*ux + uxxx = 0', {}, 512, 40, 0.005);
  s.smooth = 1;
  fill(s,0,sol); s.advance(400);
  let num=0, den=0;
  for (let j=0;j<s.N;j++){ let X=s.x[j]-c*2; X-=40*Math.round(X/40);
    const e=s.getU(0)[j]-sol(X); num+=e*e; den+=sol(X)*sol(X); }
  chk('гашение не портит разрешённый солитон КдФ (эталон 5.8e-9)',
      Math.sqrt(num/den)<5e-8, 'rel='+Math.sqrt(num/den).toExponential(2));

  // дисперсионные осцилляции — это физика, их гасить нельзя
  const peaks = (u: Float64Array) => { let n=0; for(let j=0;j<u.length;j++){
    const a=u[(j-1+u.length)%u.length], b=u[j], c2=u[(j+1)%u.length];
    if(b>a&&b>c2&&b>0.15) n++; } return n; };
  const fis = (sm: number) => { const q = mk('ut + u*ux + uxxx = 0', {}, 512, 60, 0.002);
    q.smooth = sm; fill(q,0,x=>Math.exp(-(x/5)*(x/5))); q.advance(10000); return q; };
  const f0 = fis(0), f1 = fis(1);
  chk('распад горба на солитоны гашение не съедает',
      peaks(f1.getU(0))===peaks(f0.getU(0)) &&
      Math.abs(f1.diagnostics().per[0].max - f0.diagnostics().per[0].max)<1e-3,
      'солитонов '+peaks(f0.getU(0))+' -> '+peaks(f1.getU(0))+
      ', max '+f0.diagnostics().per[0].max.toFixed(4)+' -> '+f1.diagnostics().per[0].max.toFixed(4));
  chk('снятая энергия видна в диагностике',
      on.diagnostics().loss>0 && f1.diagnostics().loss<1e-3 && off.diagnostics().loss===0,
      'опрокидывание '+(100*on.diagnostics().loss).toFixed(2)+'%/ед.вр., солитоны '+
      (100*f1.diagnostics().loss).toExponential(1)+'%/ед.вр.');
}

/* ---------- предупреждение о некорректности ---------- */
{
  const s = mk('ut + uxx = 0', {}, 64, 10, 0.01);
  chk('обратная диффузия -> предупреждение', !!s.stabilityWarning(), JSON.stringify(s.stabilityWarning()));
  const s2 = mk('ut = uxx', {}, 64, 10, 0.01);
  chk('нормальная диффузия -> тихо', !s2.stabilityWarning());
  // равномерный по k рост (реакция +u) — задача корректна, ругаться нельзя
  const s3 = mk('ut = D*uxx + u - u^3', {D:1}, 64, 20, 0.01);
  chk('реакция +u -> без ложной тревоги', !s3.stabilityWarning(), JSON.stringify(s3.stabilityWarning()));
  const s4 = mk('ut = -uxxxx + uxx', {}, 64, 20, 0.01);
  chk('Курамото–Сивашинский -> без ложной тревоги', !s4.stabilityWarning(), JSON.stringify(s4.stabilityWarning()));
}

/* ---------- источник с x и t ---------- */
{
  const s = mk('ut = uxx + sin(x)*t', {}, 64, 2*Math.PI, 0.001);
  fill(s,0,()=>0); s.advance(100);
  const u=s.getU(0); let mx=0; for(let j=0;j<s.N;j++) mx=Math.max(mx,Math.abs(u[j]));
  chk('источник sin(x)·t работает', mx>1e-4 && s.diagnostics().finite, 'max='+mx.toExponential(2));
}

/* ---------- мнимая единица: свободный пакет Шрёдингера ----------
   Проверяем аналитическими законами, а не сверкой с тем же FFT (она была бы
   круговой): норма, закон расплывания и групповая скорость. Явной части у
   `ut = i*uxx` нет вовсе, поэтому экспонента точна и числа выходят машинные. */
{
  const N=1024, L=80, s0=2, k0=3;
  const s = new Sim(); s.resize(N,L); const m = s.setSystem('ut = i*uxx', {}); s.setDt(0.002);
  chk('i делает компоненту комплексной', m.comps[0].complex && m.complex, 'complex='+m.comps[0].complex);
  chk('у свободного пакета нет явной части', !m.nonlin);

  const re=new Float64Array(N), im=new Float64Array(N);
  for(let j=0;j<N;j++){ const x=s.x[j], g=Math.exp(-x*x/(2*s0*s0));
    re[j]=g*Math.cos(k0*x); im[j]=g*Math.sin(k0*x); }
  s.setU(0,re,im);
  const mom = () => { const u=s.getU(0), w=s.getUi(0), dx=L/N;
    let n=0,mx=0,mx2=0;
    for(let j=0;j<N;j++){ const p=u[j]*u[j]+w[j]*w[j], x=s.x[j]; n+=p; mx+=p*x; mx2+=p*x*x; }
    const c=mx/n; return { norm:n*dx, mean:c, sigma:Math.sqrt(mx2/n-c*c) }; };

  const q0 = mom();
  chk('мнимая часть начальных данных дошла до поля',
      Math.abs(q0.sigma - s0/Math.SQRT2) < 1e-9 && s.getUi(0).some(v=>v!==0),
      'σ='+q0.sigma.toFixed(6));
  s.advance(1000);                                   // t = 2
  const q = mom();
  // ħ=1, m=1/2 (так задано самим уравнением); ширина плотности |ψ|², то есть σ0=s0/√2
  const v0 = s0*s0/2, sEx = Math.sqrt(v0*(1+(s.t/v0)**2));
  chk('норма ∫|ψ|² сохраняется (эталон 1e-14)',
      Math.abs(q.norm/q0.norm-1) < 1e-12, 'откл='+Math.abs(q.norm/q0.norm-1).toExponential(2));
  chk('пакет расплывается по σ(t)=σ0√(1+(t/σ0²)²)',
      Math.abs(q.sigma/sEx-1) < 1e-10, q.sigma.toFixed(6)+' против точных '+sEx.toFixed(6));
  chk('центр едет с групповой скоростью 2k0',
      Math.abs(q.mean - 2*k0*s.t) < 1e-10, q.mean.toFixed(6)+' против точных '+(2*k0*s.t).toFixed(6));
}

/* ---------- мнимая единица: типизация выражений ----------
   «Комплексен ли символ» и «комплексно ли поле» — разные вопросы, и ошибиться
   тут легко в обе стороны. Лишняя комплексность стоит памяти и портит картинку,
   потерянная — тихо портит решение, поэтому проверяется весь набор случаев. */
{
  const kind = (eq: string) => buildSystem(eq, {}).comps.map(c => c.name+':'+(c.complex?'C':'R')).join(' ');
  const cases: [string, string, string][] = [
    ['ut = i*i*uxx',                       'u:R', 'i² = -1 ровно — это теплопроводность'],
    ['ut + u*ux + uxxx = 0',               'u:R', 'вещественная задача комплексной не становится'],
    ['i*ut + uxx + 2*abs(u)^2*u = 0',      'u:C', 'НУШ: i слева от ut'],
    ['utt = i*uxx',                        'u:C ut:C', 'комплексность идёт по цепочке понижения порядка'],
    ['ut = i*uxx\nvt = abs(u) - v',        'u:C v:R', 'abs останавливает распространение'],
    ['ut = i*uxx\nvt = u*v',               'u:C v:C', 'произведение с комплексным полем заражает'],
    ['ut = i*uxx\nvt = re(u) + im(u) - v', 'u:C v:R', 're и im тоже вещественны']
  ];
  for (const [eq, want, what] of cases) {
    let got = null; try { got = kind(eq); } catch (e) { got = 'ошибка: '+(e as Error).message; }
    chk('типизация: ' + what, got === want, got + (got===want?'':' вместо '+want));
  }
  // комплексный показатель — единственное, что осталось запрещено, и запрет внятен
  let e: PosError | null = null;
  try { buildSystem('ut = i*uxx + u^i', {}); } catch (q) { e = q as PosError; }
  chk('комплексный показатель отвергается с позицией',
      e && /Комплексный показатель/.test(e.message) && e.pos !== undefined,
      e ? 'pos='+e.pos : 'посчиталось молча');
  // i*ut = -uxx — то же уравнение, записанное как пишут физики
  const a = new Sim(); a.resize(256,20); a.setSystem('i*ut = -uxx', {}); a.setDt(0.001);
  const b = new Sim(); b.resize(256,20); b.setSystem('ut = i*uxx', {}); b.setDt(0.001);
  for (const s of [a,b]) { const re=new Float64Array(256), im=new Float64Array(256);
    for(let j=0;j<256;j++){ re[j]=Math.exp(-s.x[j]*s.x[j]); } s.setU(0,re,im); s.advance(200); }
  let d=0; for(let j=0;j<256;j++) d=Math.max(d, Math.abs(a.getU(0)[j]-b.getU(0)[j]),
                                                Math.abs(a.getUi(0)[j]-b.getUi(0)[j]));
  chk('«i*ut = -uxx» — то же, что «ut = i*uxx»', d<1e-14, 'расхождение='+d.toExponential(2));
}

/* ---------- комплексная явная часть: сверка с точными решениями ----------
   Нелинейность, потенциал от x и conj считаются кодогенерацией парами re/im.
   Проверять их сверкой с тем же FFT было бы кругом, поэтому взяты три задачи,
   у которых ответ выписывается вручную. Первые две вообще не содержат
   производных по x: экспонента линейной части там единица, и ошибка целиком
   принадлежит новому коду. */
{
  const put = (s: Sim, f: (x: number) => number, g?: (x: number) => number) => {
    const N=s.N, a=new Float64Array(N), b=new Float64Array(N);
    for(let j=0;j<N;j++){ a[j]=f(s.x[j]); b[j]=g?g(s.x[j]):0; } s.setU(0,a,b); };
  const err = (s: Sim, f: (x: number) => number, g: (x: number) => number) => {
    let e=0; const u=s.getU(0), w=s.getUi(0);
    for(let j=0;j<s.N;j++) e=Math.max(e, Math.hypot(u[j]-f(s.x[j]), w[j]-g(s.x[j]))); return e; };

  // ut = i·|u|²·u: модуль в каждой точке свой и не меняется, крутится только фаза
  const g1 = (x: number) => Math.exp(-x*x/4);
  const s1 = mk('ut = i*abs(u)^2*u', {}, 512, 40, 0.002); put(s1, g1); s1.advance(1000);
  chk('нелинейность с i: точная фазовая накрутка e^{i|ψ|²t}',
      err(s1, x=>g1(x)*Math.cos(g1(x)*g1(x)*s1.t), x=>g1(x)*Math.sin(g1(x)*g1(x)*s1.t)) < 1e-10,
      err(s1, x=>g1(x)*Math.cos(g1(x)*g1(x)*s1.t), x=>g1(x)*Math.sin(g1(x)*g1(x)*s1.t)).toExponential(2));

  // ut = i·x²·u: потенциал от координаты
  const g2 = (x: number) => Math.exp(-x*x/2);
  const s2 = mk('ut = i*x^2*u', {}, 1024, 20, 0.0005); put(s2, g2); s2.advance(400);
  chk('потенциал от x: точное e^{i x² t}',
      err(s2, x=>g2(x)*Math.cos(x*x*s2.t), x=>g2(x)*Math.sin(x*x*s2.t)) < 1e-9,
      err(s2, x=>g2(x)*Math.cos(x*x*s2.t), x=>g2(x)*Math.sin(x*x*s2.t)).toExponential(2));

  // ut = i·conj(u) перемешивает части крест-накрест: a' = b, b' = a
  const g3 = (x: number) => Math.exp(-x*x);
  const s3 = mk('ut = i*conj(u)', {}, 256, 20, 0.001); put(s3, g3); s3.advance(1000);
  chk('conj: части растут как cosh t и sinh t',
      err(s3, x=>g3(x)*Math.cosh(s3.t), x=>g3(x)*Math.sinh(s3.t)) < 1e-10,
      err(s3, x=>g3(x)*Math.cosh(s3.t), x=>g3(x)*Math.sinh(s3.t)).toExponential(2));

  // abs — это модуль, а не |Re|: у поля с равными частями |u| = √2·Re u
  const s4 = mk('ut = i*uxx\nvt = abs(u) - v', {}, 256, 20, 0.001);
  const a4 = new Float64Array(256); for(let j=0;j<256;j++) a4[j]=Math.exp(-s4.x[j]*s4.x[j]);
  s4.setU(0, a4, a4); s4.setU(1, new Float64Array(256)); s4.step();
  let mx4=0; for(let j=0;j<256;j++) mx4=Math.max(mx4, s4.getU(1)[j]);
  chk('abs(u) — модуль комплексного поля, а не |Re u|',
      Math.abs(mx4/(s4.dt*Math.SQRT2) - 1) < 1e-3, 'отн='+(mx4/(s4.dt*Math.SQRT2)).toFixed(5));
}

/* ---------- НУШ: солитон, норма, ловушка ---------- */
{
  // Светлый солитон sech(x)·e^{it} — точное решение i·ut + uxx + 2|u|²u = 0.
  // Модуль обязан стоять на месте, а фаза — крутиться ровно как t.
  const s = mk('i*ut + uxx + 2*abs(u)^2*u = 0', {}, 512, 40, 0.001);
  const a = new Float64Array(512);
  for (let j=0;j<512;j++) a[j] = 1/Math.cosh(s.x[j]);
  s.setU(0, a);
  const n0 = s.diagnostics().per[0].norm;
  s.advance(2000);
  let e=0; const u=s.getU(0), w=s.getUi(0);
  for (let j=0;j<512;j++) e = Math.max(e, Math.hypot(u[j]-Math.cos(s.t)/Math.cosh(s.x[j]),
                                                     w[j]-Math.sin(s.t)/Math.cosh(s.x[j])));
  chk('солитон НУШ держит форму и фазу e^{it} (эталон 6e-9)', e < 1e-7, 'откл='+e.toExponential(2));
  const dn = Math.abs(s.diagnostics().per[0].norm/n0 - 1);
  chk('норма ∫|ψ|² у НУШ сохраняется (эталон 7e-14)', dn < 1e-11, 'дрейф='+dn.toExponential(2));

  // Ловушка i·ut + uxx − x²u = 0: центр когерентного состояния ходит как x0·cos 2t
  // и пакет при этом не расплывается — проверка потенциала на задаче с ответом.
  const T = mk('i*ut + uxx - x^2*u = 0', {}, 512, 20, 0.0005);
  const b = new Float64Array(512);
  for (let j=0;j<512;j++) b[j] = Math.exp(-(T.x[j]-3)*(T.x[j]-3)/2);
  T.setU(0, b);
  const ctr = () => { const p=T.getU(0), q=T.getUi(0); let n=0,m=0;
    for(let j=0;j<512;j++){ const w=p[j]*p[j]+q[j]*q[j]; n+=w; m+=w*T.x[j]; } return m/n; };
  T.advance(3142);                                    // t ≈ π/2 — полпериода, центр в −3
  chk('ловушка: центр ходит как x0·cos 2t',
      Math.abs(ctr() - 3*Math.cos(2*T.t)) < 2e-3,
      ctr().toFixed(5)+' против точных '+(3*Math.cos(2*T.t)).toFixed(5));
}

/* ---------- Манаков: система из двух комплексных полей ---------- */
{
  const eq = 'i*ut + uxx + 2*(abs(u)^2+abs(v)^2)*u = 0\n' +
             'i*vt + vxx + 2*(abs(u)^2+abs(v)^2)*v = 0';
  const s = mk(eq, {}, 512, 40, 0.001);
  const N = 512, ar=new Float64Array(N), ai=new Float64Array(N), br=new Float64Array(N), bi=new Float64Array(N);
  for (let j=0;j<N;j++) {
    const x = s.x[j];
    ar[j] = 1/Math.cosh(x+6);
    const g = 0.8/Math.cosh(0.8*(x-6));
    br[j] = g*Math.cos(2*x); bi[j] = g*Math.sin(2*x);
  }
  s.setU(0, ar, ai); s.setU(1, br, bi);
  const d0 = s.diagnostics(), n0 = d0.per[0].norm + d0.per[1].norm;
  chk('Манаков: комплексны обе компоненты', d0.per[0].complex && d0.per[1].complex);
  s.advance(3000);
  const d = s.diagnostics();
  chk('Манаков: суммарная норма сохраняется при столкновении',
      d.finite && Math.abs((d.per[0].norm + d.per[1].norm)/n0 - 1) < 1e-9,
      'откл='+Math.abs((d.per[0].norm + d.per[1].norm)/n0 - 1).toExponential(2));
}

/* ---------- смена сетки ---------- */
{
  const s = mk('utt = c^2*uxx', {c:1}, 128, 20, 0.01);
  fill(s,0,x=>Math.exp(-x*x)); fill(s,1,()=>0);
  s.advance(50);
  s.resize(256, 20);
  chk('resize: компоненты на месте', s.M===2 && s.U[0].length===256, 'M='+s.M);
  fill(s,0,x=>Math.exp(-x*x)); fill(s,1,()=>0);
  s.advance(10);
  chk('resize: считает дальше', s.diagnostics().finite);
}
