/* Крошечный статический сервер для прогона UI-тестов: ES-модули не живут на
   file://, поэтому dist-test раздаётся по http. Использование:
   node tests/serve.mjs [каталог] [порт] */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const [dir = 'dist-test', port = '4173'] = process.argv.slice(2);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

createServer(async (req, res) => {
  try {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))
      .replace(/^[\\/]+/, '');
    const f = join(dir, p || 'index.html');
    const data = await readFile(f);
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(+port, '127.0.0.1', () =>
  console.log('serving ' + dir + ' on http://127.0.0.1:' + port));
