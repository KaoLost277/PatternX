# Starts the Data Completeness Profiler locally on Windows.
$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $repositoryRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Output "Creating the Python virtual environment ..."
    python -m venv (Join-Path $repositoryRoot ".venv")
}

Write-Output "Installing the API dependencies ..."
& $venvPython -m pip install --quiet -r (Join-Path $repositoryRoot "backend\requirements.txt")

if (-not (Test-Path (Join-Path $repositoryRoot "frontend\node_modules"))) {
    Write-Output "Installing the web UI dependencies ..."
    Push-Location (Join-Path $repositoryRoot "frontend")
    npm install
    Pop-Location
}

Write-Output "Starting the API on http://127.0.0.1:8000 (loopback only) ..."
$apiProcess = Start-Process -PassThru -NoNewWindow `
    -FilePath $venvPython `
    -ArgumentList "-m", "app.serve" `
    -WorkingDirectory (Join-Path $repositoryRoot "backend")

try {
    Write-Output "Starting the web UI on http://localhost:5173 ..."
    Push-Location (Join-Path $repositoryRoot "frontend")
    npm run dev
    Pop-Location
}
finally {
    Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue
}
