# Прогон всех проверок в headless Edge.  Запуск:  powershell -File tests\run.ps1
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
$prof = Join-Path $env:TEMP 'difur-test-profile'

function Run-Page($url) {
  # без 2>$null: в PowerShell 5.1 перенаправление stderr нативного exe ломает конвейер
  & $edge --headless=new --disable-gpu --no-sandbox --window-size=1400,900 `
          --virtual-time-budget=120000 --user-data-dir="$prof" --dump-dom $url | Out-String
}

# 1. ядро (решатель + разбор уравнений)
$u = 'file:///' + ((Join-Path $root 'tests\core-tests.html') -replace '\\','/')
$out = Run-Page $u
if ($out -match '(?s)<pre id="out">(.*?)</pre>') { "=== ЯДРО ==="; $matches[1] }

# 2. интерфейс: index.html с внедрённым сценарием
$page = Join-Path $root '_ui-test.html'
$cap = '<script>window.__errs=[];window.onerror=function(m,s,l){window.__errs.push(m+" @"+l);};</script>'
$src = Get-Content (Join-Path $root 'index.html') -Raw -Encoding UTF8
$src = $src -replace '<meta charset="utf-8">', ('<meta charset="utf-8">' + $cap)
$src = $src -replace '</body>', '<script src="tests/ui-driver.js"></script></body>'
$src | Out-File -Encoding utf8 $page
try {
  $out = Run-Page ('file:///' + ($page -replace '\\','/'))
  if ($out -match '(?s)<pre id="smoke">(.*?)</pre>') { "=== ИНТЕРФЕЙС ==="; $matches[1] }
  else { "ИНТЕРФЕЙС: нет результата" }
} finally { Remove-Item $page -Force -ErrorAction SilentlyContinue }
