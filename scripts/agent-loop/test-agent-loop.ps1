$ErrorActionPreference = "Stop"

Import-Module (Join-Path $PSScriptRoot "AgentLoop.psm1") -Force
Install-AgentLoopPester

$testDirectory = Join-Path $PSScriptRoot "../../tests/powershell"
Invoke-Pester -Path $testDirectory -CI
