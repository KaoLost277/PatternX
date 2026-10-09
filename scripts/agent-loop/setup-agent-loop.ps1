[CmdletBinding()]
param(
    [string]$ConfigPath,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$agentLoopDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptsDirectory = Split-Path -Parent $agentLoopDirectory
$repositoryRoot = Split-Path -Parent $scriptsDirectory
$modulePath = Join-Path $agentLoopDirectory "AgentLoop.psm1"

function Write-AgentLoopModelSummary {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RoleName,

        [Parameter(Mandatory = $true)]
        [pscustomobject]$Model
    )

    $summary = "$RoleName model: $($Model.Argument)"
    Write-Host $summary
}

Import-Module $modulePath -Force

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Get-AgentLoopConfigurationPath
}
$ConfigPath = Resolve-AgentLoopConfigurationPath -Path $ConfigPath -BaseDirectory $repositoryRoot

$reuseExistingConfiguration = $false

if ((Test-Path -LiteralPath $ConfigPath) -and -not $Force) {
    Write-Host "Existing setup found at $ConfigPath."
    $overwriteConfirmation = Read-Host "Replace it with new model roles and budget? (y/N)"
    if ($overwriteConfirmation -notmatch "^(y|yes)$") {
        $reuseExistingConfiguration = $true
    }
}

if ($reuseExistingConfiguration) {
    try {
        $setupResult = Test-AgentLoopSetupConfiguration `
            -ConfigPath $ConfigPath `
            -CommandAdapter (New-AgentLoopCommandAdapter) `
            -WorkingDirectory $repositoryRoot
    }
    catch {
        throw "The existing setup is no longer valid. Rerun with -Force to select replacement roles. $($_.Exception.Message)"
    }
}
else {
    $setupResult = Invoke-AgentLoopSetup `
        -ConfigPath $ConfigPath `
        -CommandAdapter (New-AgentLoopCommandAdapter) `
        -WorkingDirectory $repositoryRoot
}

Install-AgentLoopPester

Write-Host "Agent loop setup is ready for $($setupResult.Repository)."
Write-Warning "OpenCode runs on this computer, but later agent requests may send issue text and source files it reads to the selected model provider."
if ($reuseExistingConfiguration) {
    Write-Host "Existing model choices were revalidated and kept."
}
Write-Host "Default branch: $($setupResult.DefaultBranch)"
Write-Host "Configuration: $($setupResult.ConfigurationPath)"
Write-Host "Reasoning budget: $($setupResult.ReasoningBudget)"
Write-Host "Reviewer models configured: $($setupResult.Models.Reviewers.Count) (rerun with -Force to change)"
Write-Host "GitHub repository write scope: verified"

foreach ($roleName in @("Implementer", "Repairer")) {
    Write-AgentLoopModelSummary -RoleName $roleName -Model $setupResult.Models.$roleName
}

for ($reviewerIndex = 0; $reviewerIndex -lt $setupResult.Models.Reviewers.Count; $reviewerIndex++) {
    $reviewerNumber = $reviewerIndex + 1
    $reviewerModel = $setupResult.Models.Reviewers[$reviewerIndex]
    Write-AgentLoopModelSummary -RoleName "Reviewer $reviewerNumber" -Model $reviewerModel
}
