/* сценарий проверки интерфейса (запускается через tests/run.ps1 в headless Edge) */
(function(){
const R = [];
const ck = (n, ok, i) => R.push((ok?'PASS  ':'FAIL  ') + n + (i!==undefined ? '   ['+i+']' : ''));
const $ = id => document.getElementById(id);
const D = window.__difur;
const plot = $('plot');

function ev(type, x, y, alt){
  plot.dispatchEvent(new PointerEvent(type, {clientX:x, clientY:y, bubbles:true, pointerId:1, altKey:!!alt, buttons:1}));
}
const rect = () => plot.getBoundingClientRect();
function umax(c){ let m=0; const u=D.sim.getU(c===undefined?D.S.sel:c);
  for(let j=0;j<D.sim.N;j++) m=Math.max(m,Math.abs(u[j])); return m; }
/* как у человека: правка -> input (обновляет селект и «применить») -> кнопка */
function setEq(text){ $('eq').value = text; $('eq').dispatchEvent(new Event('input')); $('apply').click(); }
function drag(fracX, val, alt){
  const r = rect();
  ev('pointerdown', r.left + r.width*fracX, r.top + D.u2py(val), alt);
  ev('pointerup',   r.left + r.width*fracX, r.top + D.u2py(val), alt);
}

const steps = [];

steps.push(() => {
  ck('загрузка без ошибок', window.__errs.length===0, window.__errs.join(' | '));
  ck('стартовый пресет — КдФ', /uxxx/.test($('eq').value), $('eq').value);
  ck('одно поле u', D.sim.model.comps.map(c=>c.name).join()==='u', D.sim.model.comps.map(c=>c.name).join());
  ck('нач. условие: солитон max=3', Math.abs(umax(0)-3)<1e-6, umax(0).toFixed(6));
});

/* --- мышь: амплитуда/ширина/Alt --- */
steps.push(() => {
  const r = rect();
  $('tools').querySelector('[data-tool="gauss"]').click();
  ev('pointerdown', r.left + r.width*0.5, r.top + D.u2py(0));
  ev('pointermove', r.left + r.width*0.5 + 60, r.top + D.u2py(2));
  ev('pointerup',   r.left + r.width*0.5 + 60, r.top + D.u2py(2));
  ck('перетаскивание задаёт амплитуду', Math.abs(umax(0)-2)<0.02, 'max='+umax(0).toFixed(4));
  const wExp = 60/r.width*D.sim.L;
  ck('перетаскивание задаёт ширину', Math.abs(+$('wid').value - wExp)<0.01, 'w='+$('wid').value);
  ck('время сброшено', D.sim.t===0);
  const w0 = +$('wid').value;
  plot.dispatchEvent(new WheelEvent('wheel', {deltaY:-300, bubbles:true, cancelable:true}));
  ck('колесо меняет ширину', +$('wid').value > w0, w0.toFixed(2)+' -> '+$('wid').value);
});

steps.push(() => {
  $('tools').querySelector('[data-tool="sech"]').click();
  $('wid').value='2'; $('wid').dispatchEvent(new Event('input'));
  drag(0.3, 3);
  drag(0.7, 1, true);
  let peaks = 0; const u = D.sim.getU(0), N = D.sim.N;
  for (let j=0;j<N;j++){ const a=u[(j-1+N)%N], b=u[j], c=u[(j+1)%N]; if (b>a&&b>c&&b>0.5) peaks++; }
  ck('Alt складывает профили', peaks===2 && Math.abs(umax(0)-3)<0.05, 'пиков='+peaks+' max='+umax(0).toFixed(3));
});

/* --- счёт и диаграмма --- */
steps.push(() => {
  $('play').click(); ck('пуск включается', D.S.running);
  $('stepb').click();                      // шаг сам ставит на паузу: см. docs/ui.md
  ck('шаг останавливает счёт', !D.S.running && $('play').dataset.icon === 'play',
     'running=' + D.S.running + ' icon=' + $('play').dataset.icon);
  for (let i=0;i<8;i++) $('stepb').click();
  const d = D.sim.diagnostics();
  ck('время идёт', d.t>0, 't='+d.t.toFixed(4));
  ck('решение конечно', d.finite && d.per[0].max<10, 'max='+d.per[0].max.toFixed(3));
  const px = $('xt').getContext('2d').getImageData(0,399,1200,1).data;
  let bright=0; for(let i=0;i<px.length;i+=4) if(px[i]>40) bright++;
  ck('диаграмма x–t заполняется', bright>20, 'ярких='+bright);
});

/* --- utt: волновое уравнение --- */
steps.push(() => {
  setEq('utt = c^2*uxx');
  ck('utt принимается', $('err').textContent==='', $('err').textContent);
  ck('две компоненты u и ut', D.sim.model.comps.map(c=>c.name).join()==='u,ut',
     D.sim.model.comps.map(c=>c.name).join());
  ck('легенда рисует оба поля', $('legend').children.length===2, $('legend').textContent);
  const rng = $('pars').querySelector('input[type=range]');
  ck('параметр c с логарифмическим ползунком', /c/.test($('pars').textContent) && rng && rng.min==='-4',
     'min='+(rng||{}).min);
});

steps.push(() => {
  D.S.sel = 0;
  $('tools').querySelector('[data-tool="gauss"]').click();
  $('wid').value='2'; $('wid').dispatchEvent(new Event('input'));
  drag(0.5, 1);
  const rows = $('legend').children;
  rows[1].click();
  ck('клик по строке легенды выбирает ut', D.S.sel===1, 'sel='+D.S.sel);
  $('tools').querySelector('[data-tool="const"]').click();
  drag(0.5, 0.4);
  ck('ut задан константой 0.4', Math.abs(umax(1)-0.4)<0.02, 'max|ut|='+umax(1).toFixed(4));
  ck('u не затёрт', Math.abs(umax(0)-1)<0.02, 'max|u|='+umax(0).toFixed(4));
});

steps.push(() => {
  D.S.sel = 1;
  $('tools').querySelector('[data-tool="const"]').click();
  drag(0.5, 0);                       // ut = 0
  D.S.sel = 0;
  $('tools').querySelector('[data-tool="gauss"]').click();
  drag(0.5, 1);
  const u0 = Float64Array.from(D.sim.getU(0));
  for (let i=0;i<200;i++) D.sim.step();
  const d = D.sim.diagnostics();
  ck('волновое уравнение считается', d.finite && d.per[0].max<1.05, 'max='+d.per[0].max.toFixed(4));
  let moved = 0; const u = D.sim.getU(0);
  for (let j=0;j<D.sim.N;j++) moved = Math.max(moved, Math.abs(u[j]-u0[j]));
  ck('волна пошла', moved>0.1, 'Δ='+moved.toFixed(3));
});

/* --- система пользователя --- */
steps.push(() => {
  setEq('utt=-v*ut\nvt=-V*ut\nzt=-uvvxxux');
  ck('система из трёх уравнений принята', $('err').textContent==='', $('err').textContent);
  ck('компоненты u,ut,v,z', D.sim.model.comps.map(c=>c.name).join()==='u,ut,v,z',
     D.sim.model.comps.map(c=>c.name).join());
  ck('V — константа с ползунком', /V/.test($('pars').textContent));
  const cols = [...$('legend').children].map(c=>c.style.color);
  ck('поля разного цвета', new Set(cols).size===3, cols.join(' '));
});

steps.push(() => {
  const set = (ci, tool, val) => { D.S.sel = ci;
    $('tools').querySelector('[data-tool="'+tool+'"]').click(); drag(0.5, val); };
  // ut — отрицательная шапочка (не константа: иначе v останется однородным и vxx ≡ 0)
  set(0,'gauss',1); set(1,'gauss',-1); set(2,'const',0.3); set(3,'const',0);
  const ut0 = umax(1);
  for (let i=0;i<600;i++) D.sim.step();
  const d = D.sim.diagnostics();
  ck('система считается', d.finite, 'max='+d.max);
  ck('трение гасит ut', d.per[1].max < ut0, ut0.toFixed(3)+' -> '+d.per[1].max.toFixed(4));
  ck('z ожил', d.per[3].max>0, 'max|z|='+d.per[3].max.toExponential(2));
});

/* --- ползунок константы --- */
steps.push(() => {
  const rng = $('pars').querySelector('input[type=range]');
  const num = $('pars').querySelector('input[type=number]');
  rng.value = '-1'; rng.dispatchEvent(new Event('input'));
  ck('лог-ползунок: 10^-1', Math.abs(+num.value-0.1)<1e-9, 'V='+num.value);
  rng.value = '1'; rng.dispatchEvent(new Event('input'));
  ck('лог-ползунок: 10^1', Math.abs(+num.value-10)<1e-9, 'V='+num.value);
  $('pars').querySelector('button.sg').click();
  ck('кнопка ± меняет знак', +num.value===-10, 'V='+num.value);
  ck('модель увидела новое значение', D.sim.model.params.V===-10, 'V='+D.sim.model.params.V);
  ck('ползунки не пересобираются во время правки', $('pars').querySelector('input[type=range]')===rng);
  num.value='0.5'; num.dispatchEvent(new Event('input'));
  ck('ввод числа работает', D.sim.model.params.V===0.5, 'V='+D.sim.model.params.V);
});

/* --- разнос ловится --- */
steps.push(() => {
  const set = (ci, tool, val) => { D.S.sel = ci;
    $('tools').querySelector('[data-tool="'+tool+'"]').click(); drag(0.5, val); };
  set(1,'const',1); set(2,'const',0.3);   // ut > 0 => трение уходит в минус
  let dead = false;
  for (let b=0;b<400 && !dead;b++){ $('stepb').click(); dead = D.S.dead; }
  ck('разнос детектируется и счёт останавливается', dead, 't='+D.sim.t.toFixed(2));
  ck('в статусной строке есть сообщение', /разош/.test($('barmsg').textContent),
     $('barmsg').textContent.slice(0,60));
});

/* --- ошибки и предупреждения --- */
steps.push(() => {
  setEq('ut + u*ux + uxxx = 0');
  ck('возврат к КдФ', $('err').textContent==='');
  setEq('ut + qqq(u) = 0');
  ck('неизвестная «функция» -> предупреждение', /понято как умножение/.test($('warn').textContent),
     $('warn').textContent.slice(0,60));
  setEq('u + ux = 0');
  ck('нет производной по времени -> ошибка', /времени/.test($('err').textContent), $('err').textContent);
  setEq('ut + uxx = 0');
  ck('обратная диффузия -> предупреждение', /неустойчиво/.test($('warn').textContent), $('warn').textContent);
  setEq('ut = uxx');
  ck('предупреждение снимается', $('warn').textContent==='');
});

/* --- селект уравнений и кнопка «применить» --- */
steps.push(() => {
  D.loadPreset(D.PRESETS[0]);
  ck('после пресета «применить» неактивна', $('apply').disabled);
  ck('в селекте выбран КдФ', $('preset').value==='0', $('preset').value);
  const type = t => { $('eq').value = t; $('eq').dispatchEvent(new Event('input')); };
  type('ut + u*ux + uxxx = 0 ');
  ck('правка включает «применить»', !$('apply').disabled);
  type('ut = k*uxx + u');
  ck('незнакомый текст -> «своё уравнение»', $('preset').value==='-1', $('preset').value);
  type('ut  +  u*ux+uxxx=0');
  ck('знакомое уравнение узнаётся, пробелы не мешают', $('preset').value==='0', $('preset').value);
  $('apply').click();
  ck('после применения «применить» гаснет', $('apply').disabled);
  ck('уравнение применилось', $('err').textContent==='', $('err').textContent);
});

/* --- эргономика: фокус, сброс, высота поля, острова --- */
steps.push(() => {
  const btn = $('presetbtn'), list = $('plist');
  ck('на кнопке — имя текущего пресета', /Кортевег/.test(btn.textContent), btn.textContent);
  btn.click();
  ck('список открывается', list.classList.contains('on') && btn.classList.contains('open'));
  ck('пунктов столько же, сколько пресетов', list.children.length === D.PRESETS.length,
     list.children.length + ' vs ' + D.PRESETS.length);
  btn.focus();
  list.children[1].click();
  const norm = s => s.replace(/\s+/g, '');
  ck('клик по пункту грузит пресет',
     $('preset').value === '1' && norm($('eq').value) === norm(D.PRESETS[1].eq),
     'value=' + $('preset').value + ' eq=' + $('eq').value);
  ck('список закрывается после выбора', !list.classList.contains('on'));
  ck('фокус снят с кнопки (чтобы работал пробел)', document.activeElement !== btn,
     'active=' + (document.activeElement||{}).id);
  D.S.running = false;
  $('play').click();
  ck('пуск идёт', D.S.running);
  $('reset').click();
  // иконка теперь svg, состояние кнопки видно по data-icon (см. syncPlay)
  ck('сброс останавливает счёт', !D.S.running && $('play').dataset.icon === 'play',
     'running=' + D.S.running + ' значок=' + $('play').dataset.icon);
  ck('сброс вернул t=0', D.sim.t === 0, 't=' + D.sim.t);
});

/* --- пробел: только play/pause ---
   Синтетическое событие само по себе кнопку не нажмёт и страницу не пролистает,
   поэтому проверяется то, чем и то и другое гасится: defaultPrevented. Фокус при
   этом ставится на кнопки и ползунки — там пробел и уводил не туда. */
steps.push(() => {
  const space = el => {
    const e = new KeyboardEvent('keydown',
      { key:' ', code:'Space', bubbles:true, cancelable:true });
    el.dispatchEvent(e);
    return e.defaultPrevented;
  };
  D.S.running = false;
  const eaten = ['reset', 'plot', 'presetbtn'].filter(id => { $(id).focus(); return !space($(id)); });
  ck('пробел перехвачен и на кнопках, и на графике', eaten.length === 0, eaten.join(','));
  ck('пробел с кнопки запускает счёт', D.S.running);
  $('play').focus();
  space($('play'));
  ck('второй пробел останавливает', !D.S.running);

  const btn = $('presetbtn'), list = $('plist');
  btn.focus(); space(btn);
  ck('пробел на кнопке списка список не открывает', !list.classList.contains('on'));
  ck('он же переключил счёт', D.S.running);
  $('play').click();

  const eq = $('eq'), was = eq.value;
  eq.focus();
  ck('в поле уравнений пробел остаётся пробелом', !space(eq) && !D.S.running,
     'running=' + D.S.running);
  ck('текст уравнения не тронут', eq.value === was);
  eq.blur();
});

steps.push(() => {
  const eq = $('eq'), type = t => { eq.value = t; eq.dispatchEvent(new Event('input')); };
  type('ut = uxx');
  const h1 = eq.getBoundingClientRect().height;
  type('ut = uxx\nvt = vxx\nwt = wxx');
  const h3 = eq.getBoundingClientRect().height;
  ck('высота поля растёт с числом строк', h3 > h1 + 20, h1.toFixed(0) + ' -> ' + h3.toFixed(0) + 'px');
  ck('трёхстрочное поле примерно втрое выше однострочного',
     Math.abs(h3 - 3*(h1 - 16) - 16) < 12, 'h1=' + h1.toFixed(0) + ' h3=' + h3.toFixed(0));
  type('ut = uxx');
  ck('высота возвращается', Math.abs(eq.getBoundingClientRect().height - h1) < 1.5,
     eq.getBoundingClientRect().height.toFixed(0) + ' vs ' + h1.toFixed(0));
  ck('подложка подсветки той же высоты',
     Math.abs($('eqhl').getBoundingClientRect().height - h1) < 1.5,
     $('eqhl').getBoundingClientRect().height.toFixed(0));
  D.loadPreset(D.PRESETS[0]);
});

/* --- карточка пресета: имя, формула, объяснение ---
   Раньше в пункте списка стояло одно имя, а формула показывалась в отдельном
   окошке-превью сбоку (на телефоне — внизу экрана). Из-за этого весь смысл задачи
   сваливали в скобки к имени, и многоточие обрезало как раз их. Теперь пункт —
   карточка: имя, формула и строка «что увидишь». Проверки вёрстки формулы
   (индексы, этажерка, скобка системы) те же, что были у превью, — сменилось
   только место, где формула живёт. */
steps.push(() => {
  const btn = $('presetbtn'), list = $('plist');
  const card = i => list.children[i];
  const html = i => card(i).innerHTML, text = i => card(i).textContent;
  btn.click();
  const iKdV = D.PRESETS.findIndex(p => /Кортевег/.test(p.name));
  ck('формула лежит в самой карточке', !!card(iKdV).querySelector('.peq'), text(iKdV));
  ck('производные — нижними индексами', /<b[^>]*>u<sub>xxx<\/sub><\/b>/.test(html(iKdV)),
     text(iKdV));
  ck('умножение — точкой', text(iKdV).indexOf('·') >= 0, text(iKdV));

  /* Пояснения больше не в скобках у имени: имя — только название уравнения,
     объяснение — отдельной строкой. Если скобки вернутся, вернётся и мешанина. */
  const parens = D.PRESETS.filter(p => /\(/.test(p.name)).map(p => p.name);
  ck('в именах пресетов не осталось пояснений в скобках', parens.length === 0,
     parens.join(' | '));
  const noNote = D.PRESETS.filter(p => !p.note || p.note.length < 40).map(p => p.name);
  ck('у каждого пресета есть объяснение', noNote.length === 0, noNote.join(' | '));

  const iLong = D.PRESETS.reduce((b, p, j) => p.name.length > D.PRESETS[b].name.length ? j : b, 0);
  const nm = card(iLong).querySelector('.nm'), note = card(iLong).querySelector('.note');
  ck('имя в карточке — полное имя пресета', nm.textContent === D.PRESETS[iLong].name,
     nm.textContent);
  ck('длинное имя не обрезано', nm.scrollWidth <= nm.clientWidth + 1,
     nm.scrollWidth + ' vs ' + nm.clientWidth);
  ck('объяснение в карточке — текст из note', note.textContent === D.PRESETS[iLong].note,
     note.textContent);
  /* порядок в карточке: имя, потом формула, потом объяснение */
  const after = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  ck('имя стоит над формулой', after(nm, card(iLong).querySelector('.peq')));
  ck('объяснение стоит под формулой', after(card(iLong).querySelector('.peq'), note));

  /* Формула шире карточки бывает (Захаров), но ездить она обязана внутри своей
     строки: иначе широкая формула растянула бы весь список. */
  const wide = D.PRESETS.map((p, j) =>
      card(j).scrollWidth > list.clientWidth + 1 ? p.name : null).filter(Boolean);
  ck('широкая формула не растягивает список', wide.length === 0, wide.join(' | '));

  const iPow = D.PRESETS.findIndex(p => /\^2/.test(p.eq));
  ck('степень — верхним индексом',
     !!card(iPow).querySelector('sup') && html(iPow).indexOf('^') < 0, text(iPow));

  const iSys = D.PRESETS.findIndex(p => /\n/.test(p.eq));
  const lines = D.PRESETS[iSys].eq.split('\n').length;
  ck('система собрана под скобкой', !!card(iSys).querySelector('.brace'), text(iSys));
  ck('в карточке столько строк, сколько уравнений',
     card(iSys).querySelectorAll('.pl').length === lines,
     card(iSys).querySelectorAll('.pl').length + ' vs ' + lines);
  /* Скобка рисуется по измеренной высоте, а у закрытого списка высота нулевая:
     fitMath поэтому вызывается на первом раскрытии (см. openList). Эта проверка
     и стоит за тем вызовом — без него скобки не будет вовсе. */
  const br = card(iSys).querySelector('.brace'), pls = card(iSys).querySelector('.pls');
  ck('скобка нарисована, а не набрана шрифтом', !!(br && br.querySelector('svg path')),
     br ? br.innerHTML.slice(0, 40) : 'нет скобки');
  const hb = br.getBoundingClientRect().height, hp = pls.getBoundingClientRect().height;
  ck('скобка ровно по высоте системы', Math.abs(hb - hp) < 1.5,
     hb.toFixed(1) + ' vs ' + hp.toFixed(1));

  const iFrac = D.PRESETS.findIndex(p => /\//.test(p.eq));
  const fr = card(iFrac).querySelector('.frac');
  ck('деление — этажеркой', !!(fr && fr.querySelector('.fnum') && fr.querySelector('.fden')),
     text(iFrac));
  ck('косой черты в формуле не осталось',
     card(iFrac).querySelector('.pform').textContent.indexOf('/') < 0, text(iFrac));
  const iGreek = D.PRESETS.findIndex(p => /\bnu\b|\beps\b/.test(p.eq));
  if (iGreek >= 0)
    ck('греческие буквы подставлены',
       /ν|ε/.test(card(iGreek).querySelector('.pform').textContent), text(iGreek));

  /* --- фишки: значки в шапке карточки, расшифровка — подсказкой --- */
  const ids = i => D.FX[i].map(c => c.id).join(',');
  const at = re => D.PRESETS.findIndex(p => re.test(p.name));
  const cxPreset = D.FX.findIndex(cs => cs.some(c => c.id === 'cx'));
  const cxWheel = list.children[cxPreset].querySelector('svg.chip .phase-wheel');
  // сектора заменены коническим градиентом: гранёная «радуга» была видна и на 14px
  const wheelBg = cxWheel ? cxWheel.getAttribute('style') : '';
  ck('комплексная фишка залита честным коническим градиентом фазы',
     /conic-gradient\(from 90deg/.test(wheelBg) &&
       /hsl\(360 /.test(wheelBg) && /hsl\(180 /.test(wheelBg),
     wheelBg || 'нет колеса');
  ck('у колеса фазы нет обводки',
     !!cxWheel && !cxWheel.closest('svg').querySelector('circle'), wheelBg);
  // фишки считаются из самого уравнения — приписать их руками нельзя
  ck('у Шрёдингера — комплексное поле, дисперсия, без потерь и сценарии',
     ids(at(/Шрёдингер/)) === 'cx,dsp,cons,sc', ids(at(/Шрёдингер/)));
  ck('у хищника–жертвы — система, нелинейность и сглаживание',
     ids(at(/Хищник/)) === 'sys,nl,dif', ids(at(/Хищник/)));
  ck('у синус-Гордона ещё солитоны и «опыт»', ids(at(/^Синус-Гордон$/)) === 'utt,nl,sol,st', ids(at(/^Синус-Гордон$/)));
  // солитоны приписаны руками: из текста их не вывести, и нелинейности для них мало —
  // Бюргерс и Курамото–Сивашинский нелинейны, а солитонов у них нет
  ck('у КдФ — нелинейность, дисперсия и солитоны', ids(at(/Кортевег/)) === 'nl,dsp,sol',
     ids(at(/Кортевег/)));
  ck('у Бюргерса солитонов нет', ids(at(/^Бюргерс$/)) === 'nl,dif', ids(at(/^Бюргерс$/)));
  ck('у Курамото–Сивашинского солитонов нет', ids(at(/Курамото/)) === 'nl,dif,amp',
     ids(at(/Курамото/)));

  /* --- фишки по символу S(k): читаются из линейной части, а не из примет текста --- */
  // теплопроводность: единственный механизм — сглаживание, и он же единственная фишка
  ck('теплопроводность только сглаживает', ids(at(/Теплопроводность/)) === 'dif',
     ids(at(/Теплопроводность/)));
  // перенос: Im S ∝ k, Re S = 0 — форма не меняется вовсе
  ck('перенос — снос без потерь', ids(at(/^Перенос$/)) === 'adv,cons', ids(at(/^Перенос$/)));
  // у волнового вся линейная часть сидит в связи ut→u, и λ = ±ik берётся из квадратного
  ck('у волнового снос виден через utt', ids(at(/Волновое/)) === 'utt,adv,cons', ids(at(/Волновое/)));
  // тот же квадратный корень у Клейн–Гордона даёт λ = ±i√(k²+m²) — уже с дисперсией
  ck('у Клейн–Гордона дисперсия из-за массы', ids(at(/Клейн/)) === 'utt,nl,dsp', ids(at(/Клейн/)));
  // Эйри: дисперсия без единой потери — расплывание не есть затухание
  ck('Эйри расплывается, ничего не теряя', ids(at(/Эйри/)) === 'dsp,cons', ids(at(/Эйри/)));
  // Re S(k) > 0 на сетке пресета — у пяти: Курамото, Аллен–Кан, FitzHugh–Nagumo,
  // Гинзбурга–Ландау и φ⁴. У Гинзбурга–Ландау это и есть источник хаоса: моды с
  // k < 1 растут сами, а останавливает их нелинейность — то же устройство, что у
  // Курамото. У φ⁴ рост берётся из ВТОРОГО порядка: λ = ±√(1−k²), и при k < 1
  // корень вещественный — то есть неустойчив сам фон u=0, вершина двойной ямы.
  // Это не приметa «есть utt», а честный корень квадратного (см. lambdasOf).
  //
  // Кан–Хиллиарда тут НЕТ, хотя задача неустойчива: в пресете жёсткий член
  // разложен (`2*uxx + 3*(u^2-1)*uxx`), диагональ стала `-εk⁴-2k²`, и рост
  // переехал в нелинейную часть. Фишка читает линейную часть как написано.
  ck('раскачка только там, где Re S > 0',
     D.PRESETS.map((p, i) => D.FX[i].some(c => c.id === 'amp') ? p.name : null)
       .filter(Boolean).length === 5,
     D.PRESETS.map((p, i) => D.FX[i].some(c => c.id === 'amp') ? p.name : '').filter(Boolean).join(' | '));
  // нелинейность отменяет обещания про форму решения: у синус-Гордона λ = ±ik, как у
  // волнового, но sin(u) может и раскачать, и погасить — «снос» и «без потерь» молчат
  ck('нелинейность снимает «снос» и «без потерь»',
     !/adv|cons/.test(ids(at(/^Синус-Гордон$/))) && !/adv|cons/.test(ids(at(/Кортевег/))),
     ids(at(/^Синус-Гордон$/)) + ' / ' + ids(at(/Кортевег/)));
  /* В карточке — только фишки с `list:true`: остальные говорят про механизм и висят
     полным набором под кнопкой (#fxbar). Если этот тест начнёт считать все фишки,
     значит ряд в шапке карточки опять разросся до восьми значков и съел имя. */
  const bad = D.PRESETS.map((p, i) =>
      list.children[i].querySelectorAll('svg.chip').length ===
      D.FX[i].filter(c => c.list).length ? null : p.name)
    .filter(Boolean);
  ck('в карточке ровно те значки, что помечены list', bad.length === 0, bad.join(' | '));
  ck('механизм в карточку не лезет',
     D.PRESETS.every((p, i) => ![...list.children[i].querySelectorAll('svg.chip')].length ||
       D.FX[i].filter(c => c.list).length <= 5) &&
     D.CHIPS.filter(c => c.list).map(c => c.id).join(',') === 'cx,nl,sol,sc,st',
     D.CHIPS.filter(c => c.list).map(c => c.id).join(','));
  ck('у КдФ в карточке два значка вместо трёх',
     list.children[iKdV].querySelectorAll('svg.chip').length === 2,
     list.children[iKdV].querySelectorAll('svg.chip').length);

  /* Значок сам по себе ребус: расшифровка висит на нём подсказкой (data-tip),
     как раньше висела блоком в превью. Проверяем, что она на месте и что это та
     самая расшифровка, а не одно имя. */
  const tips = i => [...list.children[i].querySelectorAll('.fxi')]
    .map(e => e.getAttribute('data-tip') || '');
  const bare = D.PRESETS.map((p, i) =>
      tips(i).every(t => /^[^|]+\|.{20,}/.test(t)) ? null : p.name).filter(Boolean);
  ck('у каждого значка в карточке есть имя и расшифровка', bare.length === 0,
     bare.join(' | '));
  ck('расшифровка нелинейности — словами',
     /нелинейное\|.*умножается само на себя/.test(tips(at(/Хищник/)).join(' ')),
     tips(at(/Хищник/)).join(' / '));
  ck('у Шрёдингера в карточке комплексное поле и сценарии',
     /комплексное поле/.test(tips(at(/Шрёдингер/)).join(' ')) &&
     /сценарии/.test(tips(at(/Шрёдингер/)).join(' ')), tips(at(/Шрёдингер/)).join(' / '));
  // «систему» не раскрываем и в карточку не пускаем: что уравнений несколько,
  // видно по самой формуле строкой ниже имени
  ck('«система» в карточку не попадает',
     D.PRESETS.every((p, i) => !/система/.test(tips(i).join(' '))),
     tips(at(/Хищник/)).join(' / '));
  /* Механизм (сглаживание, дисперсия, снос) в карточку не лезет: у теплопроводности
     единственная фишка как раз механизм, и значков в её карточке нет вовсе —
     полный набор ждёт под кнопкой, для того уравнения, которое считается. */
  ck('у теплопроводности в карточке значков нет', tips(at(/Теплопроводность/)).length === 0,
     tips(at(/Теплопроводность/)).join(' / '));

  /* Карточек в списке несколько колонок (grid auto-fill), и «вниз» обязано вести
     на карточку ПОД текущей, а не на соседнюю справа: иначе стрелка идёт не туда,
     куда смотрит глаз. Число колонок и код, и тест берут у самой сетки. */
  const cols = getComputedStyle(list).gridTemplateColumns.split(' ').length;
  ck('на широком экране карточки в две колонки', cols === 2, cols);
  const hiAt = () => [...list.children].findIndex(e => e.classList.contains('hi'));
  const key = k => btn.dispatchEvent(new KeyboardEvent('keydown', { key:k, bubbles:true }));
  btn.focus();
  const was0 = hiAt();
  key('ArrowDown');
  ck('↓ ведёт под текущую карточку, а не вбок', hiAt() === was0 + cols,
     was0 + ' -> ' + hiAt());
  key('ArrowRight');
  ck('→ ведёт на соседнюю', hiAt() === was0 + cols + 1, hiAt());
  key('ArrowUp');
  ck('↑ возвращает на строку выше', hiAt() === was0 + 1, hiAt());
  key('ArrowLeft');
  ck('← возвращает к началу', hiAt() === was0, hiAt());

  btn.click();                       // закрыть список
  ck('повторный клик закрывает список', !list.classList.contains('on'));
});

/* --- полный набор фишек под кнопкой списка (#fxbar) ---
   В карточке остались только пять «что это за задача»; механизм (снос, дисперсия,
   сглаживание, раскачка, «без потерь») ушёл под кнопку — и показывается для того
   уравнения, которое сейчас считается, включая своё. Пресетные фишки при этом
   считаются один раз (FX), а эти — каждый раз заново, поэтому тут проверяется
   и то, что набор ходит за состоянием: за параметром, за сеткой, за гашением. */
steps.push(() => {
  const bar = $('fxbar');
  const names = () => [...bar.children].map(e => e.getAttribute('data-tip').split('|')[0]);
  const nameOf = id => D.CHIPS.find(c => c.id === id).name;
  const iKdV = D.PRESETS.findIndex(p => /Кортевег/.test(p.name));
  D.loadPreset(D.PRESETS[iKdV]);
  ck('под кнопкой — полный набор пресета',
     names().join(',') === D.FX[iKdV].map(c => c.name).join(','), names().join(','));
  ck('строка фишек под кнопкой, а не над ней',
     bar.getBoundingClientRect().top >= $('presetbtn').getBoundingClientRect().bottom - 0.5,
     bar.getBoundingClientRect().top.toFixed(0));
  // значок сам по себе ребус: под кнопкой он обязан иметь имя и расшифровку
  ck('у каждой фишки есть имя и расшифровка',
     [...bar.children].every(e => /^[^|]+\|.{20,}/.test(e.getAttribute('data-tip'))),
     [...bar.children].map(e => e.getAttribute('data-tip')).join(' / '));

  // своё уравнение: приписывать фишки некому, но всё, что выводится из текста,
  // выводится и тут — ради этого набор и переехал под кнопку
  D.applySystem('ut = uxx + u');
  ck('своё уравнение получает вычисленные фишки',
     names().join(',') === nameOf('dif') + ',' + nameOf('amp'), names().join(','));
  // текст совпал с пресетом — вернулись и приписанные руками солитоны
  D.applySystem('ut + u*ux + uxxx = 0');
  ck('набранное руками КдФ получает солитоны', names().indexOf(nameOf('sol')) >= 0,
     names().join(','));

  const n0 = names().length;
  $('smooth').click();
  ck('кнопка гашения добавляет фишку', names().indexOf(nameOf('smt')) >= 0, names().join(','));
  $('smooth').click();
  ck('выключенное гашение фишку убирает',
     names().length === n0 && names().indexOf(nameOf('smt')) < 0, names().join(','));

  // параметр входит в символ S(k) наравне с производными: nu = 0 — уже не сглаживание
  const iB = D.PRESETS.findIndex(p => /^Бюргерс$/.test(p.name));
  D.loadPreset(D.PRESETS[iB]);
  ck('у Бюргерса с вязкостью — сглаживание', names().indexOf(nameOf('dif')) >= 0, names().join(','));
  D.applySystem(D.PRESETS[iB].eq, { nu:0 });
  ck('нулевая вязкость сглаживание убирает', names().indexOf(nameOf('dif')) < 0, names().join(','));
  D.loadPreset(D.PRESETS[0]);
});

/* --- рисование ставит счёт на паузу --- */
steps.push(() => {
  D.loadPreset(D.PRESETS[0]);
  const r = rect();
  $('tools').querySelector('[data-tool="gauss"]').click();
  $('play').click();
  ck('счёт идёт до рисования', D.S.running);
  ev('pointerdown', r.left + r.width*0.5, r.top + D.u2py(1));
  ck('нажатие мыши ставит счёт на паузу',
     !D.S.running && $('play').dataset.icon === 'play', 'значок=' + $('play').dataset.icon);
  const t0 = D.sim.t;
  ev('pointermove', r.left + r.width*0.5 + 40, r.top + D.u2py(2));
  ck('пока кнопка нажата, время стоит', D.sim.t === t0, 't=' + D.sim.t);
  ev('pointerup', r.left + r.width*0.5 + 40, r.top + D.u2py(2));
  ck('после отпускания счёт продолжается', D.S.running && $('play').dataset.icon === 'pause',
     'значок=' + $('play').dataset.icon);
  $('play').click();
  ck('остановка руками остаётся остановкой', !D.S.running);
});

steps.push(() => {
  const r = rect();
  ck('счёт стоит перед проверкой', !D.S.running);
  ev('pointerdown', r.left + r.width*0.4, r.top + D.u2py(1));
  ev('pointerup',   r.left + r.width*0.4, r.top + D.u2py(1));
  ck('рисование на паузе счёт не запускает', !D.S.running);
});

/* --- канонический вид текста при применении --- */
steps.push(() => {
  const eq = $('eq');
  eq.value = '  ut   +u*ux+uxxx=0  \n\n'; eq.dispatchEvent(new Event('input'));
  eq.focus();
  $('apply').click();
  ck('лишние пробелы и пустые строки убраны', eq.value === 'ut + u*ux + uxxx = 0',
     JSON.stringify(eq.value));
  ck('после применения фокус снят с поля', document.activeElement !== eq,
     'active=' + (document.activeElement||{}).tagName);
  ck('«Применить» гаснет после канонизации', $('apply').disabled);
  ck('пресет по-прежнему узнан', $('preset').value === '0', $('preset').value);

  eq.value = 'utt=-v*ut;vt=-V*ut;zt=-u*v*vxx*ux'; eq.dispatchEvent(new Event('input'));
  $('apply').click();
  ck('«;» разводит уравнения по строкам',
     eq.value === 'utt = -v*ut\nvt = -V*ut\nzt = -u*v*vxx*ux', JSON.stringify(eq.value));

  eq.value = 'ut = uxx # тёплая строка'; eq.dispatchEvent(new Event('input'));
  $('apply').click();
  ck('комментарий переживает форматирование', /# тёплая строка/.test(eq.value),
     JSON.stringify(eq.value));

  eq.value = 'ut + %uxx = 0'; eq.dispatchEvent(new Event('input'));
  $('apply').click();
  ck('ошибочный текст не переписывается', eq.value === 'ut + %uxx = 0', JSON.stringify(eq.value));
  setEq('ut + u*ux + uxxx = 0');
});

steps.push(() => {
  const isl = document.querySelectorAll('aside .isl');
  const heads = [...document.querySelectorAll('aside h3')];
  ck('разделы панели — острова', isl.length === 5, 'островов=' + isl.length);
  ck('каждый заголовок внутри острова', heads.length === 5 && heads.every(h => h.closest('.isl')),
     'заголовков=' + heads.length);
  // сетка и шаг — внутренности численного метода: они в панели есть, но свёрнуты,
  // и открываются одним кликом по «сетка и шаг»
  // checkVisibility(), а не offsetParent и не высота: закрытый <details> свежий
  // Chromium прячет через content-visibility, и коробка с прежним размером у
  // содержимого остаётся — по ней раздел кажется открытым
  const fine = document.querySelector('aside details.fine');
  const vis = () => $('N').checkVisibility();
  ck('сетка и шаг свёрнуты', !!fine && !fine.open && !vis(),
     fine ? 'open=' + fine.open + ' N виден=' + vis() : 'нет раздела');
  fine.querySelector('summary').click();
  ck('раздел раскрывается кликом', fine.open && vis(), 'open=' + fine.open + ' N виден=' + vis());
  const bg = getComputedStyle(isl[0]).backgroundColor, asideBg = getComputedStyle($('app').querySelector('aside')).backgroundColor;
  ck('фон острова отличается от фона панели', bg !== asideBg, bg + ' vs ' + asideBg);
});

/* легенда: она лежит на графике, называет кривые и показывает их числа —
   ради этого из панели убран целый остров «Поля» */
steps.push(() => {
  const lr = $('legend').getBoundingClientRect(), pr = $('pw').getBoundingClientRect();
  ck('легенда лежит поверх графика',
     lr.left >= pr.left && lr.right <= pr.right + 1 && lr.top >= pr.top && lr.bottom <= pr.bottom,
     'legend ' + lr.left.toFixed(0) + '..' + lr.right.toFixed(0) +
     '  pw ' + pr.left.toFixed(0) + '..' + pr.right.toFixed(0));
  // полупрозрачная: сквозь неё должна быть видна кривая, иначе она вырезает
  // кусок поля зрения и ничем не лучше острова в панели
  const a = getComputedStyle($('legend')).backgroundColor.match(/[\d.]+/g);
  ck('легенда полупрозрачная', a && a.length === 4 && +a[3] < 0.9,
     getComputedStyle($('legend')).backgroundColor);
  const v = $('legend').querySelector('.v');
  ck('в легенде показания поля', /max/.test(v.textContent), v.textContent);
  const before = v.textContent;
  for (let i = 0; i < 3; i++) $('stepb').click();
  ck('показания в легенде живые', $('legend').querySelector('.v').textContent !== before,
     before + ' -> ' + $('legend').querySelector('.v').textContent);
});

/* --- иконки инструментов и подсказки --- */
steps.push(() => {
  const bs = [...$('tools').children];
  ck('инструментов семь, все — картинки графика',
     bs.length===7 && bs.every(b => b.querySelector('svg path')), bs.length+' кнопок');
  ck('в кнопках нет текста', bs.every(b => b.textContent.trim()===''), bs.map(b=>b.textContent).join('|'));
  const g = $('tools').querySelector('[data-tool="gauss"]');
  ck('у кнопки есть подсказка с названием', /^Гаусс\|/.test(g.getAttribute('data-tip')),
     g.getAttribute('data-tip'));
  g.dispatchEvent(new PointerEvent('pointerover', {bubbles:true, pointerId:1}));
});

/* --- ошибка подсвечивается на месте (пока тултип всплывает) --- */
steps.push(() => {
  $('eq').value = 'ut + u*ux + %uxxx = 0'; $('eq').dispatchEvent(new Event('input'));
  ck('ошибка ловится на лету', /Неизвестный символ/.test($('err').textContent), $('err').textContent);
  const mk = $('eqhl').querySelector('.mk');
  ck('виноватый символ выделен', mk && mk.textContent==='%', mk && mk.textContent);
  ck('поле помечено ошибочным', $('eq').classList.contains('bad'));
});

steps.push(() => {
  ck('тултип всплыл', $('tip').classList.contains('on'), $('tip').className);
  ck('в тултипе название инструмента', /Гаусс/.test($('tip').textContent), $('tip').textContent);
  $('eq').value = 'utt = uxxx*'; $('eq').dispatchEvent(new Event('input'));
  const mk = $('eqhl').querySelector('.mk');
  ck('обрыв выражения тоже показан', !!mk && $('err').textContent!=='', $('err').textContent);
  setEq('ut + u*ux + uxxx = 0');
  ck('подсветка снимается',
     !$('eqhl').querySelector('.mk') && !$('eq').classList.contains('bad'), $('eqhl').innerHTML);
});

/* --- раскраска ввода --- */
steps.push(() => {
  const eq = $('eq'), hl = $('eqhl');
  const type = t => { eq.value = t; eq.dispatchEvent(new Event('input')); };
  const has = (sel, txt) => [...hl.querySelectorAll(sel)].some(s => s.textContent === txt);

  type('ut = nu*uxx + sin(u) + 2  # хвост');
  ck('подложка повторяет текст поля символ в символ', hl.textContent === eq.value + '\n',
     JSON.stringify(hl.textContent));
  ck('текст в самом поле прозрачный (рисует подложка)',
     getComputedStyle(eq).color === 'rgba(0, 0, 0, 0)', getComputedStyle(eq).color);
  const fld = [...hl.querySelectorAll('span')].filter(s => s.style.color);
  ck('поле раскрашено цветом своей кривой',
     fld.length > 0 && fld[0].textContent === 'u' &&
     fld[0].style.color === getComputedStyle($('legend').firstChild).color,
     fld.length + ' кусков, первый «' + (fld[0]||{}).textContent + '»');
  ck('хвост производной бледнее', [...hl.querySelectorAll('.dv')].some(s => s.textContent === 'xx'),
     hl.innerHTML.slice(0, 80));
  ck('константа выделена', has('.pr', 'nu'));
  ck('функция выделена', has('.fn', 'sin'));
  ck('число выделено', has('.nu', '2'));
  ck('комментарий выделен', [...hl.querySelectorAll('.cm')].some(s => /хвост/.test(s.textContent)));

  type('utt=-v*ut;vt=-V*ut');
  ck('«;» и система тоже раскрашиваются целиком', hl.textContent === eq.value + '\n',
     JSON.stringify(hl.textContent));
  type('ut + %uxx = 0');
  ck('метка ошибки не съедает текст', hl.textContent === eq.value + '\n',
     JSON.stringify(hl.textContent));
  ck('виноватый кусок — одной меткой',
     hl.querySelectorAll('.mk').length === 1 && hl.querySelector('.mk').textContent === '%',
     hl.querySelectorAll('.mk').length + ' метки');
  setEq('ut + u*ux + uxxx = 0');
});

/* --- сетка --- */
steps.push(() => {
  setEq('ut + u*ux + uxxx = 0');
  D.S.sel = 0;
  $('tools').querySelector('[data-tool="sech"]').click();
  $('wid').value='2'; $('wid').dispatchEvent(new Event('input'));
  drag(0.5, 3);
  const before = umax(0);
  $('N').value='1024'; $('N').dispatchEvent(new Event('change'));
  ck('N=1024', D.sim.N===1024);
  ck('профиль сохранился', Math.abs(umax(0)-before)<0.02, before.toFixed(3)+' -> '+umax(0).toFixed(3));
  $('L').value='60'; $('L').dispatchEvent(new Event('change'));
  ck('L=60', Math.abs(D.sim.L-60)<1e-12);
  $('N').value='512'; $('N').dispatchEvent(new Event('change'));
});

/* --- запас за окном: кольцо шире экрана --- */
function padBtn(k){ return $('pad').querySelector('[data-p="'+k+'"]'); }
/* максимум только по тому, что видно; за окном поле живёт своей жизнью */
function umaxWin(){
  const N = D.sim.N, j0 = Math.ceil(N*(1-1/D.S.pad)/2), j1 = N-j0, u = D.sim.getU(0);
  let m = 0; for (let j=j0;j<j1;j++) m = Math.max(m, Math.abs(u[j]));
  return m;
}
steps.push(() => {
  D.loadPreset(D.PRESETS[0]);
  ck('по умолчанию запаса нет', D.S.pad===1 && Math.abs(D.viewL()-D.sim.L)<1e-12);
  ck('при pad=1 весь холст под графиком', D.u2py(D.S.yMax)===0);
  ck('кнопок запаса три', $('pad').children.length===3);

  const L0 = D.sim.L, N0 = D.sim.N, dx0 = L0/N0, top0 = umax(0);
  padBtn(2).click();
  ck('×2 удлиняет кольцо', Math.abs(D.sim.L-2*L0)<1e-12, D.sim.L);
  ck('×2 добавляет узлов', D.sim.N===2*N0, D.sim.N);
  ck('dx не изменился', Math.abs(D.sim.L/D.sim.N-dx0)<1e-15, (D.sim.L/D.sim.N).toFixed(6));
  ck('окно осталось прежним', Math.abs(D.viewL()-L0)<1e-12, D.viewL());
  ck('профиль в окне не поехал', Math.abs(umaxWin()-top0)<1e-9, top0.toFixed(6)+' -> '+umaxWin().toFixed(6));
  ck('кнопка ×2 подсвечена', padBtn(2).classList.contains('on') && !padBtn(1).classList.contains('on'));

  const r = rect();
  ck('край окна — край холста', Math.abs(D.x2px(D.viewL()/2) - r.width) < 1, D.x2px(D.viewL()/2).toFixed(1)+' vs '+r.width.toFixed(1));
  // запас делится поровну на обе стороны, поэтому край кольца — это ещё полокна
  ck('край кольца ушёл за холст', Math.abs(D.x2px(D.sim.L/2) - r.width*1.5) < 1,
     D.x2px(D.sim.L/2).toFixed(1)+' vs '+(r.width*1.5).toFixed(1));
  ck('верх холста отдан радару', D.u2py(D.S.yMax) > 8, D.u2py(D.S.yMax).toFixed(1));
  // радар обязан быть нарисован, а не «выделен и забыт»: фон запаса темнее фона
  // окна, и по этой границе видно, какая часть кольца показана крупно
  const g = plot.getContext('2d'), dpr = window.devicePixelRatio || 1;
  const at = (fx, py) => g.getImageData(Math.round(r.width*fx*dpr), Math.round(py*dpr), 1, 1).data;
  const outside = at(0.06, 8), inside = at(0.5, 8);
  ck('радар отделяет запас от окна', outside.join() !== inside.join(),
     'запас rgb('+[...outside].slice(0,3)+') окно rgb('+[...inside].slice(0,3)+')');
  ck('диаграмма x–t объявляет кольцо целиком', /кольцо/.test($('xtag').textContent), $('xtag').textContent);
});

/* мышь рисует туда, куда показывает курсор: окно и холст должны совпадать */
steps.push(() => {
  $('tools').querySelector('[data-tool="gauss"]').click();
  $('wid').value='1.5'; $('wid').dispatchEvent(new Event('input'));
  drag(0.25, 2);
  const u = D.sim.getU(0), N = D.sim.N;
  let jm = 0; for (let j=0;j<N;j++) if (Math.abs(u[j])>Math.abs(u[jm])) jm = j;
  const xExp = -D.viewL()/4;                       // четверть холста слева от центра окна
  ck('мышь рисует по окну, а не по кольцу', Math.abs(D.sim.x[jm]-xExp) < 0.5,
     'пик на x='+D.sim.x[jm].toFixed(2)+', ждали '+xExp.toFixed(2));
});

/* то, ради чего всё: волна уходит за экран и не влетает сразу с другой стороны */
steps.push(() => {
  setEq('ut + ux = 0');
  $('tools').querySelector('[data-tool="gauss"]').click();
  $('wid').value='1'; $('wid').dispatchEvent(new Event('input'));
  drag(0.5, 1);
  const L0 = D.viewL();
  const go = T => { for (let i=0, n=Math.round(T/D.sim.dt); i<n; i++) D.sim.step(); };
  go(L0*0.75);                                     // горб уехал на 3/4 окна вправо
  ck('горб ушёл из окна', umaxWin() < 0.05, 'в окне '+umaxWin().toFixed(4));
  ck('но не пропал: он в запасе', Math.abs(umax(0)-1) < 0.02, 'на кольце '+umax(0).toFixed(4));
  go(L0*1.25);                                     // всего пройдено ровно кольцо
  ck('через кольцо горб вернулся в окно', Math.abs(umaxWin()-1) < 0.02, 'в окне '+umaxWin().toFixed(4));
});

steps.push(() => {
  const L0 = D.viewL();
  padBtn(1).click();
  ck('возврат к «нет» укорачивает кольцо', Math.abs(D.sim.L-L0)<1e-12, D.sim.L);
  ck('и возвращает график на весь холст', D.u2py(D.S.yMax)===0);
  padBtn(4).click();
  ck('×4 — кольцо вчетверо длиннее окна', Math.abs(D.sim.L-4*D.viewL())<1e-12, D.sim.L);
  D.loadPreset(D.PRESETS[0]);
  ck('пресет сбрасывает запас', D.S.pad===1 && padBtn(1).classList.contains('on'));
});

/* --- гашение осцилляций --- */
steps.push(() => {
  D.loadPreset(D.PRESETS[0]);
  ck('на обычном пресете гашение выключено', !D.S.smooth && D.sim.smooth===0);
  $('smooth').click();
  ck('кнопка включает гашение',
     D.S.smooth && D.sim.smooth===1 && $('smooth').classList.contains('on'));
  $('smooth').click();
  ck('кнопка выключает гашение',
     !D.S.smooth && D.sim.smooth===0 && !$('smooth').classList.contains('on'));
});

steps.push(() => {
  const p = D.PRESETS.find(q => /без вязкости/.test(q.name));
  D.loadPreset(p);
  ck('пресет с опрокидыванием включает гашение сам',
     D.S.smooth && $('smooth').classList.contains('on'));
  for (let i=0;i<4000;i++) D.sim.step();
  const u = D.sim.getU(0), N = D.sim.N;
  let tv = 0; for (let j=0;j<N;j++) tv += Math.abs(u[(j+1)%N]-u[j]);
  ck('горб опрокинулся, но решение не развалилось',
     D.sim.diagnostics().finite && tv<3, 'TV='+tv.toFixed(3)+' t='+D.sim.t.toFixed(1));
  $('stepb').click();
  ck('цена гашения видна в статусной строке', /гашение/.test($('bart').textContent),
     $('bart').textContent.replace(/\s+/g,' ').slice(-46));
});

/* --- все пресеты и все сценарии --- */
steps.push(() => {
  const bad = [];
  // сценарии проверяются наравне с пресетами: у пресета со сценариями свои
  // начальные данные несёт каждый из них, а не сам пресет
  D.PRESETS.forEach(p => (p.sc ? p.sc.map((s,i) => [s.name, i]) : [[p.name, 0]]).forEach(([nm, si]) => {
    try {
      D.loadPreset(p, si);
      for (let i=0;i<30;i++) D.sim.step();
      if (!D.sim.diagnostics().finite) bad.push(nm+': разошёлся');
      if ($('err').textContent) bad.push(nm+': '+$('err').textContent);
      const live = D.S.ic.filter(a => a && a.some(v => v!==0)).length;
      if (!live) bad.push(nm+': пустые начальные данные');
    } catch(e){ bad.push(nm+': '+e.message); }
  }));
  ck('все пресеты и сценарии грузятся и считаются', bad.length===0, bad.join(' | '));
});

/* --- НУШ: обещание пресета проверяется целиком, от кнопки до решения ---
   «Модуль стоит, крутится только фаза» — то, ради чего пресет и стоит в списке.
   Тридцати шагов предыдущей проверки для этого мало: расплылось бы и линейное
   уравнение, а тут надо увидеть, что нелинейность держит форму долго. */
steps.push(() => {
  const p = D.PRESETS.find(q => /Нелинейный Шрёдингер/.test(q.name));
  D.loadPreset(p, 0);
  const mod = () => { const u=D.sim.getU(0), w=D.sim.getUi(0), a=new Float64Array(D.sim.N);
    for (let j=0;j<D.sim.N;j++) a[j]=Math.hypot(u[j],w[j]); return a; };
  const m0 = mod(), ph0 = Math.atan2(D.sim.getUi(0)[D.sim.N/2], D.sim.getU(0)[D.sim.N/2]);
  for (let i=0;i<1500;i++) D.sim.step();               // t = 3, почти полоборота фазы
  const m1 = mod(); let dm = 0;
  for (let j=0;j<D.sim.N;j++) dm = Math.max(dm, Math.abs(m1[j]-m0[j]));
  ck('солитон НУШ держит модуль', dm < 1e-3, 'max|Δ|ψ||='+dm.toExponential(2));
  const ph1 = Math.atan2(D.sim.getUi(0)[D.sim.N/2], D.sim.getU(0)[D.sim.N/2]);
  // фаза обязана уехать ровно на t: это и есть e^{it} из подписи сценария
  ck('а фаза уходит ровно на t', Math.abs(((ph1-ph0-D.sim.t)%(2*Math.PI)+3*Math.PI)%(2*Math.PI)-Math.PI) < 1e-3,
     'Δфазы='+(ph1-ph0).toFixed(4)+' t='+D.sim.t.toFixed(4));
});

/* --- скорость счёта --- */
steps.push(() => {
  D.loadPreset(D.PRESETS[0]);
  const btns = [...$('speed').children];
  ck('кнопки скорости построены', btns.length===6, btns.map(b=>b.textContent).join(' '));
  ck('отмечена та, что стоит', btns.filter(b=>b.classList.contains('on')).length===1,
     'spf='+D.S.spf);
  const spf0 = D.S.spf;
  ck('«×1» — это темп пресета', D.S.baseSpf===spf0 &&
     btns.find(b=>b.dataset.k==='1').classList.contains('on'), 'baseSpf='+D.S.baseSpf);
  btns.find(b=>b.dataset.k==='10').click();
  ck('×10 — вдесятеро больше шагов на кадр', D.S.spf===spf0*10, spf0+' -> '+D.S.spf);
  ck('поле «шагов/кадр» подхватило', +$('spf').value===D.S.spf, $('spf').value);
  ck('подсветилась новая кнопка',
     btns.find(b=>b.dataset.k==='10').classList.contains('on') &&
     !btns.find(b=>b.dataset.k==='1').classList.contains('on'));
  // ручной ввод снимает подсветку: 7 — не кратно ни одной кнопке
  $('spf').value='7'; $('spf').dispatchEvent(new Event('input'));
  ck('поле не даёт увести шаги в ноль', D.S.spf===7, 'spf='+D.S.spf);
  ck('ручной ввод шагов не подсвечивает кнопку',
     btns.every(b=>!b.classList.contains('on')), 'spf='+D.S.spf);
  ck('потолок шагов поднят до 2000', +$('spf').max===2000, $('spf').max);
});

steps.push(() => {
  // Настоящий обрыв по времени в headless не воспроизвести: под
  // --virtual-time-budget performance.now() в синхронном цикле стоит.
  // Поэтому проверяем сам механизм — отрицательным бюджетом.
  D.S.spf = 2000; $('spf').value='2000';
  ck('весь бюджет — считаются все запрошенные шаги', D.frameSteps()===2000);
  D.setBudget(-1);
  const done = D.frameSteps();
  ck('кончился бюджет — кадр оборван', done < 2000, 'сделано '+done+' из 2000');
  ck('обрыв на первой же проверке, шагов кратно 8', done===8, 'шагов='+done);
  ck('решение не испорчено обрывом', D.sim.diagnostics().finite);
  D.setBudget(12);
  D.S.spf = 6; $('spf').value='6'; $('spf').dispatchEvent(new Event('input'));
});

/* --- крупный шаг --- */
steps.push(() => {
  D.loadPreset(D.PRESETS[0]);
  $('autodt').checked = true; $('autodt').dispatchEvent(new Event('change'));
  const dt1 = D.sim.dt;
  $('coarsedt').checked = true; $('coarsedt').dispatchEvent(new Event('change'));
  const dt2 = D.sim.dt;
  ck('крупный шаг увеличивает dt вдвое', Math.abs(dt2/dt1 - 2) < 0.1,
     dt1.toExponential(2)+' -> '+dt2.toExponential(2)+' (×'+(dt2/dt1).toFixed(2)+')');
  for (let i=0;i<400;i++) D.sim.step();
  const d = D.sim.diagnostics();
  ck('на крупном шаге КдФ по-прежнему живой', d.finite && d.per[0].max<10,
     'max='+d.per[0].max.toFixed(3)+' t='+d.t.toFixed(2));
  ck('и «Δ за шаг» не в тревоге', d.perStep < 0.1, 'Δ='+d.perStep.toExponential(2));
  $('coarsedt').checked = false; $('coarsedt').dispatchEvent(new Event('change'));
  ck('выключение возвращает прежний dt', Math.abs(D.sim.dt - dt1) < 0.2*dt1,
     D.sim.dt.toExponential(2)+' vs '+dt1.toExponential(2));
});

/* --- перо --- */
steps.push(() => {
  D.loadPreset(D.PRESETS[0]);
  const r = rect();
  $('tools').querySelector('[data-tool="pen"]').click();
  ev('pointerdown', r.left+10, r.top + D.u2py(0));
  for (let i=1;i<=20;i++) ev('pointermove', r.left+10+i*(r.width-20)/20, r.top + D.u2py(i%2?1.5:0.2));
  ev('pointerup', r.left+r.width-10, r.top + D.u2py(0.2));
  ck('перо рисует', umax(0)>0.5, 'max='+umax(0).toFixed(3));
  for (let i=0;i<50;i++) D.sim.step();
  ck('после пера считается', D.sim.diagnostics().finite);
});

/* --- иконки, кнопка в поле, строка сообщений --- */
steps.push(() => {
  // Смотрим на саму кривую, а не на рамку svg: класс `.sh` у неё общий с чем
  // угодно в проекте, и одного чужого правила `display:none` хватает, чтобы
  // остались пустые кнопки (так и случилось с шапкой шторки).
  const bad = [...$('tools').querySelectorAll('button')].filter(b => {
    const s = b.querySelector('svg'), p = b.querySelector('path.sh');
    if (!s || !p || getComputedStyle(p).display === 'none') return true;
    // по длине пути, а не по высоте рамки: у «константы» профиль — прямая,
    // и высота у неё честно ноль
    return s.getBoundingClientRect().width < 12 ||
           p.getBBox().width < 20 || p.getTotalLength() < 20;
  });
  ck('профили на кнопках инструментов нарисованы', bad.length === 0,
     bad.map(b => b.dataset.tool).join() || 'все ' + $('tools').children.length);
  const pad = [...document.querySelectorAll('#padbtns button')];
  ck('у кнопок пульта рисованные значки',
     pad.length === 3 && pad.every(b => b.querySelector('svg') &&
       b.querySelector('svg').getBoundingClientRect().width > 10),
     pad.map(b => b.id).join());

  const eb = $('eqbox').getBoundingClientRect(), ab = $('apply').getBoundingClientRect();
  ck('«применить» лежит внутри поля ввода',
     $('eqbox').contains($('apply')) && ab.right <= eb.right + 1 && ab.left > eb.left,
     'eqbox ' + eb.left.toFixed(0) + '..' + eb.right.toFixed(0) +
     ', кнопка ' + ab.left.toFixed(0) + '..' + ab.right.toFixed(0));
  // кнопка отъела правый отступ — у слоёв он обязан остаться одинаковым,
  // иначе перенос строк разойдётся и раскраска уедет от каретки
  const cs = getComputedStyle($('eq')), ch = getComputedStyle($('eqhl'));
  ck('отступы поля и подложки совпадают',
     cs.padding === ch.padding && cs.paddingRight === ch.paddingRight,
     cs.padding + '  vs  ' + ch.padding);
  ck('текст не заезжает под кнопку', parseFloat(cs.paddingRight) >= ab.width,
     'padding-right=' + cs.paddingRight + ', кнопка ' + ab.width.toFixed(0) + 'px');
});

steps.push(() => {
  ck('без ошибок строка сообщений скрыта', getComputedStyle($('msg')).display === 'none',
     getComputedStyle($('msg')).display);
  $('eq').value = 'ut = uxxx*'; $('eq').dispatchEvent(new Event('input'));
  ck('с ошибкой строка сообщений видна', getComputedStyle($('msg')).display !== 'none');
  const mr = $('msg').getBoundingClientRect(), er = $('eq').getBoundingClientRect();
  // не просто «где-то ниже», а точно под полем: у края шапки его искать неудобно,
  // с этого и началась правка
  ck('сообщение — прямо под полем ввода',
     mr.top >= er.bottom - 1 && Math.abs(mr.left - er.left) < 6,
     'msg ' + mr.left.toFixed(0) + '/' + mr.top.toFixed(0) +
     '  eq ' + er.left.toFixed(0) + '/' + er.bottom.toFixed(0));
  setEq('ut + u*ux + uxxx = 0');
  ck('строка сообщений снова скрыта', getComputedStyle($('msg')).display === 'none');
});

/* --- комплексное поле: Шрёдингер --- */
steps.push(() => {
  // именно Шрёдингер, а не «первый со сценариями»: сценарии есть и у φ⁴, и он
  // стоит в списке раньше — выбор по порядку молча уводил тест на другую задачу
  const p = D.PRESETS.find(q => /^Шрёдингер/.test(q.name));
  const iMeet = p.sc.findIndex(s => /встреча/.test(s.name));
  D.loadPreset(p, iMeet);
  ck('пресет Шрёдингера загрузился', /i\*uxx/.test($('eq').value) && $('err').textContent === '',
     $('eq').value + ' | ' + $('err').textContent);
  ck('поле стало комплексным', D.sim.isComplex(0) && D.sim.model.complex);
  ck('в списке стоит сам пресет', /Шрёдингер/.test($('presetbtn').textContent),
     $('presetbtn').textContent);
  // сценарий перекрывает поля пресета: у «встречи» своя сетка и свой масштаб
  ck('сценарий перекрыл N пресета', D.sim.N === 1024 && D.sim.N !== p.N,
     'N='+D.sim.N+' у пресета '+p.N);
  const sbtn = [...$('scen').children];
  ck('кнопки сценариев построены и подсвечен нужный',
     sbtn.length === p.sc.length && sbtn[iMeet].classList.contains('on') &&
     getComputedStyle($('scenbox')).display !== 'none',
     'кнопок='+sbtn.length+' выбран='+sbtn.findIndex(b => b.classList.contains('on')));
  ck('у каждого сценария своя картинка',
     new Set(sbtn.map(b => b.querySelector('svg').innerHTML)).size === p.sc.length);
  ck('«импульс k₀» появился', getComputedStyle($('k0row')).display !== 'none');
  ck('в легенде колечко фазы', !!$('legend').querySelector('.dot.ph'));
  ck('в легенде норма, а не ∫', /‖u‖²/.test($('legend').textContent), $('legend').textContent);
  ck('подсказка объясняет, что нарисован модуль', /\|ψ\|/.test($('hint').textContent),
     $('hint').textContent);
});

steps.push(() => {
  const norm0 = D.sim.diagnostics().per[0].norm;
  for (let i=0;i<40;i++) $('stepb').click();
  const d = D.sim.diagnostics();
  ck('пакеты считаются', d.finite && D.sim.t > 0, 't='+D.sim.t.toFixed(2));
  // норма Шрёдингера сохраняется — это и есть признак, что комплексная часть
  // интерфейса (setU с мнимой частью, легенда, диаграмма) не портит состояние
  ck('норма ‖ψ‖² держится', Math.abs(d.per[0].norm/norm0 - 1) < 1e-10,
     'откл='+Math.abs(d.per[0].norm/norm0-1).toExponential(2));
  ck('мнимая часть поля не пустая', [...D.sim.getUi(0)].some(v => Math.abs(v) > 1e-6));

  // кривая рисуется фазой: на графике обязаны быть разные тона, а не один цвет поля
  const px = $('plot').getContext('2d').getImageData(0, 0, $('plot').width, $('plot').height).data;
  const hues = new Set();
  for (let i = 0; i < px.length; i += 4) {
    const r=px[i], g=px[i+1], b=px[i+2], mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    if (mx > 90 && mx - mn > 60) hues.add(Math.round(Math.atan2(Math.sqrt(3)*(g-b), 2*r-g-b)*8));
  }
  ck('кривая раскрашена фазой, а не одним цветом', hues.size >= 6, 'тонов='+hues.size);
});

steps.push(() => {
  // импульс: тот же нарисованный профиль с k₀ обязан поехать, а без него — стоять.
  // Сценарий выбирается кнопкой — заодно проверяется, что кнопка и правда грузит
  // именно Шрёдингер, а не «первый со сценариями»: сценарии есть и у φ⁴, и он
  // стоит в списке раньше — выбор по порядку молча уводил тест на другую задачу
  const p = D.PRESETS.find(q => /^Шрёдингер/.test(q.name));
  $('scen').children[p.sc.findIndex(s => /расплывание/.test(s.name))].click();
  ck('кнопка сценария загрузила «расплывание»', D.S.scen === 0 && D.S.k0 === 0 && D.sim.N === 512,
     'scen='+D.S.scen+' k0='+D.S.k0+' N='+D.sim.N);
  const centre = () => { const u=D.sim.getU(0), w=D.sim.getUi(0);
    let n=0,m=0; for(let j=0;j<D.sim.N;j++){ const p=u[j]*u[j]+w[j]*w[j]; n+=p; m+=p*D.sim.x[j]; }
    return m/n; };
  for (let i=0;i<30;i++) D.sim.step();
  ck('без импульса пакет стоит на месте', Math.abs(centre()) < 1e-6, centre().toExponential(2));

  $('k0').value = '3'; $('k0').dispatchEvent(new Event('input'));
  D.S.sel = 0;
  $('tools').querySelector('[data-tool="gauss"]').click();
  const r = $('plot').getBoundingClientRect();
  plot.dispatchEvent(new PointerEvent('pointerdown', {clientX:r.left+r.width*0.5, clientY:r.top+D.u2py(1), bubbles:true, pointerId:1, buttons:1}));
  plot.dispatchEvent(new PointerEvent('pointerup',   {clientX:r.left+r.width*0.5, clientY:r.top+D.u2py(1), bubbles:true, pointerId:1, buttons:1}));
  const c0 = centre();
  for (let i=0;i<200;i++) D.sim.step();
  const v = (centre() - c0)/D.sim.t;
  // групповая скорость свободного пакета ровно 2k₀ — заодно проверяет знак фазы
  ck('нарисованный пакет едет со скоростью 2k₀', Math.abs(v - 6) < 0.05, 'v='+v.toFixed(4));
});

steps.push(() => {
  // нелинейность с i — обычная задача, а не отказ: НУШ обязан приниматься,
  // считаться и держать норму. Раньше на этом месте проверялся текст запрета.
  setEq('i*ut + uxx + 2*abs(u)^2*u = 0');
  ck('НУШ принят интерфейсом', !$('err').textContent && D.sim.isComplex(0),
     $('err').textContent.slice(0,44));
  D.S.sel = 0; D.S.k0 = 0;
  $('tools').querySelector('[data-tool="sech"]').click();
  drag(0.5, 1);
  const n0 = D.sim.diagnostics().per[0].norm;
  for (let i=0;i<60;i++) $('stepb').click();
  const d = D.sim.diagnostics();
  ck('НУШ считается и норма держится', d.finite && Math.abs(d.per[0].norm/n0 - 1) < 1e-6,
     'откл='+Math.abs(d.per[0].norm/n0-1).toExponential(2));

  // ошибка с позицией всё ещё живёт — на том, что осталось запрещено
  $('eq').value = 'ut = i*uxx + u^i'; $('eq').dispatchEvent(new Event('input'));
  ck('комплексный показатель отвергается внятно', /Комплексный показатель/.test($('err').textContent),
     $('err').textContent.slice(0,44));
  ck('виноватый кусок подсвечен', !!$('eqhl').querySelector('.mk'));
  setEq('ut + u*ux + uxxx = 0');
  ck('после возврата к вещественной задаче k₀ скрыт',
     getComputedStyle($('k0row')).display === 'none' && !D.sim.isComplex(0));
  // ушли с пресета — ушли и его сценарии: у КдФ сценарий один, сам пресет
  ck('у пресета без сценариев строки сценариев нет',
     getComputedStyle($('scenbox')).display === 'none');
});

/* --- телефонная раскладка ---
   Прогон идёт в окне 1400x900, то есть в десктопном режиме: проверяем, что он
   остался нетронутым, и что порог переключения записан в CSS и в JS одинаково. */
steps.push(() => {
  const norm = s => s.replace(/\s+/g, '');
  let cond = null;
  for (const sh of document.styleSheets)
    for (const r of sh.cssRules)
      if (r.type === CSSRule.MEDIA_RULE && /max-width:\s*760px/.test(r.conditionText)) cond = r.conditionText;
  // порог записан дважды: @media в index.html и MOB в app.js. Разъедутся — пульт
  // окажется в двух местах сразу (или ни в одном)
  ck('порог телефона в CSS и в app.js совпадает', !!cond && norm(cond) === norm(D.MOB),
     cond + '  vs  ' + D.MOB);

  ck('пульт живёт в нижней строке', $('padbtns').parentNode.id === 'bar',
     $('padbtns').parentNode.id);
  ck('нижняя строка есть и на десктопе', getComputedStyle($('bar')).display === 'flex',
     getComputedStyle($('bar')).display);
  ck('на широком экране скорость — в нижней строке', $('speedbox').parentNode.id === 'barspd',
     $('speedbox').parentNode.id);
  ck('кнопка шторки на десктопе скрыта', getComputedStyle($('gear')).display === 'none',
     getComputedStyle($('gear')).display);
  ck('панель справа — не шторка',
     getComputedStyle(document.querySelector('aside')).position === 'static',
     getComputedStyle(document.querySelector('aside')).position);
  $('stepb').click();
  // показания счёта живут только здесь: острова «Диагностика» в панели больше нет
  ck('в нижней строке время и Δ за шаг',
     /^t \d/.test($('bart').textContent) && /Δ\/шаг/.test($('bart').textContent),
     $('bart').textContent);
  ck('отдельного острова диагностики нет', !$('diag') && !$('status'),
     String(!!$('diag')) + '/' + String(!!$('status')));
});

/* долгое нажатие вместо наведения: на тачскрине это единственный способ прочитать
   подсказку, и он не должен заодно нажимать саму кнопку */
let smoothWas = 0;
const press = () => {
  smoothWas = D.S.smooth;
  $('smooth').dispatchEvent(new PointerEvent('pointerdown',
    { bubbles:true, pointerId:9, pointerType:'touch', clientX:10, clientY:10 }));
};
press.wait = 700;                       // длиннее порога долгого нажатия (420 мс)
steps.push(press);

steps.push(() => {
  ck('долгое нажатие показывает подсказку', $('tip').classList.contains('on'), $('tip').className);
  ck('в подсказке текст этой кнопки', /гипервязкость/.test($('tip').textContent),
     $('tip').textContent.slice(0, 40));
  $('smooth').dispatchEvent(new PointerEvent('pointerup',
    { bubbles:true, pointerId:9, pointerType:'touch', clientX:10, clientY:10 }));
  $('smooth').click();                  // браузер шлёт click и после долгого нажатия
  ck('клик после долгого нажатия подавлен', D.S.smooth === smoothWas,
     'было ' + smoothWas + ', стало ' + D.S.smooth);
  $('smooth').click();
  ck('следующий клик работает как обычно', D.S.smooth !== smoothWas, String(D.S.smooth));
  $('smooth').click();                  // вернуть как было
});

steps.push(() => {
  ck('ошибок за весь прогон нет', window.__errs.length===0, window.__errs.join(' | '));
  const pre = document.createElement('pre'); pre.id='smoke';
  pre.textContent = R.join('\n');
  document.body.appendChild(pre);
  document.title = R.filter(l=>l.startsWith('FAIL')).length + ' failures';
});

let i = 0;
(function next(){
  if (i >= steps.length) return;
  const f = steps[i++];
  try { f(); } catch(e){ R.push('FAIL  исключение на шаге '+(i-1)+': '+e.message); }
  setTimeout(next, f.wait || 100);      // шаг может попросить паузу подлиннее (f.wait)
})();
})();
