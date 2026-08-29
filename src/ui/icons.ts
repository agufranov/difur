/* ================= рисованные картинки: инструменты, фишки, сценарии, пульт ================= */

/* форма для миниатюры: s ∈ [-1,1] -> значение (масштаб произвольный) */
const PEN_PTS = [[-1,.12],[-.72,.62],[-.5,.22],[-.16,.92],[.14,.34],[.46,.76],[.74,.28],[1,.55]];
export function toolShape(id: string, s: number): number {
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
export function toolIcon(id: string): string {
  const W = 60, H = 26, PAD = 4, n = id === 'pen' ? PEN_PTS.length*6 : 56;
  const v: number[] = [];
  let lo = 0, hi = 1;
  for (let i = 0; i < n; i++) {
    const y = toolShape(id, -1 + 2*i/(n-1));
    v.push(y); lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  const Y = (u: number) => (H-PAD - (u-lo)/(hi-lo)*(H-2*PAD)).toFixed(1);
  const X = (i: number) => (2 + i/(n-1)*(W-4)).toFixed(1);
  let d = '';
  for (let i = 0; i < n; i++) d += (i ? 'L' : 'M') + X(i) + ' ' + Y(v[i]);
  const zero = lo < 0 ? '<line class="zero" x1="1" y1="'+Y(0)+'" x2="'+(W-1)+'" y2="'+Y(0)+'"/>' : '';
  const nib = id === 'pen'
    ? '<circle cx="'+X(n-1)+'" cy="'+Y(v[n-1])+'" r="2.6" fill="currentColor"/>' : '';
  return '<svg viewBox="0 0 '+W+' '+H+'" aria-hidden="true">' + zero +
         '<path class="sh" d="' + d + '"/>' + nib + '</svg>';
}

/* ================= картинки фишек ================= */

export const sq = (v: number) => v*v;
export const sech2 = (s: number) => { const c = Math.cosh(s); return 1/(c*c); };

/** путь по параметрической кривой pt(s) ∈ [-1,1]² в коробке 14×14 */
export function spark(pt: (s: number) => [number, number], n: number): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const [px, py] = pt(-1 + 2*i/(n-1));
    d += (i ? 'L' : 'M') + (7 + px*6).toFixed(1) + ' ' + (7 - py*5.2).toFixed(1);
  }
  return d;
}

/* Та же угловая шкала, что у комплексной кривой: цвет по направлению — arg = 0
   красный, дальше против часовой стрелки. Круг раньше набирался 24 секторами
   (нативного конического градиента у SVG нет) — на экране это читалось радугой:
   грани между секторами видны даже на 14 пикселях. Честный градиент есть у CSS,
   и он доезжает до SVG через `<foreignObject>`; заодно это та же заливка, что у
   колечка фазы в легенде. Оттенки перечислены по убыванию и от `90deg`, потому
   что конический градиент идёт по часовой стрелке от севера, а arg растёт против
   часовой от востока. Шаг 30° взят не для гладкости (её даёт сам градиент), а
   потому что между соседними опорными цветами интерполяция идёт по sRGB, а не по
   тону: на длинных дугах она уводила бы цвет мимо шкалы. */
function phaseWheel(): string {
  const stops: string[] = [];
  for (let h = 360; h >= 0; h -= 30) stops.push('hsl(' + h + ' 85% 55%)');
  return '<foreignObject x="1" y="1" width="12" height="12">' +
    '<div class="phase-wheel" style="width:100%;height:100%;border-radius:50%;' +
    'background:conic-gradient(from 90deg,' + stops.join(',') + ')"></div>' +
    '</foreignObject>';
}

export const CHIP_ART: Record<string, string> = {
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
  cx:   phaseWheel() + '<path d="M7 7 10.4 3.6"/>',
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

export const chipIcon = (id: string) => '<svg class="chip" viewBox="0 0 14 14" aria-hidden="true">' +
                       CHIP_ART[id] + '</svg>';

/* ================= картинки сценариев ================= */

/* Иконка сценария — это его начальные данные: Re ψ(x, 0) по той же формуле, что
   уйдёт в поле. У неподвижного пакета это просто горб, у едущего — горб с
   заполнением, и частота заполнения и есть k₀ (ровно то, что видно цветом на
   графике). Одной кривой мало там, где вся суть в том, что будет дальше:
   у «расплывания» пунктиром пририсовано, каким горб станет, а у едущих пакетов —
   стрелка направления. Подписи словами («расплывание», «встреча») этого не
   показывают: две из трёх картинок иначе выглядели бы одинаково. */
const SCEN_ART: Record<string, { f: (s: number) => number; gh?: (s: number) => number;
                                 ar?: [number, number][] }> = {
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

export function scenIcon(id: string): string {
  const W = 62, H = 30, TOP = 3, BOT = 21, n = 120;   // ниже BOT — полоса под стрелки
  const a = SCEN_ART[id];
  const at = (i: number) => -1 + 2*i/(n-1);
  let lo = 0, hi = 0;
  for (let i = 0; i < n; i++)
    for (const f of [a.f, a.gh]) if (f) { const y = f(at(i)); lo = Math.min(lo,y); hi = Math.max(hi,y); }
  const Xn = (s: number) => 2 + (s+1)/2*(W-4);
  const X = (s: number) => Xn(s).toFixed(1);
  const Y = (u: number) => (BOT - (u-lo)/(hi-lo || 1)*(BOT-TOP)).toFixed(1);
  const path = (f: (s: number) => number) => {
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
export const ICON: Record<string, string> = {
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
