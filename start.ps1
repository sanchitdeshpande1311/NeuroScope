# NeuroScope 3D - start everything: the four integrated modules, the backend (port 8000) and the workspace (port 3000).
# Usage (from the project root):  powershell -ExecutionPolicy Bypass -File .\start.ps1
#        add -NoIntegrations to start only the backend and the workspace (as before the integration).
# Open http://localhost:3000 - the landing page; "Start Segmentation" opens the workspace at /upload.
param([switch]$NoIntegrations)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = Join-Path $root "venv\Scripts\python.exe"
if (-not (Test-Path $py)) { Write-Error "venv not found. Create it: python -m venv venv; venv\Scripts\pip install -r requirements.txt"; exit 1 }
if (-not (Test-Path (Join-Path $root "frontend\node_modules"))) { Push-Location (Join-Path $root "frontend"); npm.cmd install; Pop-Location }
$modules = @()
if ($NoIntegrations) { $env:NEUROSCOPE_LANDING_ORIGIN = "off" } else { $modules = & (Join-Path $root "scripts\start_integrations.ps1") }
if (-not $modules -or $modules.Count -eq 0) { if (-not $env:NEUROSCOPE_LANDING_ORIGIN) { $env:NEUROSCOPE_LANDING_ORIGIN = "off" } }
$backend = Start-Process -FilePath $py -ArgumentList "`"$(Join-Path $root 'backend\main.py')`"" -WorkingDirectory $root -PassThru -NoNewWindow
Write-Host "Backend PID $($backend.Id) on http://127.0.0.1:8000  (research/teaching use only)"
Write-Host "Website: http://localhost:3000  (landing page; workspace at /upload)"
try {
    Push-Location (Join-Path $root "frontend")
    npm.cmd run dev
} finally {
    Pop-Location
    Stop-Process -Id $backend.Id -ErrorAction SilentlyContinue
    # module processes (cmd.exe wrappers take their child node process with them via /T)
    foreach ($p in $modules) { & taskkill /PID $p.Id /T /F 2>$null | Out-Null }
}
