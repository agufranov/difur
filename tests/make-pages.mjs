/* Генерация тестовых страниц из корневого index.html: та же разметка и тот же
   модуль приложения, плюс перехват ошибок в <head> (классический скрипт — он
   выполняется до модулей) и драйвер прогона в конце <body> (module-скрипт —
   выполняется после src/main.ts, порядок модулей в документе гарантирован).
   Страницы кладутся в tests/ и собираются `vite build --mode test`; в git они
   не попадают (.gitignore). Якоря — структурные теги </head> и </body>, а не
   строки текста, как у прежней регексп-инъекции. */
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cap = '<script>window.__errs=[];window.onerror=function(m,s,l){window.__errs.push(m+" @"+l);};</script>';
const page = driver => src
  .replace('</head>', cap + '\n</head>')
  .replace('</body>', '<script type="module" src="/tests/' + driver + '"></script>\n</body>');

writeFileSync(new URL('./ui.html', import.meta.url), page('ui-driver.js'));
writeFileSync(new URL('./mobile.html', import.meta.url), page('ui-mobile.js'));
console.log('tests/ui.html и tests/mobile.html собраны из index.html');
