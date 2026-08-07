/* app.js — интерфейс: система уравнений, поля разными цветами,
   рисование начальных данных мышью, диаграмма x–t */
(function () {
'use strict';
const { Sim, buildSystem, parseOne, tokenize, scanFields, splitAtoms } = DifurCore;
const $ = id => document.getElementById(id);

/* телефонная раскладка. Условие обязано совпадать с @media в index.html символ
   в символ: стили прячут боковую панель в шторку, а этот matchMedia переносит
   пульт в нижнюю строку. Разъедутся — пульт окажется в двух местах сразу.
   Второе условие — телефон лёжа, там мало высоты, а не ширины. */
const MOB = '(max-width:760px), (max-height:480px) and (max-width:1000px)';
const mob = matchMedia(MOB);

/* цвет — по полю; компоненты (u, ut, utt) — тем же цветом, но пунктиром */
const COLORS = ['#5ad1ff','#ffb454','#63d68a','#ff7ba8','#b18cff','#ffe066','#8ce8d0'];

/* ================= пресеты ================= */

/* синус-Гордон: два кинка навстречу (упруго отталкиваются) плюс пара
   антикинков-«статистов» вдали — они нужны только чтобы поле было периодическим */
const SG = (function () {
  const c1 = -0.2, c2 = -0.6;                 // оба горба влево, правый догоняет левый
  const G = c => 1/Math.sqrt(1 - c*c);
  const K = (x,x0,g) => 4*Math.atan(Math.exp( g*(x-x0)));
  const A = (x,x0)   => 4*Math.atan(Math.exp(-(x-x0))) - 2*Math.PI;   // неподвижные «статисты»
  const B = (x,x0,c) => -2*G(c)*c/Math.cosh(G(c)*(x-x0));             // ut кинка со скоростью c
  return {
    u:  x => K(x,-12,G(c1)) + K(x,0,G(c2)) + A(x,25) + A(x,45),
    ut: x => B(x,-12,c1) + B(x,0,c2) };
})();

/* плато скорости шире горба — горб едет как твёрдое тело */
const plateau = (x, x0, w, e) => 0.5*(Math.tanh((x-x0+w)/e) - Math.tanh((x-x0-w)/e));

/* `sol:true` — «у задачи есть солитоны». Единственная фишка про поведение решений,
   которую нельзя вычислить из текста (см. «фишки пресетов» ниже), поэтому стоит
   руками и только там, где солитон виден с первого запуска: КдФ, мКдФ, Кавахара,
   синус-Гордон. У Клейн–Гордона солитон тоже есть (топологический кинк), но
   начальные данные пресета его не показывают — обещать нечего. */
const PRESETS = [
  { name:'Кортевег–де Фриз (солитоны)', eq:'ut + u*ux + uxxx = 0', L:40, N:512, dt:0.005,
    y:[-1,4], sol:true, ic:{ u:{tool:'sech',A:3,w:2} } },
  { name:'мКдФ', eq:'ut + 6u^2*ux + uxxx = 0', L:40, N:512, dt:0.002, y:[-0.5,2],
    sol:true, ic:{ u:{tool:'sech',A:1,w:1.5} } },
  { name:'Бюргерс (ударная волна)', eq:'ut + u*ux = nu*uxx', p:{nu:0.02}, L:20, N:512, dt:0.002,
    y:[-1.5,1.5], ic:{ u:{tool:'sin',A:1,w:5} } },
  { name:'Курамото–Сивашинский (хаос)', eq:'ut + u*ux + uxx + uxxxx = 0', L:100, N:512, dt:0.05,
    y:[-3.5,3.5], ic:{ u:{tool:'noise',A:0.5,w:2} } },
  { name:'Теплопроводность', eq:'ut = k*uxx', p:{k:0.5}, L:20, N:256, dt:0.01, y:[-0.3,1.3],
    ic:{ u:{tool:'step',A:1,w:3} } },
  { name:'Перенос', eq:'ut + c*ux = 0', p:{c:1}, L:20, N:256, dt:0.01, y:[-0.3,1.3],
    ic:{ u:{tool:'step',A:1,w:2} } },
  { name:'Эйри (чистая дисперсия)', eq:'ut + uxxx = 0', L:40, N:512, dt:0.005, y:[-1,1.3],
    ic:{ u:{tool:'gauss',A:1,w:1} } },
  { name:'Кавахара', eq:'ut + u*ux + uxxx - uxxxxx = 0', L:40, N:512, dt:0.002, y:[-1,3],
    sol:true, ic:{ u:{tool:'sech',A:2,w:2} } },
  { name:'Фишер–КПП (фронт)', eq:'ut = D*uxx + r*u*(1-u)', p:{D:0.2,r:1}, L:40, N:512, dt:0.01,
    y:[-0.2,1.3], ic:{ u:{tool:'step',A:1,w:3} } },
  { name:'Аллен–Кан', eq:'ut = eps*uxx + u - u^3', p:{eps:0.1}, L:40, N:512, dt:0.005,
    y:[-1.4,1.4], ic:{ u:{tool:'noise',A:0.4,w:2} } },

  { name:'Волновое уравнение', eq:'utt = c^2*uxx', p:{c:1}, L:40, N:512, dt:0.01,
    y:[-1.2,1.2], ic:{ u:{tool:'gauss',A:1,w:1.5}, ut:{tool:'const',A:0} } },
  { name:'Клейн–Гордон', eq:'utt = uxx - m^2*u - u^3', p:{m:1}, L:40, N:512, dt:0.005,
    y:[-1.5,1.5], ic:{ u:{tool:'gauss',A:1.2,w:2}, ut:{tool:'const',A:0} } },
  { name:'Волна с трением u–v–z', eq:'utt = -v*ut\nvt = -V*ut\nzt = -u*v*vxx*ux',
    p:{V:0.5}, L:20, N:256, dt:0.005, y:[-1.6,2],
    ic:{ u:{tool:'gauss',A:1,w:1.5}, ut:{tool:'const',A:-1}, v:{tool:'const',A:0.3}, z:{tool:'const',A:0} } },
  { name:'FitzHugh–Nagumo', eq:'ut = Du*uxx + u - u^3/3 - v\nvt = Dv*vxx + eps*(u + a - b*v)',
    p:{Du:1,Dv:0,eps:0.08,a:0.7,b:0.8}, L:60, N:512, dt:0.02, y:[-2.5,2.5],
    ic:{ u:{tool:'step',A:2.7,w:5,base:-1.2}, v:{tool:'const',A:-0.6} } },
  { name:'Хищник–жертва', eq:'ut = a*uxx + u*(1-u) - u*v\nvt = b*vxx + c*u*v - d*v',
    p:{a:0.05,b:0.5,c:2,d:0.6}, L:60, N:512, dt:0.01, y:[-0.2,1.6],
    ic:{ u:{tool:'const',A:0.5}, v:{tool:'gauss',A:0.3,w:2} } },

  /* Комплексные поля: `i` делает из теплопроводности Шрёдингера. Кривая на графике —
     модуль, цвет вдоль неё — фаза, диаграмма x–t становится domain coloring.
     У свободного пакета явной части нет вовсе, поэтому экспонента точна и dt
     ограничивает только гладкость картинки — отсюда крупные dt и fixdt.

     Уравнение одно на три опыта — различаются они только начальными данными,
     поэтому это один пресет со сценариями (`sc`), а не три пресета с дословно
     одинаковым текстом. Раньше их было три, и список приходилось делать липким,
     чтобы заголовок не перескакивал на первый совпавший по тексту; сценарий
     выбирается кнопкой-картинкой и в заголовок не лезет. Поля сценария
     перекрывают поля пресета, так что общее (уравнение, L, dt, темп) написано
     один раз. */
  { name:'Шрёдингер (волновой пакет)', eq:'ut = i*uxx', L:60, N:512, dt:0.004,
    fixdt:true, spf:10, y:[-0.1,1.1], sc:[
    { name:'расплывание', icon:'spread',
      tip:'Неподвижный гауссов пакет, k₀=0. Стоит на месте и расплывается: ширина растёт, ' +
          'высота падает, а норма ‖ψ‖² в легенде держится — расплывание не потеря вещества.',
      ic:{ u:{tool:'gauss',A:1,w:2,k0:0} } },
    { name:'импульс', icon:'kick', k0:3,
      tip:'Тот же пакет, умноженный на e^{ik₀x} при k₀=3: едет вправо со скоростью 2k₀=6 и ' +
          'расплывается на ходу. Частота смены цвета вдоль кривой — это и есть импульс.',
      ic:{ u:{tool:'gauss',A:1,w:2,k0:3} } },
    // встречные импульсы ±k₀: в месте встречи получается интерференционная гребёнка,
    // и на диаграмме x–t она видна как решётка, а не как «горбы прошли друг сквозь друга»
    { name:'встреча', icon:'pair', k0:4, N:1024, y:[-0.1,1.6],
      tip:'Два пакета с импульсами ±4 идут навстречу. В месте встречи — интерференционная ' +
          'гребёнка (на диаграмме x–t она видна решёткой), после встречи оба уходят невредимыми.',
      ic:{ u:{ fnRe:x => Math.exp(-Math.pow((x+15)/3,2))*Math.cos(4*x)
                       + Math.exp(-Math.pow((x-15)/3,2))*Math.cos(-4*x),
               fnIm:x => Math.exp(-Math.pow((x+15)/3,2))*Math.sin(4*x)
                       + Math.exp(-Math.pow((x-15)/3,2))*Math.sin(-4*x) } } }
    ] },

  /* Нелинейное Шрёдингера. Та же комплексная кривая, что у свободного пакета, но
     с нелинейностью — и вся разница видна с первого взгляда: пакет перестаёт
     расплываться. Три сценария — три разных ответа на «что даёт нелинейность»:
     держит форму, пропускает встречный солитон насквозь, поднимает рябь на
     ровном фоне. Уравнение записано так, как его пишут физики (`i` слева от
     `ut`): деление на `i` ядро умеет, а узнаваемость записи важнее. */
  { name:'Нелинейное Шрёдингера (солитоны)', eq:'i*ut + uxx + 2*abs(u)^2*u = 0',
    L:40, N:512, dt:0.002, spf:10, sol:true, y:[-0.1,1.3], sc:[
    { name:'солитон', icon:'keep',
      tip:'ψ = sech(x)·e^{it} — точное решение. Модуль стоит на месте: дисперсия растаскивает ' +
          'горб ровно настолько, насколько нелинейность его стягивает. Двигается только фаза — ' +
          'цвет вдоль кривой крутится, а форма не меняется вовсе.',
      ic:{ u:{fn:x => 1/Math.cosh(x), k0:0} } },
    // высота солитона НУШ — это и его ширина, и его скорость; поэтому встречные
    // берутся разными, иначе столкновение выглядит как встреча двух пакетов
    { name:'встреча', icon:'pass', y:[-0.1,2.6],
      tip:'Два солитона идут навстречу и проходят друг сквозь друга целыми — меняется только ' +
          'фаза (цвет) и положение. В момент столкновения модуль подскакивает до 2.3: это ' +
          'интерференция, а не слияние.',
      ic:{ u:{ fnRe: x => Math.cos(1.5*x)/Math.cosh(x+10)
                        + 1.5*Math.cos(1.5*x)/Math.cosh(1.5*(x-10)),
               fnIm: x => Math.sin(1.5*x)/Math.cosh(x+10)
                        - 1.5*Math.sin(1.5*x)/Math.cosh(1.5*(x-10)) } } },
    // затравка — ровно та мода, что растёт быстрее всех (k = √2·A на этом фоне)
    { name:'рябь на фоне', icon:'mi', y:[-0.1,3.6],
      tip:'Ровный фон |ψ|=1 неустойчив: любая рябь на нём растёт сама (модуляционная ' +
          'неустойчивость) и собирается в череду высоких пиков. Затравка тут — 2% самой ' +
          'быстрорастущей моды; шум дал бы то же самое, но позже и грязнее.',
      ic:{ u:{fn:x => 1 + 0.02*Math.cos(2*Math.PI*9*x/40), k0:0} } }
    ] },

  /* Ловушка. Дальше всего от «нарисуй горб и посмотри»: тут интересно не то, что
     нарисовано, а то, что параболическая яма делает с любым пакетом. `dt` закреплён:
     автоподбор не видит жёсткости явного потенциала (x² на краю сетки — это λ=100),
     и на подобранном им шаге «Δ за шаг» уходит в жёлтое. */
  { name:'Ловушка (Гросс–Питаевский)', eq:'i*ut + uxx - x^2*u - g*abs(u)^2*u = 0',
    p:{g:2}, L:20, N:512, dt:0.002, fixdt:true, spf:10, story:true, y:[-0.1,1.2],
    ic:{ u:{fn:x => Math.exp(-(x-3)*(x-3)/2), k0:0} } },

  { name:'Туннелирование сквозь барьер', eq:'i*ut + uxx - V*exp(-x^2/w^2)*u = 0',
    p:{V:9,w:1}, L:60, N:1024, dt:0.002, fixdt:true, spf:10, story:true, y:[-0.1,1.6],
    ic:{ u:{tool:'gauss', A:1, w:2.8, x0:-15, k0:3} } },

  /* Единственный пресет, где комплексность не про квантовую механику: у
     Гинзбурга–Ландау мнимые части коэффициентов — это расстройка частоты. Считается
     ровно как любое другое уравнение, и в этом весь смысл снятого ограничения. */
  { name:'Гинзбурга–Ландау (комплексный хаос)',
    eq:'ut = u + (1+i*a)*uxx - (1+i*b)*abs(u)^2*u',
    p:{a:2,b:-1}, L:100, N:512, dt:0.01, spf:12, y:[-0.1,1.6],
    ic:{ u:{tool:'noise', A:0.1, w:2} } },

  { name:'Опрокидывание горба (Бюргерс без вязкости)', story:true, eq:'ut + u*ux = 0', L:20, N:512,
    dt:0.002, y:[-0.3,1.2], smooth:true,
    ic:{ u:{tool:'gauss',A:1,w:2} } },
  { name:'Упругий отскок солитонов (синус-Гордон)', story:true, sol:true, eq:'utt = uxx - sin(u)', L:100, N:1024,
    dt:0.01, fixdt:true, spf:10, y:[-0.3,1.8], sel:'ut', vis:{ u:false, ut:true },
    ic:{ u:{fn:SG.u}, ut:{fn:SG.ut} } },
  { name:'Перенос горба со своей скоростью', story:true, eq:'ut = -v*ux\nvt = -v*vx + nu*vxx',
    p:{nu:0.05}, L:60, N:512, dt:0.003, y:[-0.5,1.3],
    ic:{ u:{fn:x => Math.exp(-Math.pow((x+12)/2,2)) + Math.exp(-Math.pow((x-12)/2,2))},
         v:{fn:x => 0.3*plateau(x,-12,5,1.5) - 0.3*plateau(x,12,5,1.5)} } }
];

/* ================= инструменты рисования ================= */
/* форма для миниатюры: s ∈ [-1,1] -> значение (масштаб произвольный) */
const PEN_PTS = [[-1,.12],[-.72,.62],[-.5,.22],[-.16,.92],[.14,.34],[.46,.76],[.74,.28],[1,.55]];
function toolShape(id, s) {
  switch (id) {
    case 'sech':  { const c = Math.cosh(s/0.16); return 1/(c*c); }   // острее, с хвостами
    case 'gauss': return Math.exp(-(s/0.42)*(s/0.42));               // шире и круглее
    case 'step':  return 0.5*(Math.tanh((s+0.45)/0.12) - Math.tanh((s-0.45)/0.12));
    case 'sin':   return Math.cos(2.5*Math.PI*s);
    case 'const': return 0.62;
    case 'noise': return 0.46*Math.sin(3.1*Math.PI*s+0.7) + 0.3*Math.sin(7.3*Math.PI*s+2.1)
                       + 0.16*Math.sin(11.5*Math.PI*s+4.2);
    case 'pen': {
      for (let i = 1; i < PEN_PTS.length; i++)
        if (s <= PEN_PTS[i][0]) {
          const a = PEN_PTS[i-1], b = PEN_PTS[i];
          return a[1] + (b[1]-a[1])*(s-a[0])/(b[0]-a[0]);
        }
      return PEN_PTS[PEN_PTS.length-1][1];
    }
    default: return 0;
  }
}

/** миниатюра профиля: тот же график, что нарисует инструмент */
function toolIcon(id) {
  const W = 60, H = 26, PAD = 4, n = id === 'pen' ? PEN_PTS.length*6 : 56;
  const v = [];
  let lo = 0, hi = 1;
  for (let i = 0; i < n; i++) {
    const y = toolShape(id, -1 + 2*i/(n-1));
    v.push(y); lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  const Y = u => (H-PAD - (u-lo)/(hi-lo)*(H-2*PAD)).toFixed(1);
  const X = i => (2 + i/(n-1)*(W-4)).toFixed(1);
  let d = '';
  for (let i = 0; i < n; i++) d += (i ? 'L' : 'M') + X(i) + ' ' + Y(v[i]);
  const zero = lo < 0 ? '<line class="zero" x1="1" y1="'+Y(0)+'" x2="'+(W-1)+'" y2="'+Y(0)+'"/>' : '';
  const nib = id === 'pen'
    ? '<circle cx="'+X(n-1)+'" cy="'+Y(v[n-1])+'" r="2.6" fill="currentColor"/>' : '';
  return '<svg viewBox="0 0 '+W+' '+H+'" aria-hidden="true">' + zero +
         '<path class="sh" d="' + d + '"/>' + nib + '</svg>';
}

/* ================= фишки пресетов ================= */

/* Чем эта задача отличается от соседней по списку — значком у правого края пункта.
   Раньше на этом месте были значки-приставки в самом названии (`▸`, `ψ`, `★`):
   они делили список на группы, но нигде не объявляли, на какие, и `▸` вдобавок
   совпадал со стрелкой «разверни» у свёрнутых секций. Теперь у каждого значка
   есть имя и объяснение, и оно раскрывается в превью формулы.

   **Фишка вычисляется из уравнения, а не приписывается руками** — иначе она
   разъедется с текстом при первой же правке пресета. Руками задаются только те
   четыре, которых в тексте нет и быть не может: сценарии, включённое гашение,
   «опыт» (подобранные начальные данные) и солитоны. Последние — свойство решений,
   а не текста: Бюргерс и Курамото–Сивашинский тоже нелинейны, но солитонов у них
   нет, и никакой разбор уравнения этого не покажет. */
const sq = v => v*v;
const sech2 = s => { const c = Math.cosh(s); return 1/(c*c); };

/** путь по параметрической кривой pt(s) ∈ [-1,1]² в коробке 14×14 */
function spark(pt, n) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const [px, py] = pt(-1 + 2*i/(n-1));
    d += (i ? 'L' : 'M') + (7 + px*6).toFixed(1) + ' ' + (7 - py*5.2).toFixed(1);
  }
  return d;
}

const CHIP_ART = {
  // фигурная скобка и две строки — ровно то, чем система набрана в превью формулы.
  // Раньше тут были две волны (два поля на графике), но волна у соседней фишки
  // значит «решение», и два разных смысла у одного штриха не разошлись
  sys:  '<path d="M6.6 2c-1.5 0-1.6.5-1.6 1.9 0 1.5-.3 2.3-1.4 3.1 1.1.8 1.4 1.6 1.4 3.1 ' +
        '0 1.4.1 1.9 1.6 1.9"/><path d="M8.5 4.4h4.2"/><path d="M8.5 9.6h3"/>',
  // так это и пишется в поле ввода, и так же верстается в превью: u с индексом tt.
  // До этого здесь побывали `ü` (дуга с двумя точками читалась грустным смайликом)
  // и маятник — маятник рисовал пример, а не саму вторую производную
  utt:  '<text x="7" y="9.6" text-anchor="middle">u<tspan class="sb" dy="1.6">tt</tspan></text>',
  // фазор: длина и угол — это |ψ| и фаза, ровно то, что рисует цветная кривая
  cx:   '<circle cx="7" cy="7" r="5.2"/><path d="M7 7 10.7 3.3"/>',
  // укрученный горб: вершина едет быстрее подошвы — так выглядит нелинейность
  nl:   '<path d="' + spark(s => { const t = s*1.5, g = Math.exp(-sq(t/0.6));
                                   return [(t + 0.7*g)/1.75, 1.5*g - 0.62]; }, 46) + '"/>',
  // два солитона на общей подошве: высокий узкий догоняет низкий широкий — высота
  // и есть скорость, и в этом вся суть (после столкновения оба выйдут целыми)
  sol:  '<path d="' + spark(s => [s, 1.3*(sech2((s+0.55)/0.19) + 0.5*sech2((s-0.35)/0.33)) - 0.6],
                            90) + '"/>',
  /* Пятёрка по символу нарисована одним языком: пунктир — «было», сплошное —
     «стало». У сноса тот же горб уехал вправо, у сглаживания — расплылся, сохранив
     площадь (пунктирный узкий и сплошной широкий — одной массы). */
  // горбы нарочно налезают друг на друга: два раздельных читались бы как «солитоны»,
  // а тут нужен один горб с призраком там, где он только что был
  adv:  '<path class="dsh" d="' + spark(s => [s, sech2((s + 0.18)/0.3) - 0.5], 56) + '"/>' +
        '<path d="' + spark(s => [s, sech2((s - 0.18)/0.3) - 0.5], 56) + '"/>',
  dif:  '<path class="dsh" d="' + spark(s => [s, 1.55*Math.exp(-sq(s/0.19)) - 0.75], 64) + '"/>' +
        '<path d="' + spark(s => [s, 0.5*Math.exp(-sq(s/0.59)) - 0.75], 64) + '"/>',
  // чирп: одна кривая, а длина волны вдоль неё меняется — это и есть «каждая
  // гармоника со своей скоростью». Амплитуда постоянна: дисперсия ничего не гасит
  dsp:  '<path d="' + spark(s => [s, 0.72*Math.sin(6.6*s - 2.6*sq(s) + 1.2)], 96) + '"/>',
  // зеркало гашения: рябь не умирает, а растёт слева направо
  amp:  '<path d="' + spark(s => [s, 0.14*Math.exp(0.9*(s + 1))*Math.sin(5.2*s + 0.4)], 90) + '"/>',
  // волна упирается в неподвижные рельсы: амплитуда не уходит ни вверх, ни вниз
  cons: '<path class="dsh" d="M1 3.8h12"/><path class="dsh" d="M1 10.2h12"/>' +
        '<path d="' + spark(s => [s, 0.62*Math.sin(6.2*s + 1.55)], 88) + '"/>',
  // ряд кнопок — то самое, чем сценарий и выбирается
  sc:   '<rect x="1" y="4" width="3.5" height="6" rx="1.2"/>' +
        '<rect x="5.2" y="4" width="3.5" height="6" rx="1.2"/>' +
        '<rect x="9.4" y="4" width="3.5" height="6" rx="1.2"/>',
  // затухающая рябь — то, что делает кнопка «∿ гасить осцилляции»
  smt:  '<path d="' + spark(s => [s, Math.exp(-1.7*(s+1))*Math.sin(5.6*s+1.1)], 60) + '"/>',
  // звезда осталась от прежней приставки `★` — она и означала «поставленный опыт»
  st:   '<path class="fl" d="M7 1.3 8.65 5.35 13 5.68 9.65 8.5 10.7 12.7 7 10.4 3.3 12.7 ' +
        '4.35 8.5 1 5.68 5.35 5.35z"/>'
};

const chipIcon = id => '<svg class="chip" viewBox="0 0 14 14" aria-hidden="true">' +
                       CHIP_ART[id] + '</svg>';

/* нелинейность по дереву: поле под функцией, в степени или в произведении с полем.
   Явной части (`hasExplicit`) для этого мало — явным бывает и линейный член,
   скажем потенциал V(x)·u */
const hasFld = n => !!n && (n.k === 'd' || hasFld(n.a) || hasFld(n.b));
const isNonlin = n => !!n && (
  (n.k === 'mul' && hasFld(n.a) && hasFld(n.b)) ||
  (n.k === 'div' && hasFld(n.b)) ||
  ((n.k === 'pow' || n.k === 'fn') && hasFld(n.a)) ||
  isNonlin(n.a) || isNonlin(n.b));

/* ================= символ линейной части: откуда берутся пять фишек ниже =========

   S(k) = Σ c·(ik)ⁿ — тот самый символ, который решатель кладёт в экспоненту.
   Одна и та же величина отвечает сразу на четыре вопроса: Re S — растёт мода или
   гаснет, Im S/k — с какой скоростью бежит. Поэтому «снос», «дисперсия»,
   «сглаживание», «раскачка» и «без потерь» не выдуманы по виду текста
   («есть чётная производная без компенсации» и прочие приметы), а посчитаны. */

/** значение символа списка линейных членов при данном k */
function symAt(lin, k) {
  // i^n ходит по кругу 1, i, -1, -i: вклад члена — его коэффициент, повёрнутый
  // на n прямых углов и умноженный на kⁿ
  let re = 0, im = 0;
  for (const l of lin) {
    const p = Math.pow(k, l.n), q = l.n & 3;
    re += p*(q === 0 ? l.c.re : q === 1 ? -l.c.im : q === 2 ? -l.c.re : l.c.im);
    im += p*(q === 0 ? l.c.im : q === 1 ?  l.c.re : q === 2 ? -l.c.im : -l.c.re);
  }
  return { re, im };
}

/** корень из комплексного числа — нужен ровно для `utt` */
const csqrt = z => {
  const r = Math.hypot(z.re, z.im);
  return { re: Math.sqrt(Math.max(0, (r + z.re)/2)),
           im: (z.im < 0 ? -1 : 1)*Math.sqrt(Math.max(0, (r - z.re)/2)) };
};

/* λ(k) поля f — показатели роста, по одному на порядок поля по времени.
   У первого порядка это сам диагональный символ. У второго вся линейная часть
   сидит не в диагонали, а в связи с нижней компонентой (`uxx` у `utt = uxx` —
   это cross-член из ut в u), и λ ищется из λ² = A₁λ + A₀: без этого волновое и
   Клейн–Гордон остались бы вовсе без разбора.
   Связи между РАЗНЫМИ полями в λ не входят — диагонализовать матрицу M×M ради
   значка не тот размен. Из-за этого фишка может чего-то не заметить; чтобы она
   при этом не наврала, «снос» и «без потерь» (единственные, кто говорит про всё
   решение, а не про наличие механизма) требуют `pure` — см. ниже. */
function lambdasOf(m, f, k) {
  const ord = m.order[f], top = m.comps[m.index[f + ':' + (ord-1)]];
  const A = []; for (let d = 0; d < ord; d++) A[d] = { re:0, im:0 };
  const add = (d, s) => { A[d].re += s.re; A[d].im += s.im; };
  add(ord - 1, symAt(top.linear, k));
  for (const x of m.cross)
    if (x.row === top.ci && m.comps[x.col].f === f)
      add(m.comps[x.col].d, symAt([{ c:x.c, n:x.n }], k));
  if (ord === 1) return [A[0]];
  const d = csqrt({ re: A[1].re*A[1].re - A[1].im*A[1].im + 4*A[0].re,
                    im: 2*A[1].re*A[1].im + 4*A[0].im });
  return [{ re:(A[1].re + d.re)/2, im:(A[1].im + d.im)/2 },
          { re:(A[1].re - d.re)/2, im:(A[1].im - d.im)/2 }];
}

/* Таблица λ по ветвям. k берутся ровно те, что есть в сетке пресета (2π/L … πN/L):
   полоса роста, которая в сетку не влезла, ничего и не раскачает — фишка обещает
   то, что человек увидит на этой сетке, а не то, что верно в пределе. */
function spectrum(m, p) {
  if (!p.L || !p.N) return null;                          // сетки нет — не о чем говорить
  if (m.fields.some(f => m.order[f] > 2)) return null;    // третий порядок не разбираем
  const dk = 2*Math.PI/p.L, K = [];
  for (let j = 1; j <= p.N/2; j++) K.push(j*dk);          // k=0 пропущен: скорость Im λ/k
  const br = [];
  for (const f of m.fields) {
    const b = []; for (let r = 0; r < m.order[f]; r++) b.push({ re:[], im:[] });
    for (const k of K) {
      const l = lambdasOf(m, f, k);
      for (let r = 0; r < b.length; r++) { b[r].re.push(l[r].re); b[r].im.push(l[r].im); }
    }
    for (const x of b) br.push(x);
  }
  let sc = 0;                                             // масштаб: |λ| бывает и ~k⁴
  for (const b of br) for (let j = 0; j < K.length; j++)
    sc = Math.max(sc, Math.hypot(b.re[j], b.im[j]));
  /* `pure`: линейная часть — это и есть всё уравнение. Нелинейный член ломает
     любое обещание про форму решения, а линейная связь между разными полями
     (`ut = v`, `vt = u` растёт, хотя диагонали пусты) — про рост. */
  const pure = m.comps.every(c => c.explicit.every(it => !isNonlin(it.node))) &&
               m.cross.every(x => m.comps[x.col].f === m.comps[x.row].f);
  return { K, br, pure, tol: 1e-9*(sc || 1) };
}

const lastOf = a => a[a.length - 1];
const speeds = (S, b) => b.im.map((v, j) => v/S.K[j]);      // фазовая скорость моды
/* «все гармоники бегут с одной скоростью» — Im λ строго пропорционален k */
const flat = (S, b) => {
  const s = speeds(S, b), mx = Math.max(...s), mn = Math.min(...s);
  return mx - mn <= 1e-9*(1 + Math.max(Math.abs(mx), Math.abs(mn)));
};
const anyBr = (S, f) => !!S && S.br.some(b => f(b, S));

/* `why` пустое у «системы»: что полей несколько, видно по самой формуле —
   раскрывать это в превью, где формула стоит строкой выше, незачем */
const CHIPS = [
  { id:'sys', name:'система', of: m => m.fields.length > 1 },
  { id:'utt', name:'вторая производная по времени', of: m => m.comps.some(c => c.d > 0),
    why:'порядок понижается сам: появляются компоненты u и ut, у каждой свои начальные ' +
        'данные — задать можно не только форму, но и начальную скорость.' },
  { id:'cx',  name:'комплексное поле', of: m => m.complex,
    why:'решение комплексное: на графике рисуется |ψ|, а цвет вдоль кривой — фаза, ' +
        'диаграмма x–t становится цветной. Появляется поле «импульс k₀».' },
  { id:'nl',  name:'нелинейное', of: m => m.comps.some(c => c.explicit.some(it => isNonlin(it.node))),
    why:'есть член, где поле умножается само на себя (или стоит под функцией). Из него ' +
        'и берутся опрокидывание, хаос и солитоны — линейная задача так не умеет.' },
  /* Пятёрка по символу S(k). Порядок — от «ничего не меняется» к «растёт само»:
     снос → дисперсия → сглаживание → раскачка, и отдельно «без потерь». */
  { id:'adv', name:'снос', of: (m, p, S) => !!S && S.pure && S.br.every(b => flat(S, b)) &&
      anyBr(S, b => Math.abs(b.im[0]/S.K[0]) > S.tol),
    why:'все гармоники бегут с одной скоростью, и линейной частью дело исчерпано: ' +
        'профиль едет целиком, не меняя формы.' },
  { id:'dsp', name:'дисперсия', of: (m, p, S) => anyBr(S, (b, s) => !flat(s, b)),
    why:'длинные и короткие волны бегут с разной скоростью, поэтому одиночный горб ' +
        'расползается в гребёнку хвостов. Высота падает, но это перестройка, а не потеря.' },
  { id:'dif', name:'сглаживание', of: (m, p, S) =>
      anyBr(S, (b, s) => lastOf(b.re) < -s.tol && lastOf(b.re) < b.re[0] - s.tol),
    why:'чем мельче рябь, тем быстрее она гаснет: углы и разрывы разглаживаются сами. ' +
        'Мелкая сетка тут не спасает — она добавляет мод, которые сразу же и умирают.' },
  { id:'amp', name:'раскачка', of: (m, p, S) => anyBr(S, (b, s) => b.re.some(v => v > s.tol)),
    why:'часть гармоник растёт сама: ноль неустойчив, и любая мелочь — шум в начальных ' +
        'данных, ошибка округления — поднимается, пока её не остановит нелинейность.' },
  { id:'cons', name:'без потерь', of: (m, p, S) => !!S && S.pure &&
      S.br.every(b => b.re.every(v => Math.abs(v) <= S.tol)),
    why:'ни одна гармоника не растёт и не затухает — меняются только фазы. Показания ' +
        'в легенде обязаны стоять на месте: если поехали, виноват шаг по времени.' },
  { id:'sol', name:'солитоны', of: (m, p) => !!p.sol,
    why:'у этой нелинейной задачи есть горбы, которые не расплываются: дисперсия растаскивает ' +
        'горб ровно настолько, насколько нелинейность его подтягивает. Высокий солитон уже и ' +
        'быстрее низкого, а после столкновения оба выходят целыми — только со сдвигом.' },
  { id:'sc',  name:'сценарии', of: (m, p) => !!p.sc,
    why:'уравнение одно, а постановок несколько: они различаются начальными данными и ' +
        'выбираются кнопками «сценарий» в острове «Начальные данные».' },
  { id:'smt', name:'гашение включено', of: (m, p) => !!p.smooth,
    why:'решение за конечное время становится разрывным, и ряд Фурье отвечает на разрыв ' +
        'пилой. Пресет включает «∿ гасить осцилляции» — выключи кнопку и сравни.' },
  { id:'st',  name:'поставленный опыт', of: (m, p) => !!p.story,
    why:'не просто уравнение: начальные данные подобраны так, чтобы эффект был виден ' +
        'с первого запуска. Рисовать поверх можно, но опыт от этого кончится.' }
];

/** фишки пресета: считаются один раз при загрузке — уравнения пресетов не меняются */
function chipsOf(p) {
  let m = null;
  try { m = buildSystem(p.eq, Object.assign({}, p.p || {})); } catch (e) { return []; }
  const S = spectrum(m, p);            // считается один раз на пресет, а не на фишку
  return CHIPS.filter(c => c.of(m, p, S));
}
const FX = PRESETS.map(chipsOf);

const chipRow = i => '<span class="fx">' + FX[i].map(c => chipIcon(c.id)).join('') + '</span>';

/* ================= картинки сценариев ================= */

/* Иконка сценария — это его начальные данные: Re ψ(x, 0) по той же формуле, что
   уйдёт в поле. У неподвижного пакета это просто горб, у едущего — горб с
   заполнением, и частота заполнения и есть k₀ (ровно то, что видно цветом на
   графике). Одной кривой мало там, где вся суть в том, что будет дальше:
   у «расплывания» пунктиром пририсовано, каким горб станет, а у едущих пакетов —
   стрелка направления. Подписи словами («расплывание», «встреча») этого не
   показывают: две из трёх картинок иначе выглядели бы одинаково. */
const SCEN_ART = {
  spread: { f:  s => Math.exp(-sq(s/0.26)),
            gh: s => 0.42*Math.exp(-sq(s/0.68)) },              // «станет таким»
  kick:   { f:  s => Math.exp(-sq((s+0.15)/0.42))*Math.cos(9*s), ar:[[0.6, 1]] },
  // стрелки стоят под своими пакетами, а не в середине: сведённые к центру они
  // сливались наконечниками в бантик
  pair:   { f:  s => Math.exp(-sq((s+0.5)/0.2))*Math.cos(17*s)
                   + Math.exp(-sq((s-0.5)/0.2))*Math.cos(17*s), ar:[[-0.45, 1], [0.45, -1]] },
  /* Солитон НУШ: горб и есть горб, и пунктирного «станет таким» у него нет —
     в этом вся разница с «расплыванием», где ghost занимает половину картинки. */
  keep:   { f:  s => 1/Math.cosh(6*s) },
  // столкновение солитонов: горбы РАЗНОЙ высоты (высота солитона — это его
  // скорость), иначе картинка не отличалась бы от встречи двух пакетов
  pass:   { f:  s => 1/Math.cosh(9*(s+0.5)) + 1.6/Math.cosh(15*(s-0.5)),
            ar:[[-0.45, 1], [0.45, -1]] },
  // модуляционная неустойчивость: ровный фон, на котором рябь раскачивается
  mi:     { f:  s => 1 + 0.5*Math.cos(11*s)*Math.exp(2.2*(s-1)) }
};

function scenIcon(id) {
  const W = 62, H = 30, TOP = 3, BOT = 21, n = 120;   // ниже BOT — полоса под стрелки
  const a = SCEN_ART[id];
  const at = i => -1 + 2*i/(n-1);
  let lo = 0, hi = 0;
  for (let i = 0; i < n; i++)
    for (const f of [a.f, a.gh]) if (f) { const y = f(at(i)); lo = Math.min(lo,y); hi = Math.max(hi,y); }
  const Xn = s => 2 + (s+1)/2*(W-4);
  const X = s => Xn(s).toFixed(1);
  const Y = u => (BOT - (u-lo)/(hi-lo || 1)*(BOT-TOP)).toFixed(1);
  const path = f => {
    let d = '';
    for (let i = 0; i < n; i++) d += (i ? 'L' : 'M') + X(at(i)) + ' ' + Y(f(at(i)));
    return d;
  };
  let g = lo < 0 ? '<line class="zero" x1="1" y1="'+Y(0)+'" x2="'+(W-1)+'" y2="'+Y(0)+'"/>' : '';
  if (a.gh) g += '<path class="gh" d="' + path(a.gh) + '"/>';
  g += '<path class="sh" d="' + path(a.f) + '"/>';
  for (const [pos, dir] of a.ar || []) {
    const x = Xn(pos), y = H - 4, t = (x + 5*dir).toFixed(1), h = (x + 1.6*dir).toFixed(1);
    g += '<path class="ar" d="M' + (x - 5*dir).toFixed(1) + ' ' + y + 'H' + t +
         'M' + h + ' ' + (y-2.4) + 'L' + t + ' ' + y + 'L' + h + ' ' + (y+2.4) + '"/>';
  }
  return '<svg viewBox="0 0 '+W+' '+H+'" aria-hidden="true">' + g + '</svg>';
}

/* Иконки пульта и «применить» — рисованные, а не юникодные глифы. Глифы взяли не
   из того шрифта: ⏭ система считает эмодзи и рисует цветной картинкой с подложкой,
   ⟲ приходит из запасного шрифта и выходит вдвое мельче соседей. У svg такой
   зависимости нет — размер и цвет задаём мы. */
const ICON = {
  play:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 4.2 19 12 6.5 19.8z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor">' +
         '<rect x="6.6" y="4.5" width="4" height="15" rx="1"/>' +
         '<rect x="13.4" y="4.5" width="4" height="15" rx="1"/></svg>',
  step:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 4.2 15 12 4.5 19.8z"/>' +
         '<rect x="16.6" y="4.2" width="3.2" height="15.6" rx="1"/></svg>',
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
         'stroke-linecap="round" stroke-linejoin="round">' +
         '<polyline points="2.5 4.5 2.5 10.5 8.5 10.5"/>' +
         '<path d="M5 15a8.5 8.5 0 1 0 2-8.8l-4.5 4.3"/></svg>',
  apply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
         'stroke-linecap="round" stroke-linejoin="round">' +
         '<path d="M20 5.5v5a3 3 0 0 1-3 3H5"/><polyline points="9.5 10 5 13.5 9.5 17"/></svg>'
};

const TOOLS = [
  { id:'sech',  name:'Шапочка',   tip:'sech²-горб — профиль солитона КдФ. Тянуть ↕ амплитуда, ↔ ширина' },
  { id:'gauss', name:'Гаусс',     tip:'Колокол exp(−(x/w)²) — гладкий, без длинных хвостов' },
  { id:'step',  name:'Ступенька', tip:'Плато шириной w со сглаженным краем (см. поле «край»)' },
  { id:'sin',   name:'Синус',     tip:'Косинус с целым числом периодов на отрезке — точно периодичен' },
  { id:'const', name:'Константа', tip:'Ровное значение по всему x: высота задаётся мышью' },
  { id:'pen',   name:'Перо',      tip:'Рисовать профиль от руки, точка за точкой' },
  { id:'noise', name:'Шум',       tip:'Восемь гармоник со случайными фазами — затравка для неустойчивостей' }
];

/* ================= состояние ================= */
const S = {
  tool:'sech', width:2, edge:0.4, add:false, live:false,
  running:false, spf:6, baseSpf:6, autodt:true, coarse:false,
  autoY:true, yMin:-1, yMax:4, showIC:true,
  sel:0, vis:[], ic:[], icI:[], base:null, drag:null, dead:false,
  scen:-1,                             // выбранный сценарий пресета (-1 — сценариев нет)
  k0:0,                                // импульс: фаза e^{ik₀x} у комплексного поля
  wasRunning:false,                    // счёт до нажатия мыши — вернуть после отпускания
  smooth:false,                        // гашение осцилляций опрокидывания
  appliedEq:null                       // текст, который сейчас стоит в модели
};

const sim = new Sim();
const plot = $('plot'), pctx = plot.getContext('2d');
const xt = $('xt'), xctx = xt.getContext('2d');
const XT_W = 1200, XT_H = 400, XT_MAX = 8;
xt.width = XT_W; xt.height = XT_H;
let xtBuf = [], xtScale = [], lastFrameDt = 0;
let PW = 800, PH = 400;

/* ================= утилиты ================= */
const clamp = (v,a,b) => v < a ? a : v > b ? b : v;
const wrapd = (d,L) => d - L * Math.round(d / L);
const compColor = c => COLORS[sim.model.fields.indexOf(c.f) % COLORS.length];

function x2px(x){ return (x + sim.L/2) / sim.L * PW; }
function px2x(px){ return px / PW * sim.L - sim.L/2; }
function u2py(u){ return (S.yMax - u) / (S.yMax - S.yMin) * PH; }
function py2u(py){ return S.yMax - py / PH * (S.yMax - S.yMin); }

function profile(tool, x, x0, A, w, edge, L) {
  const d = wrapd(x - x0, L);
  switch (tool) {
    case 'sech':  { const c = Math.cosh(d/w); return A/(c*c); }
    case 'gauss': return A * Math.exp(-(d/w)*(d/w));
    case 'step':  return A * 0.5 * (Math.tanh((d + w)/edge) - Math.tanh((d - w)/edge));
    case 'sin':   { const m = Math.max(1, Math.round(L/(2*w))); return A*Math.cos(2*Math.PI*m*d/L); }
    case 'const': return A;
    default: return 0;
  }
}

function makeProfile(desc) {
  const N = sim.N, out = new Float64Array(N);
  const base = desc.base || 0;
  if (desc.fn) { for (let j = 0; j < N; j++) out[j] = desc.fn(sim.x[j], sim.L); return out; }
  if (desc.tool === 'noise') {
    for (let m = 1; m <= 8; m++) {
      const ph = Math.random()*2*Math.PI, a = desc.A*(Math.random()*2-1)/m;
      for (let j = 0; j < N; j++) out[j] += a*Math.sin(2*Math.PI*m*sim.x[j]/sim.L + ph);
    }
    for (let j = 0; j < N; j++) out[j] += base;
    return out;
  }
  for (let j = 0; j < N; j++)
    out[j] = base + profile(desc.tool, sim.x[j], desc.x0 || 0, desc.A, desc.w, desc.edge || S.edge, sim.L);
  return out;
}

/* ================= начальные данные ================= */

/** Начальные данные комплексного поля: нарисованный мышью профиль — это модуль,
 *  а фазу задаёт «импульс» k₀ множителем e^{ik₀x}. Без него нарисовать можно было
 *  бы только неподвижный пакет: у вещественного профиля групповая скорость нуль,
 *  и вся картина сводилась бы к расплыванию на месте. */
function withPhase(re, k0) {
  if (!k0) return { re, im: null };
  const N = sim.N, a = new Float64Array(N), b = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    const p = k0*sim.x[j];
    a[j] = re[j]*Math.cos(p); b[j] = re[j]*Math.sin(p);
  }
  return { re:a, im:b };
}

/** нарисованное/пресетное описание -> пара массивов (im = null у вещественного поля) */
function makeIC(desc, complex) {
  if (desc.fnRe) {                       // пресет задаёт обе части сам
    const N = sim.N, a = new Float64Array(N), b = new Float64Array(N);
    for (let j = 0; j < N; j++) { a[j] = desc.fnRe(sim.x[j], sim.L); b[j] = desc.fnIm(sim.x[j], sim.L); }
    return { re:a, im:b };
  }
  const re = makeProfile(desc);
  return complex ? withPhase(re, desc.k0 === undefined ? S.k0 : desc.k0) : { re, im:null };
}

/** state <- поле; мнимую часть храним рядом (у вещественных полей она null) */
function setIC(c, re, im) {
  sim.setU(c, re, im);
  S.ic[c] = Float64Array.from(sim.getU(c));
  S.icI[c] = sim.isComplex(c) ? Float64Array.from(sim.getUi(c)) : null;
}

function commit(u, keepTime) {
  const p = sim.isComplex(S.sel) ? withPhase(u, S.k0) : { re:u, im:null };
  setIC(S.sel, p.re, p.im);
  if (!keepTime) { sim.t = 0; clearXT(); }
  S.dead = false;
  refreshDt(true);
  draw();
}

function clearXT() {
  xtBuf = []; xtScale = [];
  for (let c = 0; c < Math.min(sim.M, XT_MAX); c++) {
    const img = xctx.createImageData(XT_W, XT_H), d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i]=10; d[i+1]=14; d[i+2]=21; d[i+3]=255; }
    xtBuf.push(img); xtScale.push(1e-6);
  }
  showXT();
}

/* ================= диаграмма x–t ================= */
function cmap(s) {
  s = clamp(s, -1, 1);
  const bg = [10,14,21];
  let c1, c2, t;
  if (s >= 0) { c1 = [255,157,61]; c2 = [255,244,214]; t = s; }
  else { c1 = [58,140,232]; c2 = [186,228,255]; t = -s; }
  let r,g,b;
  if (t < 0.75) { const q = t/0.75;
    r = bg[0]+(c1[0]-bg[0])*q; g = bg[1]+(c1[1]-bg[1])*q; b = bg[2]+(c1[2]-bg[2])*q; }
  else { const q = (t-0.75)/0.25;
    r = c1[0]+(c2[0]-c1[0])*q; g = c1[1]+(c2[1]-c1[1])*q; b = c1[2]+(c2[2]-c1[2])*q; }
  return [r,g,b];
}

/** тон -> rgb (s=0.85, l задаётся); нужен для комплексной диаграммы, где цвет
    приходится писать прямо в пиксели, а не строкой CSS */
function hue2rgb(h, l) {
  const s = 0.85, C = (1 - Math.abs(2*l - 1))*s, hp = h/60, X = C*(1 - Math.abs(hp % 2 - 1));
  let r=0,g=0,b=0;
  if (hp < 1) { r=C; g=X; } else if (hp < 2) { r=X; g=C; }
  else if (hp < 3) { g=C; b=X; } else if (hp < 4) { g=X; b=C; }
  else if (hp < 5) { r=X; b=C; } else { r=C; b=X; }
  const m = l - C/2;
  return [(r+m)*255, (g+m)*255, (b+m)*255];
}

/** Комплексная диаграмма x–t — domain coloring: тон = фаза, яркость = |ψ|.
    Ради неё фича во многом и делается: дисперсия, интерференция и фазовые сдвиги
    видны как узор, а не как «что-то шевелится». */
function cmapCx(re, im, sc) {
  const v = clamp(Math.hypot(re, im)/sc, 0, 1);
  const bg = [10,14,21];
  if (v < 1e-4) return bg;
  const col = hue2rgb(phaseHue(re, im), 0.55);
  const q = Math.pow(v, 0.7);                     // слабые места иначе не видно вовсе
  return [bg[0]+(col[0]-bg[0])*q, bg[1]+(col[1]-bg[1])*q, bg[2]+(col[2]-bg[2])*q];
}

function pushRow() {
  const N = sim.N, dg = sim.diagnostics();
  for (let c = 0; c < xtBuf.length; c++) {
    const u = sim.getU(c), d = xtBuf[c].data, cx = sim.isComplex(c), w = cx ? sim.getUi(c) : null;
    const mx = isFinite(dg.per[c].max) ? dg.per[c].max : 0;
    xtScale[c] = Math.max(mx, xtScale[c]*0.995, 1e-6);
    const sc = xtScale[c];
    d.copyWithin(0, XT_W*4);
    const off = (XT_H-1)*XT_W*4;
    for (let px = 0; px < XT_W; px++) {
      const j = Math.min(N-1, Math.floor(px*N/XT_W));
      const col = cx ? cmapCx(u[j], w[j], sc) : cmap(u[j]/sc);
      d[off+4*px] = col[0]; d[off+4*px+1] = col[1]; d[off+4*px+2] = col[2]; d[off+4*px+3] = 255;
    }
  }
  showXT();
}
function showXT() {
  if (xtBuf[S.sel]) xctx.putImageData(xtBuf[S.sel], 0, 0);
  else { xctx.fillStyle = '#0a0e15'; xctx.fillRect(0,0,XT_W,XT_H); }
  const n = sim.model ? sim.model.comps[S.sel].name : '';
  $('xtag').textContent = 'диаграмма x–t: ' + n + ' (время вниз)';
}

/* ================= отрисовка ================= */
function fitCanvas() {
  const r = plot.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  PW = Math.max(50, r.width); PH = Math.max(50, r.height);
  plot.width = Math.round(PW*dpr); plot.height = Math.round(PH*dpr);
  pctx.setTransform(dpr,0,0,dpr,0,0);
}

function niceStep(range) {
  const raw = range/6, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw/p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10)*p;
}

/* ---- комплексное поле: кривая — модуль, цвет вдоль неё — фаза ----
   Фаза периодична, и тон периодичен — они подходят друг другу без всякой шкалы:
   arg = 0 красный, π/2 зелёный, π голубой. Частота смены тона вдоль x — это
   локальное k, то есть импульс виден прямо на картинке. */
const phaseHue = (re, im) => (Math.atan2(im, re)*57.29577951308232 + 360) % 360;
const phaseColor = (re, im, l, a) =>
  'hsl(' + phaseHue(re, im).toFixed(0) + ' 85% ' + (l || 62) + '%' +
  (a === undefined ? '' : ' / ' + a) + ')';

/** |ψ| ломаной, каждый отрезок своим тоном; заливка под ней — тем же тоном */
function curveCx(ci, width, fill) {
  const ctx = pctx, N = sim.N, re = sim.getU(ci), im = sim.getUi(ci);
  const mod = j => Math.hypot(re[j], im[j]);
  if (fill) {
    const y0 = u2py(0);
    for (let j = 0; j < N - 1; j++) {
      ctx.fillStyle = phaseColor(re[j], im[j], 55, 0.22);
      const xa = x2px(sim.x[j]), xb = x2px(sim.x[j+1]);
      ctx.beginPath();
      ctx.moveTo(xa, y0); ctx.lineTo(xa, u2py(mod(j)));
      ctx.lineTo(xb, u2py(mod(j+1))); ctx.lineTo(xb, y0);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.save();
  ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (let j = 0; j < N - 1; j++) {
    ctx.strokeStyle = phaseColor(re[j], im[j]);
    ctx.beginPath();
    ctx.moveTo(x2px(sim.x[j]), u2py(mod(j)));
    ctx.lineTo(x2px(sim.x[j+1]), u2py(mod(j+1)));
    ctx.stroke();
  }
  ctx.restore();
}

function curve(arr, color, dash, width, alpha) {
  const ctx = pctx, N = sim.N;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  for (let j = 0; j < N; j++) {
    const X = x2px(sim.x[j]), Y = u2py(arr[j]);
    j ? ctx.lineTo(X,Y) : ctx.moveTo(X,Y);
  }
  ctx.stroke();
  ctx.restore();
}

function draw() {
  const c = pctx;
  c.clearRect(0,0,PW,PH);
  c.fillStyle = '#0e1420'; c.fillRect(0,0,PW,PH);
  c.font = '10px Consolas,monospace'; c.lineWidth = 1;

  const sy = niceStep(S.yMax - S.yMin);
  for (let v = Math.ceil(S.yMin/sy)*sy; v <= S.yMax; v += sy) {
    const y = u2py(v), zero = Math.abs(v) < 1e-9;
    c.strokeStyle = zero ? '#2f4560' : '#18222f';
    c.beginPath(); c.moveTo(0,y); c.lineTo(PW,y); c.stroke();
    c.fillStyle = '#5d708a';
    c.fillText(v.toFixed(Math.max(0, -Math.floor(Math.log10(sy)))), 4, y-3);
  }
  const sx = niceStep(sim.L);
  for (let v = Math.ceil(-sim.L/2/sx)*sx; v <= sim.L/2; v += sx) {
    const x = x2px(v);
    c.strokeStyle = '#18222f';
    c.beginPath(); c.moveTo(x,0); c.lineTo(x,PH); c.stroke();
    c.fillStyle = '#41536b'; c.fillText(v.toFixed(0), x+3, PH-6);
  }
  if (!sim.model) return;

  // начальные условия — призраком (у комплексного поля призрак тоже по модулю)
  if (S.showIC)
    for (const comp of sim.model.comps)
      if (S.vis[comp.ci] && S.ic[comp.ci]) {
        let g = S.ic[comp.ci];
        if (S.icI[comp.ci]) {
          const w = S.icI[comp.ci], m = new Float64Array(g.length);
          for (let j = 0; j < g.length; j++) m[j] = Math.hypot(g[j], w[j]);
          g = m;
        }
        curve(g, compColor(comp), [3,4], 1, 0.28);
      }

  // заливка под выбранным полем
  const sel = sim.model.comps[S.sel];
  if (S.vis[S.sel] && !sel.complex) {
    const col = compColor(sel), u = sim.getU(S.sel);
    const g = c.createLinearGradient(0, u2py(S.yMax), 0, u2py(S.yMin));
    g.addColorStop(0, col + '33'); g.addColorStop(1, col + '03');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(x2px(sim.x[0]), u2py(0));
    for (let j = 0; j < sim.N; j++) c.lineTo(x2px(sim.x[j]), u2py(u[j]));
    c.lineTo(x2px(sim.x[sim.N-1]), u2py(0)); c.closePath(); c.fill();
  }

  for (const comp of sim.model.comps) {
    if (!S.vis[comp.ci]) continue;
    const isSel = comp.ci === S.sel;
    if (comp.complex) { curveCx(comp.ci, isSel ? 2.4 : 1.6, isSel); continue; }
    if (isSel) { c.shadowColor = compColor(comp) + '99'; c.shadowBlur = 8; }
    curve(sim.getU(comp.ci), compColor(comp),
          comp.d ? [7,4] : [], isSel ? 2.2 : 1.5, comp.d ? 0.85 : 1);
    c.shadowBlur = 0;
  }
}

/* ================= автомасштаб ================= */
const Y_LIMIT = 1000;     // дальше автомасштаб не уезжает: при разносе видно, что разнесло, и хватит

function autoscale() {
  if (!S.autoY || S.drag || !sim.model) return;
  let lo = Infinity, hi = -Infinity;
  for (const comp of sim.model.comps) {
    if (!S.vis[comp.ci]) continue;
    const u = sim.getU(comp.ci);
    // у комплексного поля на графике модуль, он же и задаёт масштаб (снизу — ноль)
    if (comp.complex) {
      const w = sim.getUi(comp.ci);
      if (0 < lo) lo = 0;
      for (let j = 0; j < sim.N; j++) { const m = Math.hypot(u[j], w[j]); if (m > hi) hi = m; }
      continue;
    }
    for (let j = 0; j < sim.N; j++) {
      if (u[j] < lo) lo = u[j];
      if (u[j] > hi) hi = u[j];
    }
  }
  if (!isFinite(lo) || !isFinite(hi)) return;
  const pad = Math.max(0.2, (hi-lo)*0.18);
  const tMin = clamp(lo-pad, -Y_LIMIT, Y_LIMIT);
  const tMax = clamp(hi+pad, -Y_LIMIT, Y_LIMIT);
  // после разноса возвращаемся сразу: плавность нужна для дыхания решения,
  // а не для проезда трёх порядков подряд
  const snap = (S.yMax - S.yMin) > 8*(tMax - tMin);
  const w = snap ? 1 : 0.12;
  S.yMin += (tMin - S.yMin)*w;
  S.yMax += (tMax - S.yMax)*w;
  $('ymin').value = S.yMin.toFixed(2); $('ymax').value = S.yMax.toFixed(2);
}

/* ================= шаг по времени ================= */
/** «крупный шаг»: множитель на эвристические пределы автоподбора.
 *  2 — потому что замерено: солитон КдФ 1.8e-5 -> 3.9e-4 (глазом не видно),
 *  все пресеты живы, «Δ за шаг» не перескакивает порог тревоги. 3 уже перескакивает. */
const COARSE_K = 2;

function refreshDt(force) {
  if (!S.autodt || !sim.model) return;
  const d = sim.diagnostics(), dx = sim.L/sim.N, K = S.coarse ? COARSE_K : 1;
  // предел линейной части — настоящая устойчивость, его K не трогает
  let dt = Math.min(0.02*K, sim.dtLimit());
  if (sim.model.nonlin) {
    const amp = Math.max(0.3, Math.min(1e3, isFinite(d.max) ? d.max : 1));
    dt = Math.min(dt, K*0.15*dx/amp);
    if (sim.model.maxOrder >= 3) dt = Math.min(dt, K*3*Math.pow(dx, 1.5));
  }
  dt = clamp(dt, 1e-7, 0.05);
  if (force || Math.abs(dt - sim.dt) > 0.05*sim.dt) { sim.setDt(dt); $('dt').value = dt.toPrecision(3); }
}

/* ================= кадр ================= */
/** Сколько миллисекунд кадра отдаём счёту. Остальное — отрисовка и браузер.
 *  Из-за этого потолка «шагов/кадр» можно ставить любым: тяжёлая сетка
 *  просто уронит fps, а не подвесит вкладку на секунды.
 *  Меняется только из тестов (`setBudget`): под virtual-time в headless
 *  `performance.now()` стоит, и обрыв иначе не воспроизвести. */
let stepBudgetMs = 12;

let stepsDone = 0, stepsPerSec = 0, spsT0 = 0, spsN = 0;

/** шаги одного кадра: не больше S.spf и не дольше бюджета. Возвращает сделанное */
function frameSteps() {
  const w0 = performance.now();
  let i = 0;
  for (; i < S.spf; i++) {
    sim.step();
    // время смотрим не каждый шаг: на мелкой сетке сам замер сопоставим с шагом
    if ((i & 7) === 7 && performance.now() - w0 > stepBudgetMs) { i++; break; }
  }
  return i;
}

function frame() {
  if (S.running && !S.dead) {
    const t0 = sim.t;
    refreshDt(false);
    stepsDone = frameSteps(); spsN += stepsDone;
    lastFrameDt = sim.t - t0;
    if (!sim.diagnostics().finite) { S.dead = true; S.running = false; syncPlay(); }
    pushRow();
  } else stepsDone = 0;

  const now = performance.now();
  if (now - spsT0 > 500) { stepsPerSec = spsN*1000/(now - spsT0); spsT0 = now; spsN = 0; }

  autoscale();
  draw();
  updateDiag();
  requestAnimationFrame(frame);
}

/** одна форма записи числа на весь интерфейс: экспонента только там, где иначе
 *  получится «0.0000» или частокол цифр */
function fmt(v, dg) {
  return isFinite(v) ? (Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-3)
         ? v.toExponential(2) : v.toFixed(dg === undefined ? 4 : dg)) : '∞';
}

function updateDiag() {
  if (!sim.model) return;
  const d = sim.diagnostics();
  const f = fmt;
  // показания поля — в его строке легенды, а не в общей таблице: они относятся
  // к конкретной кривой, и читать их удобнее рядом с ней
  for (const comp of sim.model.comps) {
    const el = legendVals[comp.ci], p = d.per[comp.ci]; if (!el) continue;
    // у комплексного поля вместо ∫u — сохраняющаяся норма: именно по ней видно,
    // что счёт идёт правильно (у Шрёдингера она обязана стоять на месте)
    el.textContent = comp.complex
      ? 'max ' + f(p.max, 3) + ' · ‖u‖² ' + f(p.norm, 3)
      : 'max ' + f(p.max, 3) + ' · ∫ ' + f(p.mass, 3);
  }
  // общие показания — в нижней строке: это не настройка, а то, как идёт счёт,
  // и смотрят на них не открывая никаких панелей
  const q = v => '<span class="q">' + v + '</span>';
  let h = 't ' + q(d.t.toFixed(3)) + ' · Δ/шаг ' + q(f(d.perStep));
  // видно, упёрлись мы в железо или просто мало просим: приписка — когда кадр
  // обрывается по бюджету, а не по числу шагов
  if (S.running && stepsPerSec > 0)
    h += ' · ' + q(Math.round(stepsPerSec)) + ' шаг/с' +
         (stepsDone < S.spf ? ' (упёрлось в кадр)' : '');
  // на ударной волне потеря энергии физична (её теряет и точное решение),
  // поэтому ругаемся только когда гашение становится главным процессом
  if (S.smooth)
    h += ' · гашение <span class="q" style="color:' +
         (d.loss > 0.1 ? 'var(--accent2)' : 'var(--ok)') + '">' +
         (100*d.loss).toFixed(d.loss < 0.01 ? 2 : 1) + ' %/ед.вр.</span>';

  let st = '', col = '';
  if (S.dead) { col = 'var(--bad)';
    st = 'решение разошлось — уменьши dt, сгладь данные или поменяй знак'; }
  else if (d.perStep > 0.1) { col = 'var(--accent2)';
    st = 'за шаг решение меняется на ' + (100*d.perStep).toFixed(0) + '% — уменьши dt'; }
  else if (S.smooth && d.loss > 0.25) { col = 'var(--accent2)';
    st = 'гашение снимает ' + (100*d.loss).toFixed(0) + '% энергии за единицу времени — ' +
         'считается уже не исходная задача, а её вязкая версия: возьми сетку помельче'; }

  // На телефоне строка одна и узкая: числа и тревога делить её не могут, поэтому
  // тревога вытесняет числа. Счёт, вставший молча и без объяснения, — худшее,
  // что может случиться, поэтому важнее всего именно она.
  const bt = $('bart'), bm = $('barmsg'), phone = mob.matches;
  if (phone) h = 't ' + q(d.t.toFixed(2)) + ' · Δ ' + q(f(d.perStep, 2));  // короче — иначе обрежется
  if (phone && st) { bt.textContent = S.dead ? 'решение разошлось' : st; bt.style.color = col; }
  else { bt.innerHTML = h; bt.style.color = ''; }
  bm.textContent = phone ? '' : st;
  bm.style.color = col;
  // строка узкая, длинная тревога обрезается — полный текст остаётся в подсказке
  if (st && !phone) bm.setAttribute('data-tip', 'Что случилось|' + st);
  else bm.removeAttribute('data-tip');
}

/* ================= система уравнений ================= */
function showWarnings(m) {
  const w = sim.stabilityWarning();
  const msgs = m.warnings.slice();
  if (w) msgs.push(w.comp + ': неустойчиво при больших k (рост ' + w.growth.toPrecision(3) + ')');
  $('warn').innerHTML = msgs.map(s => '⚠ ' + s).join('<br>');
  syncMsg();
}

/** только смена значения константы: структура та же, DOM ползунков не трогаем */
function updateParams(params) {
  try {
    const m = sim.setSystem($('eq').value, params);
    showError(null);
    showWarnings(m);
    refreshDt(true);
  } catch (e) { showError(e); }
}

function applySystem(text, params) {
  /* применённый текст всегда канонический: лишние пробелы и пустые строки убраны,
     операторы расставлены единообразно. Непонятный текст formatEq не трогает,
     иначе правка ломала бы то, что человек ещё дописывает. */
  text = formatEq(text);
  if ($('eq').value !== text) { $('eq').value = text; autosizeEq(); }
  const prev = sim.model ? sim.model.comps.map(c => c.name) : null;
  const prevIC = S.ic, prevICI = S.icI, prevVis = S.vis;
  try {
    const m = sim.setSystem(text, params || (sim.model ? sim.model.params : {}));
    showError(null);
    showWarnings(m);
    S.appliedEq = text;

    // начальные данные и видимость: переносим по именам компонент, новые — нули.
    // Мнимая часть едет вместе с вещественной: иначе правка константы в
    // «ut = a*i*uxx» стирала бы фазу нарисованного пакета
    const ic = [], icI = [], vis = [];
    for (const c of m.comps) {
      const j = prev ? prev.indexOf(c.name) : -1;
      const keep = j >= 0 && prevIC[j] && prevIC[j].length === sim.N;
      ic[c.ci] = keep ? prevIC[j] : new Float64Array(sim.N);
      icI[c.ci] = keep && prevICI[j] && c.complex ? prevICI[j] : null;
      vis[c.ci] = j >= 0 ? prevVis[j] !== false : c.d === 0;
      if (!keep) sim.setU(c.ci, ic[c.ci]);
      else if (icI[c.ci]) sim.setU(c.ci, ic[c.ci], icI[c.ci]);
    }
    S.ic = ic; S.icI = icI; S.vis = vis;
    if (S.sel >= m.comps.length) S.sel = 0;
    buildLegend(m); buildParamUI(m); clearXT();
    S.dead = false; refreshDt(true);
    syncEqUI();
    $('eq').blur();          // применилось — отпускаем поле, чтобы работал пробел
    return true;
  } catch (e) {
    showError(e);
    syncEqUI();
    return false;
  }
}

/** Легенда поверх графика: она же список полей, она же их показания.
 *  Строится только при пересборке модели или смене выбора/видимости; числа
 *  каждый кадр переписывает `updateDiag` в готовые `.v` (`legendVals`) —
 *  перестраивать разметку 60 раз в секунду было бы и дороже, и опаснее:
 *  под курсором исчезал бы тот самый узел, по которому кликают. */
let legendVals = [];
function buildLegend(m) {
  const box = $('legend');
  box.innerHTML = '';
  legendVals = [];
  for (const comp of m.comps) {
    const b = document.createElement('div');
    b.className = 'lgd' + (comp.ci === S.sel ? ' sel' : '') + (S.vis[comp.ci] ? '' : ' off');
    b.style.color = compColor(comp);
    // у комплексного поля вместо точки — колечко фазы: это и легенда цвета кривой
    b.innerHTML = '<span class="dot' + (comp.complex ? ' ph' : '') +
                  (S.vis[comp.ci] ? '' : ' off') + '"></span>' +
                  '<span class="nm">' + comp.name + '</span><span class="v"></span>';
    b.querySelector('.dot').onclick = ev => {
      ev.stopPropagation();
      S.vis[comp.ci] = !S.vis[comp.ci];
      buildLegend(m); draw();
    };
    b.onclick = () => { S.sel = comp.ci; S.vis[comp.ci] = true; buildLegend(m); showXT(); draw(); };
    box.appendChild(b);
    legendVals[comp.ci] = b.querySelector('.v');
  }
  $('selname').textContent = '→ ' + m.comps[S.sel].name;
  syncCxUI();
  updateDiag();
}

/** «импульс» имеет смысл только там, где есть фаза — у комплексного поля.
    Заодно подсказка на графике объясняет, что нарисована не сама ψ, а её модуль:
    без этого цветная кривая читается как «что-то непонятное». */
function syncCxUI() {
  const cx = !!(sim.model && sim.model.comps[S.sel].complex);
  $('k0row').style.display = cx ? '' : 'none';
  $('hint').textContent = cx
    ? 'кривая — |ψ|, цвет — фаза · тяни' + (mob.matches ? ' пальцем' : ' мышью') + ': ↕ амплитуда, ↔ ширина'
    : (mob.matches ? 'тяни пальцем: ↕ амплитуда, ↔ ширина'
                   : 'тяни мышью: ↕ амплитуда, ↔ ширина · колесо — ширина · Alt — добавить');
}

/* ---- параметры: логарифмический ползунок ---- */
const LO = -4, HI = 3;                     // 10^LO … 10^HI
function buildParamUI(m) {
  const box = $('pars');
  if (!m.paramNames.length) {
    box.innerHTML = '<div class="note">нет — любая лишняя буква станет константой, ' +
                    'например <code>ut + u*ux = nu*uxx</code></div>';
    return;
  }
  box.innerHTML = '';
  for (const name of m.paramNames) {
    const div = document.createElement('div');
    div.className = 'par';
    div.innerHTML =
      '<div class="top"><label>' + name + '</label>' +
      '<button class="sg" title="знак">±</button>' +
      '<input type="number" step="any" style="width:92px"></div>' +
      '<input type="range" min="' + LO + '" max="' + HI + '" step="0.01">' +
      '<div class="sc"><span>10<sup>' + LO + '</sup></span><span>1</span><span>10<sup>' + HI + '</sup></span></div>';
    const num = div.querySelector('input[type=number]');
    const rng = div.querySelector('input[type=range]');
    const sgn = div.querySelector('button.sg');
    let sign = m.params[name] < 0 ? -1 : 1;

    const show = v => {
      num.value = +v.toPrecision(4);
      sign = v < 0 ? -1 : 1;
      sgn.textContent = sign < 0 ? '−' : '+';
      sgn.style.color = sign < 0 ? 'var(--bad)' : 'var(--ok)';
      rng.value = clamp(Math.log10(Math.abs(v) || Math.pow(10, LO)), LO, HI);
    };
    const set = v => { m.params[name] = v; updateParams(m.params); };

    show(m.params[name]);
    rng.oninput = () => { const v = sign*Math.pow(10, +rng.value); num.value = +v.toPrecision(4); set(v); };
    num.oninput = () => { const v = +num.value; if (!isNaN(v)) { show(v); set(v); } };
    sgn.onclick = () => { const v = -(+num.value || Math.pow(10, +rng.value)); show(v); set(v); };
    box.appendChild(div);
  }
}

/* ================= поле ввода: ошибка, селект, кнопка «применить» ================= */

const escHTML = s => s.replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' })[c]);

/** ошибка в #err; сам текст (с раскраской и меткой ошибки) рисует paintEq */
function showError(e) {
  $('err').textContent = e ? e.message : '';
  $('eq').classList.toggle('bad', !!e);
  paintEq(e);
  syncMsg();
}

/** строка сообщений живёт под полем ввода — там, где текст, из-за которого она
    появилась. Пустую убираем целиком: иначе пустая строка вместе с отступом
    шапки навсегда съедала бы высоту у графика. Холст подгонит ResizeObserver. */
function syncMsg() {
  $('msg').classList.toggle('on', !!($('err').textContent || $('warn').textContent));
}

/** подложка #eqhl: раскрашенная копия текста поля, поверх — метка ошибки */
function paintEq(e) {
  const hl = $('eqhl');
  hl.innerHTML = hlHTML($('eq').value, e);
  hl.scrollTop = $('eq').scrollTop;
}

/** проверка текста на лету — модель не трогается */
function validate() {
  let e = null;
  try { buildSystem($('eq').value, Object.assign({}, sim.model ? sim.model.params : {})); }
  catch (err) { e = err; }
  showError(e);
  return !e;
}

/* «своё уравнение» ↔ пресет: сравниваем текст без пробелов и пустых строк */
function normEq(s) {
  return s.split(/[\n;]+/).map(l => l.trim()).filter(l => l && l[0] !== '#')
          .join('\n').replace(/[ \t]+/g, '');
}
/** Текст уравнения у пресетов уникален, поэтому хватает первого совпадения.
 *  (Было не так: три задачи Шрёдингера различались только начальными данными,
 *  и выбранный пресет приходилось делать липким, чтобы заголовок не перескакивал
 *  на первый совпавший. Теперь такие задачи — сценарии одного пресета.) */
function matchPreset(text) {
  const n = normEq(text);
  for (let i = 0; i < PRESETS.length; i++) if (normEq(PRESETS[i].eq) === n) return i;
  return -1;
}
function syncEqUI() {
  const text = $('eq').value;
  const i = matchPreset(text);
  $('preset').value = String(i);                      // -1 — пункт «своё уравнение»
  syncPresetBtn();
  buildScen(i);                                       // ушли с пресета — ушли и сценарии
  $('apply').disabled = text === S.appliedEq;
}

/* ================= запись уравнения =================
   Три вещи растут из одного и того же разбора ядра:
   `formatEq` — канонический текст поля ввода (проход по токенам),
   `hlHTML`   — раскраска этого текста на подложке `#eqhl` (те же токены),
   `prettyEq` — формула для превью, свёрстанная по AST (`parseOne`): дробь
                этажеркой, степень верхним индексом, скобки рисуются под высоту
                содержимого.
   Разбор — тот же, что у решателя, поэтому склейка `uvvxxux` и в раскраске,
   и в формуле разбирается ровно так, как её поймёт ядро. */

const GREEK = { alpha:'α', beta:'β', gamma:'γ', delta:'δ', eps:'ε', epsilon:'ε',
  zeta:'ζ', eta:'η', theta:'θ', kappa:'κ', lambda:'λ', mu:'μ', nu:'ν', xi:'ξ',
  rho:'ρ', sigma:'σ', tau:'τ', phi:'φ', chi:'χ', psi:'ψ', omega:'ω' };
const EQFUNCS = { sin:1, cos:1, tan:1, exp:1, log:1, sqrt:1, abs:1,
                  tanh:1, sinh:1, cosh:1, sech:1, sign:1 };
const EQCONSTS = { x:1, t:1, pi:1, e:1, i:1 };

/* цвет поля — тот же, что у его кривой на графике (порядок полей даёт scanFields) */
function fieldColor(f, fields) {
  const i = fields.indexOf(f);
  return COLORS[(i < 0 ? 0 : i) % COLORS.length];
}

/** канонический текст одной строки; при непонятном тексте — вернуть как есть */
function renderLine(src) {
  let toks;
  try { toks = tokenize(src); } catch (e) { return src; }
  let out = '', i = 0;
  while (i < toks.length && toks[i].t !== 'end') {
    const tk = toks[i], pv = i ? toks[i-1] : null;
    /* унарный плюс/минус: в начале строки и после любого оператора или «(» */
    const unary = !pv || '+-*/^(,='.indexOf(pv.t) >= 0;
    i++;
    switch (tk.t) {
      case 'num': out += src.slice(tk.i, tk.j); break;
      case 'id':  out += tk.v; break;
      case '=':   out += ' = '; break;
      case '+':   out += unary ? '+' : ' + '; break;
      case '-':   out += unary ? '-' : ' - '; break;
      case ',':   out += ', '; break;
      default:    out += tk.t;                                // * / ^ ( )
    }
  }
  return out;
}

/* ---------- формула: вёрстка по AST ----------
   Каждый узел возвращает { h — html, p — приоритет (нужны ли скобки),
   tall — содержит ли этажерку (тогда скобки рисуются, а не берутся из шрифта) }. */
const P_SUM = 1, P_PROD = 2, P_ATOM = 3;
const box = (h, tall) => ({ h, p:P_ATOM, tall:!!tall });

/** число; pi и e ядро подставляет значением — возвращаем им имя обратно */
function numHTML(v) {
  if (v === Math.PI) return '<span class="cn">π</span>';
  if (v === Math.E) return '<i class="cn">e</i>';
  const a = Math.abs(v);
  if (a && (a < 1e-4 || a >= 1e6)) {
    const p = v.toExponential(3).split('e');
    return (+p[0]) + '·10<sup>' + (+p[1]) + '</sup>';
  }
  return String(+v.toPrecision(12));
}

/** скобки: обычные — глифом, вокруг этажерки — рисованные под высоту */
function paren(x) {
  if (!x.tall) return box('<span class="pn">(</span>' + x.h + '<span class="pn">)</span>');
  return box('<span class="grp"><span class="dlm" data-d="("></span><span class="gb">' +
             x.h + '</span><span class="dlm" data-d=")"></span></span>', true);
}
const wrap = (x, need) => x.p < need ? paren(x) : x;

function mathNode(n, F) {
  switch (n.k) {
    case 'num':  return box(numHTML(n.v));
    case 'x':    return box('<i class="cn">x</i>');
    case 'time': return box('<i class="cn">t</i>');
    case 'imag': return box('<i class="cn">i</i>');
    case 'par':  return box('<i>' + escHTML(GREEK[n.name] || n.name) + '</i>');
    case 'd': {
      const sub = n.dt ? 't'.repeat(n.dt) : 'x'.repeat(n.dx);
      return box('<b style="color:' + fieldColor(n.f, F) + '">' + n.f +
                 (sub ? '<sub>' + sub + '</sub>' : '') + '</b>');
    }
    case 'add': case 'sub': {
      const a = mathNode(n.a, F);
      let b = mathNode(n.b, F);
      /* «a − (b − c)» и «a + (−b)» без скобок читались бы неверно */
      if (n.b.k === 'neg' || (n.k === 'sub' && b.p < P_PROD)) b = paren(b);
      return { h: a.h + '<span class="bo">' + (n.k === 'add' ? '+' : '−') + '</span>' + b.h,
               p:P_SUM, tall:a.tall || b.tall };
    }
    case 'neg': {
      const a = wrap(mathNode(n.a, F), P_PROD);
      return { h:'<span class="un">−</span>' + a.h, p:P_PROD, tall:a.tall };
    }
    case 'mul': {
      const a = wrap(mathNode(n.a, F), P_PROD), b = wrap(mathNode(n.b, F), P_PROD);
      /* «6u²», «2π» — числу множитель дописывается вплотную, остальное через «·» */
      const dot = n.a.k === 'num' && n.b.k !== 'num' ? '' : '<span class="mu">·</span>';
      return { h:a.h + dot + b.h, p:P_PROD, tall:a.tall || b.tall };
    }
    case 'div': {
      const a = mathNode(n.a, F), b = mathNode(n.b, F);
      return { h:'<span class="frac"><span class="fnum">' + a.h + '</span>' +
                  '<span class="fden">' + b.h + '</span></span>', p:P_ATOM, tall:true };
    }
    case 'pow': {
      const a = mathNode(n.a, F), e = mathNode(n.b, F);
      const base = (a.p < P_ATOM || a.tall) ? paren(a) : a;
      return { h: base.h + '<sup>' + e.h + '</sup>', p:P_ATOM, tall:base.tall };
    }
    case 'fn': {
      const a = mathNode(n.a, F);
      /* корень — знаком радикала: путь считается по высоте, поэтому дробь под ним
         тоже накрывается целиком */
      if (n.name === 'sqrt')
        return { h:'<span class="rt"><span class="dlm" data-d="√"></span>' +
                    '<span class="rb">' + a.h + '</span></span>', p:P_ATOM, tall:true };
      return box('<span class="fnm">' + n.name + '</span>' + paren(a).h, a.tall);
    }
    default: return box('?');
  }
}

/** одно уравнение целиком (обе части) */
function mathEq(src, fields) {
  const eq = parseOne(src, fields);
  const l = mathNode(eq.lhs, fields).h;
  return eq.rhs ? l + '<span class="eqs">=</span>' + mathNode(eq.rhs, fields).h : l;
}

/** уравнения по строкам; комментарии («# …») сохраняются */
function eqLines(text, html) {
  /* строки режутся до tokenize: «;» — разделитель уравнений, а не токен ядра */
  const raws = text.split(/[\n;]+/).map(s => s.trim()).filter(s => s);
  let fields = [];
  try { fields = scanFields(raws.join('\n')); } catch (e) { return null; }
  const out = [];
  for (const line of raws) {
    const h = line.indexOf('#');
    const code = (h >= 0 ? line.slice(0, h) : line).trim();
    const cmt = h >= 0 ? line.slice(h).trim() : '';
    let f = '';
    /* недописанное уравнение не форматируется вовсе — показываем как есть */
    if (code) {
      if (!html) f = renderLine(code);
      else { try { f = mathEq(code, fields); } catch (e) { f = escHTML(code); } }
    }
    const c = cmt ? (html ? '<span class="cm">' + escHTML(cmt) + '</span>' : cmt) : '';
    out.push(f && c ? f + '  ' + c : f || c);
  }
  return out;
}

/** канонический текст для поля ввода; при непонятном тексте — вернуть как есть */
function formatEq(text) {
  const ls = eqLines(text, false);
  return ls && ls.length ? ls.join('\n') : text;
}

/** формула для превью: система нескольких уравнений собирается под скобкой */
function prettyEq(text) {
  const ls = eqLines(text, true);
  if (!ls || !ls.length) return escHTML(text);
  const body = ls.map(l => '<div class="pl">' + l + '</div>').join('');
  if (ls.length < 2) return '<div class="peq">' + body + '</div>';
  return '<div class="peq"><span class="brace dlm" data-d="{"></span>' +
         '<div class="pls">' + body + '</div></div>';
}

/* ---------- рисованные скобки ----------
   Путь считается в пикселях по уже измеренной высоте, поэтому линия везде одной
   толщины, а скобка садится ровно по содержимому. Глиф «{», растянутый
   font-size'ом, этого не умеет: он ехал по вертикали и тяжелел вместе с ростом. */
function delimPath(kind, W, H) {
  const t = 1.2, b = H - 1.2, mid = H/2, w = W - 1.2;
  if (kind === '{') {
    const s = w*0.62, r = Math.max(2, Math.min(9, (mid - t)*0.9));
    return 'M' + w + ' ' + t + 'Q' + s + ' ' + t + ' ' + s + ' ' + (t + r) +
           'L' + s + ' ' + (mid - r) + 'Q' + s + ' ' + mid + ' 0.9 ' + mid +
           'Q' + s + ' ' + mid + ' ' + s + ' ' + (mid + r) +
           'L' + s + ' ' + (b - r) + 'Q' + s + ' ' + b + ' ' + w + ' ' + b;
  }
  if (kind === '(' || kind === ')') {
    const d = Math.min(w*0.8, H*0.13)*1.33;              // выгиб дуги
    const x0 = kind === '(' ? w : 1.2, xc = kind === '(' ? w - d : 1.2 + d;
    return 'M' + x0 + ' ' + t + 'C' + xc + ' ' + (t + H*0.26) + ' ' +
           xc + ' ' + (b - H*0.26) + ' ' + x0 + ' ' + b;
  }
  return 'M0 ' + (H*0.55) + 'L' + (w*0.3) + ' ' + (H*0.47) +      // √
         'L' + (w*0.6) + ' ' + b + 'L' + w + ' 0.6';             // 0.6 — впритык к черте сверху
}

/** дорисовать скобки в готовой (уже размеченной) формуле */
function fitMath(root) {
  for (const el of root.querySelectorAll('.dlm')) {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) continue;
    el.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h +
                   '"><path d="' + delimPath(el.dataset.d, w, h) + '"/></svg>';
  }
}

/* ---------- раскраска поля ввода ----------
   Подложка #eqhl держит копию текста, раскрашенную по токенам ядра: поля — цветом
   своей кривой, хвост производной тем же цветом побледнее, константы, функции,
   числа и комментарии — своими. Текст обязан совпадать с текстом поля символ
   в символ, иначе раскраска уедет относительно каретки. */
function eqSegments(text) {
  let fields = [];
  try { fields = scanFields(text); } catch (e) {}
  const segs = [];
  const push = (a, b, cls, color) => { if (b > a) segs.push({ a, b, cls, color }); };

  const code = (src, off) => {
    let toks;
    /* до места ошибки текст всё равно раскрашивается — человек его как раз правит */
    try { toks = tokenize(src); }
    catch (e) { try { toks = tokenize(src.slice(0, e.pos)); } catch (e2) { return; } }
    for (let i = 0; i < toks.length && toks[i].t !== 'end'; i++) {
      const tk = toks[i], v = tk.v;
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
function hlHTML(text, e) {
  let a = -1, b = -1;
  if (e && e.pos !== undefined) {
    a = clamp(e.pos, 0, text.length);
    b = clamp(a + (e.len || 1), a, text.length);
  }
  const parts = [];
  let pos = 0;
  for (const s of eqSegments(text)) {
    if (s.a > pos) parts.push({ a:pos, b:s.a });
    parts.push(s); pos = s.b;
  }
  if (pos < text.length) parts.push({ a:pos, b:text.length });

  const cuts = [];                       // куски рвутся по границам ошибки
  for (const p of parts) {
    let s = p.a;
    for (const q of [a, b]) if (q > s && q < p.b) { cuts.push({ p, a:s, b:q }); s = q; }
    cuts.push({ p, a:s, b:p.b });
  }
  let out = '', open = false;
  const mark = at => {
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
function autosizeEq() {
  const el = $('eq');
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight + 2) + 'px';   // +2 — рамка (box-sizing:border-box)
}

$('eq').addEventListener('input', () => { autosizeEq(); syncEqUI(); validate(); });
$('eq').addEventListener('scroll', () => { $('eqhl').scrollTop = $('eq').scrollTop; });

/* ================= всплывающие подсказки ================= */
const tip = $('tip');
let tipFor = null, tipTimer = 0;

function placeTip(el) {
  const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect(), gap = 9;
  tip.classList.remove('up','dn','lf');
  /* в правой панели подсказка уходит влево от всей панели — иначе закрывает соседние кнопки */
  const panel = el.closest('aside');
  const edge = panel ? panel.getBoundingClientRect().left : 0;
  if (panel && edge - t.width - gap >= 6) {
    const top = clamp(r.top + r.height/2 - t.height/2, 6, Math.max(6, innerHeight - t.height - 6));
    tip.style.left = (edge - t.width - gap) + 'px';
    tip.style.top = top + 'px';
    tip.classList.add('lf');
    tip.style.setProperty('--ay', clamp(r.top + r.height/2 - top, 12, t.height - 12) + 'px');
    return;
  }
  const up = r.top - t.height - gap >= 6;
  const left = clamp(r.left + r.width/2 - t.width/2, 6, Math.max(6, innerWidth - t.width - 6));
  tip.style.left = left + 'px';
  tip.style.top = (up ? r.top - t.height - gap : r.bottom + gap) + 'px';
  tip.classList.add(up ? 'up' : 'dn');
  tip.style.setProperty('--ax', clamp(r.left + r.width/2 - left, 12, t.width - 12) + 'px');
}
function showTip(el) {
  const raw = el.getAttribute('data-tip') || '', i = raw.indexOf('|');
  tip.innerHTML = '<b></b><i></i>';
  tip.querySelector('b').textContent = i < 0 ? raw : raw.slice(0, i);
  tip.querySelector('i').textContent = i < 0 ? '' : raw.slice(i + 1);
  tip.classList.add('on');
  placeTip(el);
}
function hideTip() { clearTimeout(tipTimer); tip.classList.remove('on'); tipFor = null; }

document.addEventListener('pointerover', ev => {
  const el = ev.target.closest ? ev.target.closest('[data-tip]') : null;
  if (el === tipFor) return;
  clearTimeout(tipTimer);
  tipFor = el;
  if (!el) { tip.classList.remove('on'); return; }
  tipTimer = setTimeout(() => { if (tipFor === el) showTip(el); }, 130);
});
document.addEventListener('pointerdown', hideTip, true);
window.addEventListener('blur', hideTip);
document.querySelector('aside').addEventListener('scroll', hideTip);

/* На тачскрине наведения нет, а в подсказках лежит половина объяснений — что делает
   «крупный шаг», почему гашение меняет задачу. Поэтому долгое нажатие (420 мс)
   показывает ту же подсказку. Клик после долгого нажатия давится: иначе «подержать
   ▶, чтобы прочитать» заодно пускало бы счёт. Уход пальца больше чем на 10 px —
   это уже прокрутка панели, подсказку отменяем. */
let pressT = 0, pressX = 0, pressY = 0, pressShown = false;
const endPress = () => clearTimeout(pressT);

document.addEventListener('pointerdown', ev => {
  pressShown = false;
  if (ev.pointerType === 'mouse') return;
  const el = ev.target.closest ? ev.target.closest('[data-tip]') : null;
  if (!el) return;
  pressX = ev.clientX; pressY = ev.clientY;
  clearTimeout(pressT);
  pressT = setTimeout(() => { pressShown = true; tipFor = el; showTip(el); }, 420);
});
document.addEventListener('pointermove', ev => {
  if (ev.pointerType !== 'mouse' && Math.hypot(ev.clientX - pressX, ev.clientY - pressY) > 10)
    endPress();
});
document.addEventListener('pointerup', endPress);
document.addEventListener('pointercancel', endPress);
document.addEventListener('click', ev => {
  if (!pressShown) return;
  pressShown = false;
  ev.preventDefault(); ev.stopPropagation();     // capture: до обработчиков самой кнопки
}, true);

/* ================= кнопки сценариев ================= */

/** Сценарии есть у пресета, где уравнение одно, а поставленных опытов несколько
 *  (Шрёдингер). Строка появляется только у такого пресета: у остальных сценарий
 *  ровно один — сам пресет, и пустой ряд кнопок был бы враньём.
 *
 *  Кнопки перестраиваются только при смене пресета, а не на каждое нажатие
 *  клавиши: `syncEqUI` зовётся на любой ввод в поле, а рисовать три svg на
 *  каждую букву незачем. */
let scenOf = -2;                       // для какого пресета сейчас построены кнопки
function buildScen(idx) {
  const p = idx >= 0 ? PRESETS[idx] : null, box = $('scen');
  $('scenbox').style.display = p && p.sc ? '' : 'none';
  if (!p || !p.sc) { scenOf = -1; return; }
  if (scenOf !== idx) {
    scenOf = idx;
    box.innerHTML = '';
    p.sc.forEach((s, i) => {
      const b = document.createElement('button');
      b.dataset.sc = i;
      b.setAttribute('data-tip', s.name + '|' + s.tip);
      b.innerHTML = scenIcon(s.icon) + '<span>' + s.name + '</span>';
      box.appendChild(b);
    });
  }
  [...box.children].forEach((b, i) => b.classList.toggle('on', i === S.scen));
}
$('scen').addEventListener('click', e => {
  const b = e.target.closest('button[data-sc]'); if (!b) return;
  const i = +$('preset').value; if (i < 0) return;
  loadPreset(PRESETS[i], +b.dataset.sc);
});

/* ================= кнопки начальных данных ================= */
function buildTools() {
  const box = $('tools');
  box.innerHTML = '';
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.dataset.tool = t.id;
    b.setAttribute('data-tip', t.name + '|' + t.tip);
    b.className = t.id === S.tool ? 'on' : '';
    b.innerHTML = toolIcon(t.id);
    box.appendChild(b);
  }
}
buildTools();

/* ================= мышь ================= */
function localPos(ev) {
  const r = plot.getBoundingClientRect();
  return { px: ev.clientX - r.left, py: ev.clientY - r.top };
}

/** пока кнопка мыши нажата, счёт стоит: иначе профиль уезжает из-под курсора,
    а в режиме «рисовать на ходу» правка ложится на уже другое решение.
    После отпускания счёт возвращается, если шёл. */
function pauseForDraw() {
  S.wasRunning = S.running;
  if (S.running) { S.running = false; syncPlay(); }
}
function resumeAfterDraw() {
  if (S.wasRunning && !S.dead) { S.running = true; syncPlay(); }
  S.wasRunning = false;
}

plot.addEventListener('pointerdown', ev => {
  pauseForDraw();
  try { plot.setPointerCapture(ev.pointerId); } catch (e) {}
  const { px, py } = localPos(ev);
  const add = S.add || ev.altKey;
  S.base = add ? Float64Array.from(sim.getU(S.sel)) : new Float64Array(sim.N);
  S.vis[S.sel] = true;
  if (S.tool === 'pen') {
    S.drag = { pen:true, lastPx:px, lastPy:py };
    const u = Float64Array.from(S.base);
    penDot(u, px, py, px, py);
    sim.setU(S.sel, u);
  } else if (S.tool === 'noise') {
    const u = Float64Array.from(S.base);
    const n = makeProfile({ tool:'noise', A:Math.abs(py2u(py)) || 0.3 });
    for (let j = 0; j < sim.N; j++) u[j] += n[j];
    S.drag = null; commit(u, S.live); return;
  } else {
    S.drag = { px0:px, py0:py, x0:px2x(px), A:py2u(py), w:S.width };
    applyDrag();
  }
  draw();
});

plot.addEventListener('pointermove', ev => {
  if (!S.drag) return;
  const { px, py } = localPos(ev);
  if (S.drag.pen) {
    const u = Float64Array.from(sim.getU(S.sel));
    penDot(u, S.drag.lastPx, S.drag.lastPy, px, py);
    S.drag.lastPx = px; S.drag.lastPy = py;
    sim.setU(S.sel, u);
  } else {
    S.drag.A = py2u(py);
    if (Math.abs(px - S.drag.px0) > 6) {
      S.drag.w = Math.max(sim.L/sim.N*1.5, Math.abs(px2x(px) - S.drag.x0));
      $('wid').value = S.drag.w.toFixed(2);
    }
    applyDrag();
  }
  draw();
});

plot.addEventListener('pointerup', () => {
  resumeAfterDraw();                    // до выхода: «шум» рисуется в pointerdown и S.drag не ставит
  if (!S.drag) return;
  S.drag = null;
  if (S.tool !== 'pen') S.width = +$('wid').value;
  commit(Float64Array.from(sim.getU(S.sel)), S.live);
});
plot.addEventListener('pointercancel', resumeAfterDraw);

plot.addEventListener('wheel', ev => {
  ev.preventDefault();
  S.width = clamp(S.width*Math.exp(-ev.deltaY*0.0015), sim.L/sim.N, sim.L/2);
  $('wid').value = S.width.toFixed(2);
  if (S.drag && !S.drag.pen) { S.drag.w = S.width; applyDrag(); draw(); }
}, { passive:false });

function applyDrag() {
  const d = S.drag, N = sim.N, u = new Float64Array(N);
  const p = makeProfile({ tool:S.tool, x0:d.x0, A:d.A, w:d.w, edge:S.edge });
  for (let j = 0; j < N; j++) u[j] = S.base[j] + p[j];
  sim.setU(S.sel, u);
}

function penDot(u, px0, py0, px1, py1) {
  const steps = Math.max(1, Math.round(Math.abs(px1-px0)));
  for (let s = 0; s <= steps; s++) {
    const q = s/steps;
    const x = px2x(px0 + (px1-px0)*q), val = py2u(py0 + (py1-py0)*q);
    let j = Math.round((x + sim.L/2)/sim.L*sim.N);
    j = ((j % sim.N) + sim.N) % sim.N;
    u[j] = val;
    if (steps > 1) u[(j+1) % sim.N] = val;
  }
}

/* ================= кнопки ================= */
/* data-icon — то, по чему видно состояние кнопки снаружи (в том числе тесту):
   у svg нет textContent, а раньше проверяли именно его */
function syncPlay(){
  const k = S.running ? 'pause' : 'play';
  $('play').dataset.icon = k;
  $('play').innerHTML = ICON[k];
  $('play').classList.toggle('on', S.running);
}
$('stepb').innerHTML = ICON.step;
$('reset').innerHTML = ICON.reset;
$('apply').innerHTML = ICON.apply;

function setSmooth(on) {
  S.smooth = !!on;
  sim.smooth = S.smooth ? 1 : 0;
  $('smooth').classList.toggle('on', S.smooth);
}
$('smooth').onclick = () => setSmooth(!S.smooth);

$('play').onclick = () => { if (S.dead) return; S.running = !S.running; syncPlay(); };
$('stepb').onclick = () => {
  if (S.dead) return;
  // шаг — это «посмотреть по кадрам», поэтому он сначала останавливает счёт:
  // иначе кадр анимации тут же затирает то, что хотели разглядеть
  if (S.running) { S.running = false; syncPlay(); }
  const t0 = sim.t;
  for (let i = 0; i < S.spf; i++) sim.step();
  lastFrameDt = sim.t - t0;
  if (!sim.diagnostics().finite) { S.dead = true; syncPlay(); }
  pushRow(); draw(); updateDiag();
};
$('reset').onclick = () => {
  S.running = false; syncPlay();          // сброс всегда ставит на паузу: иначе t=0 промелькнёт
  for (let c = 0; c < sim.M; c++) if (S.ic[c]) sim.setU(c, S.ic[c], S.icI[c]);
  sim.t = 0; S.dead = false; clearXT(); refreshDt(true); draw();
};
$('zero').onclick = () => commit(new Float64Array(sim.N), false);
$('rand').onclick = () => commit(makeProfile({ tool:'noise', A:0.5 }), false);

$('apply').onclick = () => applySystem($('eq').value, sim.model ? sim.model.params : {});
$('eq').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('apply').click(); }
});

$('tools').addEventListener('click', e => {
  const b = e.target.closest('button[data-tool]'); if (!b) return;
  S.tool = b.dataset.tool;
  [...$('tools').children].forEach(x => x.classList.toggle('on', x === b));
});

$('spf').oninput = () => { S.spf = clamp(+$('spf').value|0, 1, 2000); syncSpeed(); };
$('dt').oninput = () => { const v = +$('dt').value; if (v > 0) { S.autodt = false; $('autodt').checked = false; sim.setDt(v); } };
$('autodt').onchange = () => { S.autodt = $('autodt').checked; refreshDt(true); };
$('coarsedt').onchange = () => { S.coarse = $('coarsedt').checked; refreshDt(true); };

/* ================= скорость ================= */
/** «×1» — не 6 шагов, а темп, который задал пресет (`S.baseSpf`): у КдФ это 10,
 *  у волнового 10, по умолчанию 6. Иначе после загрузки пресета ни одна кнопка
 *  не была бы подсвечена. Точность от множителя не зависит вовсе — это только
 *  число шагов на кадр, а кадр всё равно обрывается по бюджету. */
const SPEEDS = [1, 2, 5, 10, 25, 50];

function buildSpeed() {
  $('speed').innerHTML = SPEEDS.map(k =>
    '<button data-k="' + k + '">×' + k + '</button>').join('');
  syncSpeed();
}
function syncSpeed() {
  for (const b of $('speed').children)
    b.classList.toggle('on', S.spf === Math.round(S.baseSpf * +b.dataset.k));
}
$('speed').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]'); if (!b) return;
  S.spf = clamp(Math.round(S.baseSpf * +b.dataset.k), 1, 2000);
  $('spf').value = S.spf;
  syncSpeed();
});
buildSpeed();
$('k0').oninput = () => S.k0 = +$('k0').value || 0;
$('wid').oninput = () => S.width = Math.max(1e-3, +$('wid').value);
$('edge').oninput = () => S.edge = Math.max(1e-3, +$('edge').value);
$('addm').onchange = () => S.add = $('addm').checked;
$('live').onchange = () => S.live = $('live').checked;
$('autoy').onchange = () => S.autoY = $('autoy').checked;
$('showic').onchange = () => S.showIC = $('showic').checked;
$('ymin').oninput = () => { S.yMin = +$('ymin').value; S.autoY = false; $('autoy').checked = false; };
$('ymax').oninput = () => { S.yMax = +$('ymax').value; S.autoY = false; $('autoy').checked = false; };

function regrid() {
  const N = +$('N').value, L = Math.max(0.1, +$('L').value);
  const oldN = sim.N;
  const old = sim.model.comps.map(c => Float64Array.from(sim.getU(c.ci)));
  const oldI = sim.model.comps.map(c => c.complex ? Float64Array.from(sim.getUi(c.ci)) : null);
  sim.resize(N, L);
  // пересадка на новую сетку линейной интерполяцией — мнимую часть тем же приёмом,
  // иначе смена N у комплексного поля стирала бы фазу
  const resample = src => {
    const out = new Float64Array(N);
    for (let j = 0; j < N; j++) {
      const q = j*oldN/N, i0 = Math.floor(q) % oldN, f = q - Math.floor(q);
      out[j] = src[i0]*(1-f) + src[(i0+1)%oldN]*f;
    }
    return out;
  };
  for (let c = 0; c < sim.M; c++)
    setIC(c, resample(old[c]), oldI[c] ? resample(oldI[c]) : null);
  clearXT(); refreshDt(true); draw();
}
$('N').onchange = regrid;
$('L').onchange = regrid;

window.addEventListener('keydown', e => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.target.id === 'presetbtn') return;   // на кнопке списка пробел открывает список
  if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
  if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') $('reset').click();
});

/* ================= пресеты ================= */
const sel = $('preset');
/* первым пунктом — «своё уравнение»: выбрать нельзя, но он показывается,
   как только текст в поле перестал совпадать с каким-либо пресетом */
const own = document.createElement('option');
own.value = '-1'; own.textContent = '— своё уравнение —'; own.disabled = true;
sel.appendChild(own);
PRESETS.forEach((p, i) => {
  const o = document.createElement('option'); o.value = i; o.textContent = p.name; sel.appendChild(o);
});
sel.onchange = () => { const i = +sel.value; if (i >= 0) loadPreset(PRESETS[i]); };

/* --- свой выпадающий список: нужен ради превью по наведению --- */
const pbtn = $('presetbtn'), plist = $('plist'), eqprev = $('eqprev');
let hiIdx = -1;

const isOpen = () => plist.classList.contains('on');
const itemAt = i => plist.children[i];

function syncPresetBtn() {
  const i = +sel.value;
  pbtn.textContent = i >= 0 ? PRESETS[i].name : '— своё уравнение —';
}

PRESETS.forEach((p, i) => {
  const d = document.createElement('div');
  d.className = 'pitem'; d.dataset.i = i;
  d.innerHTML = '<span class="nm"></span>' + chipRow(i);
  d.querySelector('.nm').textContent = p.name;   // имя — текстом, значки — рядом справа
  plist.appendChild(d);
});

/** превью формулы — справа от списка, по вертикали у самого пункта.
    На телефоне справа места нет, поэтому превью ложится внизу экрана во всю
    ширину и получает кнопку «выбрать»: тап по пункту показывает формулу, а не
    применяет её сразу — иначе вёрстку формулы на телефоне никто бы не увидел. */
/** Расшифровка значков под формулой: значок сам по себе — ребус, а место, где на
    него смотрят, ровно одно — превью. «Система» не раскрывается: что уравнений
    несколько, видно по самой формуле строкой выше. */
function chipWhy(i) {
  const rows = FX[i].filter(c => c.why);
  if (!rows.length) return '';
  return '<div class="fxwhy">' + rows.map(c =>
    '<div>' + chipIcon(c.id) + '<span><b>' + c.name + '</b> — ' + c.why + '</span></div>').join('') +
    '</div>';
}

const PREV_GAP = 8;                    // зазор между низом списка и верхом превью

function showPrev(i) {
  const el = itemAt(i); if (!el) return;
  const phone = mob.matches;
  /* Заголовок — имя пресета: в списке и на кнопке длинное имя обрезается
     многоточием («Опрокидывание горба (Бюргерс без…»), и целиком его негде
     прочитать. В превью оно переносится и видно полностью. */
  eqprev.innerHTML = '<div class="ttl">' + escHTML(PRESETS[i].name) + '</div>' +
    prettyEq(PRESETS[i].eq) + chipWhy(i) +
    (phone ? '<button class="pick" data-i="' + i + '">выбрать</button>' : '');
  fitMath(eqprev);                     // скобки рисуются по уже измеренной высоте
  eqprev.classList.toggle('phone', phone);
  eqprev.classList.add('on');
  if (phone) {                         // место и размер задаёт CSS, инлайн — снять
    eqprev.style.left = ''; eqprev.style.top = '';
    /* Превью лежит внизу экрана, список раскрывается сверху — и они налезали друг
       на друга: у длинной формулы с расшифровкой фишек превью съедало нижние
       пункты. Высота превью зависит от пресета, поэтому потолок списка считается
       по факту, от измеренного верхнего края превью, а не задаётся в CSS числом. */
    const top = eqprev.getBoundingClientRect().top;
    plist.style.maxHeight = Math.max(90, top - PREV_GAP - plist.getBoundingClientRect().top) + 'px';
    el.scrollIntoView({ block:'nearest' });   // список ужался — пункт под пальцем не прятать
    return;
  }
  const lr = plist.getBoundingClientRect(), ir = el.getBoundingClientRect();
  const w = eqprev.offsetWidth, h = eqprev.offsetHeight;
  const right = lr.right + 10;
  eqprev.style.left = (right + w + 8 <= innerWidth ? right
                       : Math.max(8, lr.left - w - 10)) + 'px';
  eqprev.style.top = clamp(ir.top - 10, 8, Math.max(8, innerHeight - h - 8)) + 'px';
}
function hidePrev() {
  eqprev.classList.remove('on');
  plist.style.maxHeight = '';          // потолок был подогнан под превью — вернуть в CSS
}

function markHi() {
  [...plist.children].forEach((el, i) => {
    el.classList.toggle('hi', i === hiIdx);
    el.classList.toggle('cur', i === +sel.value);
  });
  if (hiIdx >= 0) showPrev(hiIdx); else hidePrev();
}

function openList(on) {
  plist.classList.toggle('on', on);
  pbtn.classList.toggle('open', on);
  hiIdx = on ? +sel.value : -1;
  markHi();
  if (on && hiIdx >= 0) itemAt(hiIdx).scrollIntoView({ block:'nearest' });
}

function choose(i) {
  openList(false);
  pbtn.blur();                       // чтобы пробел сразу пускал счёт, а не открывал список
  sel.value = String(i);
  sel.dispatchEvent(new Event('change'));
}

pbtn.onclick = () => openList(!isOpen());
plist.addEventListener('pointerover', e => {
  const it = e.target.closest('.pitem');
  if (it) { hiIdx = +it.dataset.i; markHi(); }
});
// на телефоне палец уходит с пункта сразу после тапа — превью не должно гаснуть
plist.addEventListener('pointerleave', () => { if (!mob.matches) hidePrev(); });
plist.addEventListener('click', e => {
  const it = e.target.closest('.pitem');
  if (!it) return;
  const i = +it.dataset.i;
  /* Телефон: тап по пункту только показывает формулу, применяет её одна кнопка —
     «выбрать» в превью. Раньше повторный тап по тому же пункту тоже применял, и
     список закрывался под пальцем у того, кто просто листал задачи и вернулся
     к уже открытой: выбор происходил там, где его не просили. */
  if (mob.matches) { hiIdx = i; markHi(); return; }
  choose(i);
});
eqprev.addEventListener('click', e => {
  const b = e.target.closest('.pick');
  if (b) choose(+b.dataset.i);
});
document.addEventListener('pointerdown', e => {
  // превью с кнопкой «выбрать» лежит вне #presetbox — по нему список не закрываем,
  // иначе кнопка исчезнет из-под пальца ещё до click
  if (isOpen() && !$('presetbox').contains(e.target) && !eqprev.contains(e.target))
    openList(false);
});
pbtn.addEventListener('keydown', e => {
  if (e.key === 'Escape') { openList(false); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!isOpen()) { openList(true); return; }
    hiIdx = clamp((hiIdx < 0 ? +sel.value : hiIdx) + (e.key === 'ArrowDown' ? 1 : -1),
                  0, PRESETS.length - 1);
    markHi(); itemAt(hiIdx).scrollIntoView({ block:'nearest' });
    return;
  }
  if (isOpen() && (e.key === 'Enter' || e.code === 'Space')) {
    e.preventDefault();
    if (hiIdx >= 0) choose(hiIdx);
  }
});

/** Грузит пресет; `si` — номер сценария у пресетов со списком `sc`. Сценарий
 *  накладывается поверх пресета (`ic`, `N`, `y`, `k0` — его), поэтому дальше
 *  везде читается `cfg`, а не `p`: общее написано в пресете один раз. */
function loadPreset(p, si) {
  S.running = false; syncPlay();
  const idx = PRESETS.indexOf(p); if (idx >= 0) { sel.value = idx; syncPresetBtn(); }
  S.scen = p.sc ? clamp(si | 0, 0, p.sc.length - 1) : -1;
  const cfg = p.sc ? Object.assign({}, p, p.sc[S.scen]) : p;
  $('N').value = cfg.N; $('L').value = cfg.L;
  sim.resize(cfg.N, cfg.L);
  $('eq').value = cfg.eq;
  autosizeEq();
  S.sel = 0; S.ic = []; S.icI = []; S.vis = [];
  S.k0 = cfg.k0 || 0; $('k0').value = S.k0;
  if (!applySystem(cfg.eq, Object.assign({}, cfg.p || {}))) return;
  S.autodt = true; $('autodt').checked = true;
  S.yMin = cfg.y[0]; S.yMax = cfg.y[1];
  $('ymin').value = S.yMin; $('ymax').value = S.yMax;
  for (const comp of sim.model.comps) {
    const d = cfg.ic[comp.name];
    const q = d ? makeIC(Object.assign({ x0:0, edge:S.edge }, d), comp.complex)
                : { re:new Float64Array(sim.N), im:null };
    setIC(comp.ci, q.re, q.im);
  }
  const first = cfg.ic[sim.model.comps[0].name];
  if (first && first.tool) {
    S.tool = first.tool === 'noise' ? 'sech' : first.tool;
    S.width = first.w || S.width; $('wid').value = S.width;
    [...$('tools').children].forEach(x => x.classList.toggle('on', x.dataset.tool === S.tool));
  }
  if (cfg.vis) for (const c of sim.model.comps) if (c.name in cfg.vis) S.vis[c.ci] = cfg.vis[c.name];
  if (cfg.sel) { const c = sim.model.comps.find(q => q.name === cfg.sel); if (c) S.sel = c.ci; }
  // темп пресета — это и есть «×1»: скорость всегда сбрасывается вместе с задачей
  S.baseSpf = cfg.spf || 6; S.spf = S.baseSpf; $('spf').value = S.spf; syncSpeed();
  setSmooth(!!cfg.smooth);
  buildLegend(sim.model);
  buildScen(idx);                      // подсветить выбранный сценарий
  sim.t = 0; clearXT();
  // у некоторых задач автоподбор dt (он рассчитан на адвекцию u·ux) слишком осторожен
  S.autodt = !cfg.fixdt; $('autodt').checked = S.autodt;
  sim.setDt(cfg.dt); $('dt').value = cfg.dt;
  draw();
}

/* ================= телефон: шторка настроек ================= */

/** Пульт стоит в нижней строке всегда и никуда не переезжает. Переезжает
    скорость: на телефоне шесть кнопок «×N» в строку не влезают, и `#speedbox`
    уходит в шторку. Переезжает сам узел, а не копия: `syncSpeed`, обработчик
    кликов и тесты работают с тем же `#speed` и про переезд ничего не знают.
    Копия была бы вторым источником правды — подсветку текущего множителя
    пришлось бы держать в двух местах. */
function relayout() {
  const spd = $('speedbox'), home = mob.matches ? $('spdhome') : $('barspd');
  if (spd.parentNode !== home) home.appendChild(spd);
  syncCxUI();                                 // текст подсказки зависит и от экрана, и от поля
  if (!mob.matches) openSheet(false);         // вернулись на десктоп — панель снова на месте
}

const aside = document.querySelector('aside');
const sheetOpen = () => aside.classList.contains('open');
function openSheet(on) {
  aside.classList.toggle('open', on);
  $('scrim').classList.toggle('on', on);
  $('gear').classList.toggle('on', on);
  hideTip();
}
$('gear').onclick = () => openSheet(!sheetOpen());
$('scrim').onclick = () => openSheet(false);
$('sheetx').onclick = () => openSheet(false);
mob.addEventListener('change', () => { relayout(); fitCanvas(); draw(); });

/* ================= старт ================= */
relayout();
/* холст меняет размер не только вместе с окном: появилась строка ошибки — выросла
   шапка, открылась шторка, вылезла экранная клавиатура. ResizeObserver ловит все
   случаи одинаково, вместо ручного fitCanvas() из каждого такого места. */
new ResizeObserver(() => { fitCanvas(); draw(); }).observe($('pw'));
window.addEventListener('resize', () => { fitCanvas(); autosizeEq(); draw(); });
fitCanvas();
loadPreset(PRESETS[0]);
syncPlay();
requestAnimationFrame(frame);

window.__difur = { S, sim, PRESETS, FX, MOB, loadPreset, px2x, py2u, x2px, u2py, applySystem,
                   prettyEq, fitMath, formatEq, refreshDt, frameSteps,
                   setBudget: ms => stepBudgetMs = ms,
                   stepInfo: () => ({ done: stepsDone, sps: stepsPerSec }) };

})();
