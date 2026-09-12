# Signs in to Firebase if needed, creates any missing hosting sites, and ships
# all four. Run it from the repo root:
#
#     powershell -ExecutionPolicy Bypass -File .\deploy.ps1


# Prefer this repo's own firebase-tools; fall back to a sibling checkout.
$candidates = @(
  "$PSScriptRoot\node_modules\.bin\firebase.cmd",
  "C:\Users\matt\Downloads\arctic games\node_modules\.bin\firebase.cmd"
)
$fb = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $fb) {
  Write-Host "No firebase CLI found. Run: npm install" -ForegroundColor Red
  exit 1
}
Write-Host "Using $fb" -ForegroundColor DarkGray

Set-Location $PSScriptRoot

Write-Host "`n== Checking login" -ForegroundColor Cyan
& $fb projects:list | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not signed in. A browser window will open." -ForegroundColor Yellow
  & $fb login --reauth
  & $fb projects:list | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host "Still not signed in - stopping." -ForegroundColor Red; exit 1 }
}
Write-Host "Signed in." -ForegroundColor Green

Write-Host "`n== Creating hosting sites" -ForegroundColor Cyan
foreach ($site in @('astral-games1', 'astral-gateway')) {
  # Already-exists is the expected outcome on every run after the first.
  & $fb hosting:sites:create $site 2>&1 | Out-String | Write-Host
}

Write-Host "`n== Building" -ForegroundColor Cyan
& npm run build:all
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed - stopping." -ForegroundColor Red; exit 1 }

Write-Host "`n== Deploying" -ForegroundColor Cyan
& $fb deploy --only hosting
if ($LASTEXITCODE -ne 0) { Write-Host "Deploy failed." -ForegroundColor Red; exit 1 }

Write-Host "`nLive:" -ForegroundColor Green
Write-Host "  https://astral-gateway.web.app   (the portal)"
Write-Host "  https://astral-games1.web.app    (the app)"
