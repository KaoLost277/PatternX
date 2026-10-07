[CmdletBinding()]
param(
    [string]$ConfigPath,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$agentLoopDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $agentLoopDirectory)
$modulePath = Join-Path $agentLoopDirectory "AgentLoop.psm1"

Import-Module $modulePath -Force

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Get-AgentLoopConfigurationPath
}

if ((Test-Path -LiteralPath $ConfigPath) -and -not $Force) {
    Write-Host "Existing setup found at $ConfigPath."
    $overwriteConfirmation = Read-Host "Replace it with new model roles and budget? (y/N)"
    if ($overwriteConfirmation -notmatch "^(y|yes)$") {
        Write-Host "Existing setup was kept."
        exit 0
    }
}

$setupResult = Invoke-AgentLoopSetup `
    -ConfigPath $ConfigPath `
    -CommandAdapter (New-AgentLoopCommandAdapter) `
    -WorkingDirectory $repositoryRoot

Write-Host "Agent loop setup is ready for $($setupResult.Repository)."
Write-Host "Default branch: $($setupResult.DefaultBranch)"
Write-Host "Configuration: $($setupResult.ConfigurationPath)"
Write-Host "Reasoning budget: $($setupResult.ReasoningBudget)"
Write-Host "Implementation model: $($setupResult.Models.Implementer.Argument)"
Write-Host "Repair model: $($setupResult.Models.Repairer.Argument)"
Write-Host "Reviewer models: $($setupResult.Models.Reviewers[0].Argument), $($setupResult.Models.Reviewers[1].Argument)"
