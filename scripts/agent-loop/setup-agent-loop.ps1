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

foreach ($roleName in @("Implementer", "Repairer")) {
    $roleModel = $setupResult.Models.$roleName
    if ($roleModel.BudgetMode -eq "provider-default") {
        Write-Host "$roleName model: $($roleModel.Argument) (provider default; no reasoning variant exposed)"
    }
    else {
        Write-Host "$roleName model: $($roleModel.Argument)"
    }
}

foreach ($reviewerModel in $setupResult.Models.Reviewers) {
    if ($reviewerModel.BudgetMode -eq "provider-default") {
        Write-Host "Reviewer model: $($reviewerModel.Argument) (provider default; no reasoning variant exposed)"
    }
    else {
        Write-Host "Reviewer model: $($reviewerModel.Argument)"
    }
}
