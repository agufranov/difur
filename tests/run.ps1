# Прогон всех проверок в headless Edge.  Запуск:  powershell -File tests\run.ps1
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
$prof = Join-Path $env:TEMP 'difur-test-profile'

function Run-Page($url, $size = '1400,900') {
  # без 2>$null: в PowerShell 5.1 перенаправление stderr нативного exe ломает конвейер
  & $edge --headless=new --disable-gpu --no-sandbox --window-size=$size `
          --virtual-time-budget=120000 --user-data-dir="$prof" --dump-dom $url | Out-String
}

# index.html с внедрённым сценарием: перехват ошибок в <head>, скрипт перед </body>
function Make-Page($driver, $file) {
  $cap = '<script>window.__errs=[];window.onerror=function(m,s,l){window.__errs.push(m+" @"+l);};</script>'
  $src = Get-Content (Join-Path $root 'index.html') -Raw -Encoding UTF8
  $src = $src -replace '<meta charset="utf-8">', ('<meta charset="utf-8">' + $cap)
  $src = $src -replace '</body>', ('<script src="tests/' + $driver + '"></script></body>')
  $page = Join-Path $root $file
  $src | Out-File -Encoding utf8 $page
  return $page
}

# 1. ядро (решатель + разбор уравнений)
$u = 'file:///' + ((Join-Path $root 'tests\core-tests.html') -replace '\\','/')
$out = Run-Page $u
if ($out -match '(?s)<pre id="out">(.*?)</pre>') { "=== ЯДРО ==="; $matches[1] }

# 2. интерфейс в широком окне
$page = Make-Page 'ui-driver.js' '_ui-test.html'
try {
  $out = Run-Page ('file:///' + ($page -replace '\\','/'))
  if ($out -match '(?s)<pre id="smoke">(.*?)</pre>') { "=== ИНТЕРФЕЙС ==="; $matches[1] }
  else { "ИНТЕРФЕЙС: нет результата" }
} finally { Remove-Item $page -Force -ErrorAction SilentlyContinue }

# 3. телефонная раскладка: то же index.html в узком окне. Отдельный прогон, а не
#    resize внутри страницы: медиазапросы и вёрстка должны отработать с загрузки
$page = Make-Page 'ui-mobile.js' '_ui-mobile.html'
try {
  $out = Run-Page ('file:///' + ($page -replace '\\','/')) '420,860'
  if ($out -match '(?s)<pre id="mobile">(.*?)</pre>') { "=== ТЕЛЕФОН ==="; $matches[1] }
  else { "ТЕЛЕФОН: нет результата" }
} finally { Remove-Item $page -Force -ErrorAction SilentlyContinue }
