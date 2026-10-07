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

function Ensure-AgentLoopPester {
    $requiredVersion = [version]"5.7.1"
    $availablePester = Find-AgentLoopPesterModule -Version $requiredVersion

    if ($availablePester.Count -eq 0) {
        Write-Host "Installing Pester $requiredVersion for the current user."
        Install-Module `
            -Name Pester `
            -RequiredVersion $requiredVersion `
            -Scope CurrentUser `
            -Repository PSGallery `
            -Force `
            -SkipPublisherCheck

        $availablePester = Find-AgentLoopPesterModule -Version $requiredVersion
    }

    if ($availablePester.Count -eq 0) {
        throw "Pester $requiredVersion could not be installed for the current user."
    }

    Import-Module Pester -RequiredVersion $requiredVersion -Force
}

function Find-AgentLoopPesterModule {
    param(
        [Parameter(Mandatory = $true)]
        [version]$Version
    )

    return Get-Module -ListAvailable -Name Pester |
        Where-Object { $_.Version -eq $Version } |
        Select-Object -First 1
}

Import-Module $modulePath -Force
Ensure-AgentLoopPester

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Get-AgentLoopConfigurationPath
}

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

Write-Host "Agent loop setup is ready for $($setupResult.Repository)."
if ($reuseExistingConfiguration) {
    Write-Host "Existing model choices were revalidated and kept."
}
Write-Host "Default branch: $($setupResult.DefaultBranch)"
Write-Host "Configuration: $($setupResult.ConfigurationPath)"
Write-Host "Reasoning budget: $($setupResult.ReasoningBudget)"
Write-Host "GitHub repository write scope: verified"

foreach ($roleName in @("Implementer", "Repairer")) {
    Write-AgentLoopModelSummary -RoleName $roleName -Model $setupResult.Models.$roleName
}

for ($reviewerIndex = 0; $reviewerIndex -lt $setupResult.Models.Reviewers.Count; $reviewerIndex++) {
    $reviewerNumber = $reviewerIndex + 1
    $reviewerModel = $setupResult.Models.Reviewers[$reviewerIndex]
    Write-AgentLoopModelSummary -RoleName "Reviewer $reviewerNumber" -Model $reviewerModel
}
