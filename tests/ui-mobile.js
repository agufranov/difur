/* Проверки телефонной раскладки (запускается через tests/run.ps1 в узком окне).
   Основной сценарий (tests/ui-driver.js) идёт в окне 1400x900 и до телефонных
   веток не достаёт, а логики там хватает: список пресетов ведёт себя иначе,
   превью ложится вниз экрана, пульт переезжает. Каждая проверка здесь стоит за
   уже случившейся жалобой. */
(function(){
const R = [];
const ck = (n, ok, i) => R.push((ok?'PASS  ':'FAIL  ') + n + (i!==undefined ? '   ['+i+']' : ''));
const $ = id => document.getElementById(id);
const D = window.__difur;
const list = $('plist'), btn = $('presetbtn'), prev = $('eqprev');
const at = re => D.PRESETS.findIndex(p => re.test(p.name));

const steps = [];

steps.push(() => {
  ck('загрузка без ошибок', window.__errs.length===0, window.__errs.join(' | '));
  // всё дальнейшее осмысленно только в телефонном режиме
  ck('окно узкое: телефонная раскладка включилась', matchMedia(D.MOB).matches,
     'innerWidth=' + innerWidth + ' innerHeight=' + innerHeight);
  ck('панель уехала в шторку',
     getComputedStyle(document.querySelector('aside')).position === 'fixed',
     getComputedStyle(document.querySelector('aside')).position);
  ck('скорость переехала в шторку', $('speedbox').parentNode.id === 'spdhome',
     $('speedbox').parentNode.id);
  ck('кнопка шторки видна', getComputedStyle($('gear')).display !== 'none');
});

/* --- фишки: значок обязан иметь размер ---
   Значки пропадали на телефоне целиком: в медиазапросе жило правило `.chip{padding:6px 11px}`
   от давно убранных кнопок-таблеток, а класс `.chip` носит значок фишки. При
   box-sizing:border-box отступы съедали все 14px ширины, и от значка оставалась пустота. */
steps.push(() => {
  btn.click();
  ck('список открывается на телефоне', list.classList.contains('on'));
  const iKdV = at(/Кортевег/);
  const chips = [...list.children[iKdV].querySelectorAll('svg.chip')];
  ck('у КдФ в пункте три значка', chips.length === 3, chips.length);
  const small = chips.filter(c => c.getBoundingClientRect().width < 12 ||
                                  c.getBoundingClientRect().height < 12);
  ck('значки не схлопнуты отступами', small.length === 0,
     chips.map(c => c.getBoundingClientRect().width.toFixed(1) + '×' +
                    c.getBoundingClientRect().height.toFixed(1)).join(' '));
  const pad = getComputedStyle(chips[0]).padding;
  ck('у значка нет отступов', /^0px/.test(pad), pad);
  const lr = list.getBoundingClientRect();
  const cr = chips[chips.length-1].getBoundingClientRect();
  ck('значки внутри списка, а не за краем', cr.right <= lr.right + 0.5,
     cr.right.toFixed(1) + ' vs ' + lr.right.toFixed(1));
});

/* --- тап по пункту показывает формулу и НЕ выбирает ---
   Выбор на телефоне делает одна кнопка «выбрать»: раньше повторный тап по тому же
   пункту применял пресет, и список закрывался под пальцем у того, кто листал. */
steps.push(() => {
  const was = $('preset').value, iSG = at(/отскок/);
  list.children[iSG].click();
  ck('тап показывает превью внизу экрана',
     prev.classList.contains('on') && prev.classList.contains('phone'), prev.className);
  ck('тап не закрывает список', list.classList.contains('on'));
  ck('тап ничего не выбирает', $('preset').value === was, was + ' -> ' + $('preset').value);
  list.children[iSG].click();          // второй тап по тому же пункту
  ck('повторный тап тоже не выбирает',
     list.classList.contains('on') && $('preset').value === was, $('preset').value);
  ck('в превью есть кнопка «выбрать»', !!prev.querySelector('.pick'));
  /* имя пресета читается в заголовке превью — на узком экране оно обязано
     помещаться целиком, с переносом, а не уезжать вбок */
  const ttl = prev.querySelector('.ttl');
  ck('заголовок превью — полное имя пресета',
     !!ttl && ttl.textContent === D.PRESETS[iSG].name, ttl ? ttl.textContent : 'нет заголовка');
  ck('длинное имя не обрезано в заголовке', ttl.scrollWidth <= ttl.clientWidth + 1,
     ttl.scrollWidth + ' vs ' + ttl.clientWidth);
});

/* --- список раскрывается только до верхнего края превью ---
   Превью лежит внизу экрана, список раскрывается сверху, и они налезали друг на
   друга: у длинной формулы с расшифровкой фишек превью съедало нижние пункты. */
steps.push(() => {
  const check = (name, i) => {
    list.children[i].click();
    const lr = list.getBoundingClientRect(), pr = prev.getBoundingClientRect();
    ck('список кончается над превью: ' + name, lr.bottom <= pr.top - 4,
       'низ списка ' + lr.bottom.toFixed(1) + ', верх превью ' + pr.top.toFixed(1));
    ck('список не схлопнут: ' + name, lr.height > 100, lr.height.toFixed(1));
    return pr.height;
  };
  const hSG = check('синус-Гордон', at(/отскок/));      // формула + три расшифровки
  const hHeat = check('теплопроводность', at(/Теплопроводность/));  // формула без фишек
  // потолок считается по факту, а не задан числом: разные превью — разный потолок
  ck('высокое превью ужимает список сильнее', hSG > hHeat, hSG.toFixed(0) + ' vs ' + hHeat.toFixed(0));
});

/* --- выбирает только кнопка «выбрать» --- */
steps.push(() => {
  const iSG = at(/отскок/);
  list.children[iSG].click();
  prev.querySelector('.pick').click();
  ck('«выбрать» применяет пресет', +$('preset').value === iSG, $('preset').value + ' vs ' + iSG);
  ck('и закрывает список', !list.classList.contains('on'));
  ck('уравнение подставлено', /sin\(u\)/.test($('eq').value), $('eq').value);
  ck('потолок списка снят вместе с превью', list.style.maxHeight === '',
     list.style.maxHeight);
});

steps.push(() => {
  ck('ошибок за весь прогон нет', window.__errs.length===0, window.__errs.join(' | '));
  const pre = document.createElement('pre'); pre.id='mobile';
  pre.textContent = R.join('\n');
  document.body.appendChild(pre);
});

let i = 0;
(function next(){
  if (i >= steps.length) return;
  const f = steps[i++];
  try { f(); } catch(e){ R.push('FAIL  исключение на шаге '+(i-1)+': '+e.message); }
  setTimeout(next, f.wait || 100);
})();
})();
