# Полный прогон тестов: ядро (Vitest, node) + интерфейс и телефон (headless Edge
# поверх сборки vite build --mode test). Файл обязан быть в UTF-8 с BOM — иначе
# PowerShell читает кириллицу как ANSI.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# В свежей оболочке node может отсутствовать в PATH (он ставится через fnm) —
# подхватываем алиас default напрямую.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $env:PATH = "$env:APPDATA\fnm\aliases\default;$env:PATH"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'FAIL  node не найден: поставь node или проверь fnm (алиас default)'
  exit 1
}
if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  Write-Host 'node_modules нет — npm install...'
  npm install | Out-Null
}

$bad = 0

Write-Host '=== ЯДРО (vitest) ==='
npx vitest run
if ($LASTEXITCODE -ne 0) { $bad++ ; Write-Host 'FAIL  тесты ядра упали' }

Write-Host ''
Write-Host '=== СБОРКА ТЕСТОВЫХ СТРАНИЦ ==='
node tests/make-pages.mjs
npx vite build --mode test
if ($LASTEXITCODE -ne 0) { Write-Host 'FAIL  vite build --mode test упал'; exit 1 }

$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edge)) { $edge = 'C:\Program Files\Microsoft\Edge\Application\msedge.exe' }
$prof = Join-Path $env:TEMP 'difur-test-profile'
$port = 47173

function Run-Page($url, $size) {
  & $edge --headless=new --disable-gpu --no-sandbox --window-size=$size `
          --virtual-time-budget=120000 --user-data-dir="$prof" --dump-dom $url | Out-String
}
function Show-Pre($dom, $id, $title) {
  Write-Host ''
  Write-Host "=== $title ==="
  if ($dom -match "(?s)<pre id=`"$id`">(.*?)</pre>") {
    $txt = $Matches[1] -replace '&lt;','<' -replace '&gt;','>' -replace '&amp;','&'
    Write-Host $txt
    return $txt
  }
  Write-Host "FAIL  страница не вернула <pre id=`"$id`"> (см. ошибки загрузки выше)"
  return 'FAIL  нет результата'
}

# ES-модули не живут на file:// — dist-test раздаёт крошечный статический сервер
$srv = Start-Process node -ArgumentList 'tests/serve.mjs','dist-test',"$port" -PassThru -WindowStyle Hidden
Start-Sleep -Milliseconds 700
try {
  $t1 = Show-Pre (Run-Page "http://127.0.0.1:$port/tests/ui.html" '1400,900') 'smoke' 'ИНТЕРФЕЙС'
  $t2 = Show-Pre (Run-Page "http://127.0.0.1:$port/tests/mobile.html" '420,860') 'mobile' 'ТЕЛЕФОН'
} finally {
  Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue
}

# Счёт по строкам PASS/FAIL (регистрозависимо: регистронезависимый поиск ловил бы
# LoadEnclaveImageW failed из журнала Edge). Ненулевой exit — сигнал для CI и агентов.
$all = ($t1 + "`n" + $t2) -split "`n"
$pass = ($all | Where-Object { $_ -cmatch '^PASS ' }).Count
$fail = ($all | Where-Object { $_ -cmatch '^FAIL ' }).Count
Write-Host ''
Write-Host "=== ИТОГО UI: PASS=$pass FAIL=$fail ==="
if ($fail -gt 0 -or $bad -gt 0) { exit 1 }
exit 0
