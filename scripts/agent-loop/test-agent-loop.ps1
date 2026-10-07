$ErrorActionPreference = "Stop"

Import-Module Pester -RequiredVersion 5.7.1 -Force

$testDirectory = Join-Path $PSScriptRoot "../../tests/powershell"
Invoke-Pester -Path $testDirectory -CI
