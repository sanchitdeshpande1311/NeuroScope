# NeuroScope 3D - start the four integrated modules (working copies extracted from the supplied ZIPs).
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\start_integrations.ps1
# Returns the started processes (start.ps1 stops them on exit).
#
#   Landing page   node build   http://localhost:3101  (served to users through the workspace at "/")
#   AI chatbot     node build   http://localhost:3102  (floating panel in the workspace)
#   Tracker web    node build   http://localhost:3103  (Tracker page in the workspace)
#   Tracker API    FastAPI      http://localhost:8008  (port fixed by the module's run_backend.py)
#   Locate web     Vite dev     http://localhost:3104  (Locate page in the workspace)
#   Locate API     Express      http://localhost:5001  (port expected by the module's Vite proxy)
#
# Module folder: $env:NEUROSCOPE_MODULES_DIR, default <user home>\NeuroScope3D_modules (outside OneDrive, because each
# module ships with its own node_modules). The original ZIP archives are never touched.
param([string]$ModulesDir = $(
    if ($env:NEUROSCOPE_MODULES_DIR) {
        $env:NEUROSCOPE_MODULES_DIR
    } else {
        $localMod = Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) "modules"
        if (Test-Path $localMod) { $localMod } else { Join-Path $HOME "NeuroScope3D_modules" }
    }
))

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$py = Join-Path $root "venv\Scripts\python.exe"
$procs = @()

function Start-Module([string]$name, [string]$dir, [string]$exe, [string[]]$moduleArgs, [hashtable]$envVars) {
    if (-not (Test-Path $dir)) { Write-Warning "$name not found at $dir - skipped"; return $null }
    $saved = @{}
    foreach ($k in $envVars.Keys) { $saved[$k] = [Environment]::GetEnvironmentVariable($k); [Environment]::SetEnvironmentVariable($k, $envVars[$k]) }
    try {
        $p = Start-Process -FilePath $exe -ArgumentList $moduleArgs -WorkingDirectory $dir -PassThru -WindowStyle Hidden
        Write-Host ("{0,-12} PID {1}" -f $name, $p.Id)
        return $p
    } finally {
        foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }
    }
}

$landing = Join-Path $ModulesDir "NeuroBrain Landing page"
$chat    = Join-Path $ModulesDir "screenshot-perfect-project-39"
$tracker = Join-Path $ModulesDir "tumor-tracker-nifti"
$locate  = Join-Path $ModulesDir "location"

$procs += Start-Module "Landing" (Join-Path $landing ".output") "node" @("server/index.mjs") @{ PORT = "3101" }
# chatbot: LOVABLE_API_KEY is read from the environment if you set one (never stored in this project)
$procs += Start-Module "Chatbot" (Join-Path $chat ".output") "node" @("server/index.mjs") @{ PORT = "3102" }
$procs += Start-Module "TrackerWeb" (Join-Path $tracker ".output") "node" @("server/index.mjs") @{ PORT = "3103" }
$procs += Start-Module "TrackerAPI" (Join-Path $tracker "backend") $py @("run_backend.py") @{ PYTHONPATH = (Join-Path $ModulesDir "_pydeps\tracker") }
$procs += Start-Module "LocateAPI" $locate "cmd.exe" @("/c", "npx", "tsx", "server/index.ts") @{ PORT = "5001" }
$procs += Start-Module "LocateWeb" $locate "cmd.exe" @("/c", "npx", "vite", "--port", "3104", "--strictPort") @{}

return ($procs | Where-Object { $_ })
