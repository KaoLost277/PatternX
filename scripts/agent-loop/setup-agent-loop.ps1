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
    if ($Model.BudgetMode -eq "provider-default") {
        $summary = "$summary (provider default; no reasoning variant exposed)"
    }

    Write-Host $summary
}

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
if ($setupResult.GitHubScopeStatus -eq "verified") {
    Write-Host "GitHub repository write scope: verified"
}
else {
    Write-Warning "GitHub reports repository write access but does not expose token scopes. The run must verify issue-claim access before starting model work."
}

foreach ($roleName in @("Implementer", "Repairer")) {
    Write-AgentLoopModelSummary -RoleName $roleName -Model $setupResult.Models.$roleName
}

for ($reviewerIndex = 0; $reviewerIndex -lt $setupResult.Models.Reviewers.Count; $reviewerIndex++) {
    $reviewerNumber = $reviewerIndex + 1
    $reviewerModel = $setupResult.Models.Reviewers[$reviewerIndex]
    Write-AgentLoopModelSummary -RoleName "Reviewer $reviewerNumber" -Model $reviewerModel
}
