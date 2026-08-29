/* Проверки телефонной раскладки (запускается через tests/run.ps1 в узком окне).
   Основной сценарий (tests/ui-driver.js) идёт в окне 1400x900 и до телефонных
   веток не достаёт, а логики там хватает: список карточек раскрывается во всю
   ширину, пульт переезжает в шторку. Каждая проверка здесь стоит за уже
   случившейся жалобой. */
(function(){
const R = [];
const ck = (n, ok, i) => R.push((ok?'PASS  ':'FAIL  ') + n + (i!==undefined ? '   ['+i+']' : ''));
const $ = id => document.getElementById(id);
const D = window.__difur;
const list = $('plist'), btn = $('presetbtn');
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
  // два, а не три: «дисперсия» — про механизм, она уехала в строку под кнопкой
  ck('у КдФ в карточке два значка', chips.length === 2, chips.length);
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
  /* Та же грабля общего имени класса, что и у `.chip`: строка фишек под кнопкой
     живёт на `.fxc`, и на телефоне по ней целятся пальцем, а не мышью. */
  const bar = [...$('fxbar').children];
  ck('строка фишек под кнопкой не пуста на телефоне', bar.length > 0, bar.length);
  const tiny = bar.filter(e => e.getBoundingClientRect().width < 24 ||
                               e.getBoundingClientRect().height < 24);
  ck('фишки под кнопкой не мельче пальца', tiny.length === 0,
     bar.map(e => e.getBoundingClientRect().width.toFixed(1) + '×' +
                  e.getBoundingClientRect().height.toFixed(1)).join(' '));
  ck('фишки под кнопкой подписаны', bar.every(e => /\|/.test(e.getAttribute('data-tip') || '')),
     bar.map(e => e.getAttribute('data-tip')).join(' / '));
});

/* --- карточка на телефоне: формулу и объяснение видно до выбора ---
   Раньше тап по пункту только показывал превью внизу экрана, а применяла пресет
   отдельная кнопка «выбрать»: формулу иначе негде было увидеть, и список с превью
   делили экран, налезая друг на друга. Теперь формула лежит в самой карточке,
   промежуточный шаг убран — тап выбирает. */
steps.push(() => {
  const iSG = at(/^Синус-Гордон$/);
  const c = list.children[iSG];
  ck('в карточке на телефоне есть формула', !!c.querySelector('.peq'), c.textContent);
  const f = c.querySelector('.peq').getBoundingClientRect();
  ck('формула не схлопнута', f.width > 40 && f.height > 10,
     f.width.toFixed(0) + '×' + f.height.toFixed(0));
  const note = c.querySelector('.note');
  ck('объяснение под формулой не пусто', !!note && note.textContent.length > 40,
     note ? note.textContent : 'нет строки');
  const nm = c.querySelector('.nm');
  ck('имя переносится, а не уезжает вбок', nm.scrollWidth <= nm.clientWidth + 1,
     nm.scrollWidth + ' vs ' + nm.clientWidth);
  /* карточка целиком помещается в ширину экрана: формула ездит внутри своей
     строки (.pform), а не растягивает список */
  const lr = list.getBoundingClientRect();
  ck('список не шире экрана', lr.right <= innerWidth + 0.5 && lr.left >= -0.5,
     lr.left.toFixed(1) + '…' + lr.right.toFixed(1) + ' при ' + innerWidth);
  ck('список не вылезает за низ экрана', lr.bottom <= innerHeight + 0.5,
     lr.bottom.toFixed(1) + ' vs ' + innerHeight);
  /* по значку в карточке на телефоне не наводят, а держат палец: цель должна быть
     не мельче пальца, иначе промах выберет пресет вместо показа подсказки */
  const fxi = [...list.children[at(/Кортевег/)].querySelectorAll('.fxi')];
  const tiny = fxi.filter(e => e.getBoundingClientRect().width < 24 ||
                               e.getBoundingClientRect().height < 24);
  ck('значки в карточке не мельче пальца', fxi.length > 0 && tiny.length === 0,
     fxi.map(e => e.getBoundingClientRect().width.toFixed(1) + '×' +
                  e.getBoundingClientRect().height.toFixed(1)).join(' '));
});

/* --- один тап выбирает --- */
steps.push(() => {
  const iSG = at(/^Синус-Гордон$/);
  list.children[iSG].click();
  ck('тап по карточке применяет пресет', +$('preset').value === iSG,
     $('preset').value + ' vs ' + iSG);
  ck('и закрывает список', !list.classList.contains('on'));
  ck('уравнение подставлено', /sin\(u\)/.test($('eq').value), $('eq').value);
  ck('на кнопке — имя выбранной задачи', /Синус-Гордон/.test(btn.textContent),
     btn.textContent);
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
