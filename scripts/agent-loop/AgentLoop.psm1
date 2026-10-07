Set-StrictMode -Version Latest

function New-AgentLoopCommandAdapter {
    return {
        param(
            [string]$Executable,
            [string[]]$Arguments,
            [string]$WorkingDirectory
        )

        $previousLocation = Get-Location

        try {
            if (-not [string]::IsNullOrWhiteSpace($WorkingDirectory)) {
                Set-Location -LiteralPath $WorkingDirectory
            }

            $output = & $Executable @Arguments 2>&1
            $exitCode = $LASTEXITCODE
            $standardOutput = ($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine

            return [pscustomobject]@{
                ExitCode = $exitCode
                StdOut = $standardOutput
                StdErr = ""
            }
        }
        catch {
            return [pscustomobject]@{
                ExitCode = 1
                StdOut = ""
                StdErr = $_.Exception.Message
            }
        }
        finally {
            Set-Location -LiteralPath $previousLocation
        }
    }.GetNewClosure()
}

function Get-AgentLoopConfigurationPath {
    [CmdletBinding()]
    param()

    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $configurationDirectory = Join-Path $env:LOCALAPPDATA "PatternX"
        return Join-Path $configurationDirectory "agent-loop.json"
    }

    $configurationRoot = $env:XDG_CONFIG_HOME
    if ([string]::IsNullOrWhiteSpace($configurationRoot)) {
        $configurationRoot = Join-Path $HOME ".config"
    }

    $configurationDirectory = Join-Path $configurationRoot "patternx"
    return Join-Path $configurationDirectory "agent-loop.json"
}

function Invoke-AgentLoopCommand {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$CommandAdapter,

        [Parameter(Mandatory = $true)]
        [string]$Executable,

        [string[]]$Arguments = @(),

        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory
    )

    $result = & $CommandAdapter -Executable $Executable -Arguments $Arguments -WorkingDirectory $WorkingDirectory
    if ($null -eq $result -or $null -eq $result.PSObject.Properties["ExitCode"]) {
        throw "The command adapter returned an invalid result for '$Executable'."
    }

    if ($result.ExitCode -ne 0) {
        $commandText = @($Executable) + @($Arguments) -join " "
        $errorText = [string]$result.StdErr
        if ([string]::IsNullOrWhiteSpace($errorText)) {
            $errorText = [string]$result.StdOut
        }

        throw "Command '$commandText' failed with exit code $($result.ExitCode). $errorText".Trim()
    }

    return $result
}

function ConvertFrom-AgentLoopJson {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Json,

        [Parameter(Mandatory = $true)]
        [string]$ErrorMessage
    )

    try {
        return ConvertFrom-Json -InputObject $Json
    }
    catch {
        throw "$ErrorMessage $($_.Exception.Message)"
    }
}

function Get-AgentLoopAvailableModels {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$CatalogResponse
    )

    $modelRecords = @($CatalogResponse)
    if ($CatalogResponse.Count -eq 1 -and $null -ne $CatalogResponse[0].data) {
        $modelRecords = @($CatalogResponse[0].data)
    }

    $availableModels = foreach ($model in $modelRecords) {
        $statusProperty = $model.PSObject.Properties["status"]
        $enabledProperty = $model.PSObject.Properties["enabled"]
        $capabilitiesProperty = $model.PSObject.Properties["capabilities"]
        $toolsProperty = $null
        if ($null -ne $capabilitiesProperty -and $null -ne $capabilitiesProperty.Value) {
            $toolsProperty = $capabilitiesProperty.Value.PSObject.Properties["tools"]
        }

        if ($null -eq $statusProperty -or $statusProperty.Value -ne "active" -or
            $null -eq $enabledProperty -or -not $enabledProperty.Value -or
            $null -eq $toolsProperty -or -not $toolsProperty.Value) {
            continue
        }

        $providerProperty = $model.PSObject.Properties["providerID"]
        $modelIdProperty = $model.PSObject.Properties["modelID"]
        if ($null -eq $providerProperty -or $null -eq $modelIdProperty -or
            [string]::IsNullOrWhiteSpace([string]$providerProperty.Value) -or
            [string]::IsNullOrWhiteSpace([string]$modelIdProperty.Value)) {
            continue
        }

        $familyProperty = $model.PSObject.Properties["family"]
        $family = ""
        if ($null -ne $familyProperty) {
            $family = [string]$familyProperty.Value
        }
        if ([string]::IsNullOrWhiteSpace($family)) {
            $family = "$($providerProperty.Value)/$($modelIdProperty.Value)"
        }

        $nameProperty = $model.PSObject.Properties["name"]
        $modelName = [string]$modelIdProperty.Value
        if ($null -ne $nameProperty -and -not [string]::IsNullOrWhiteSpace([string]$nameProperty.Value)) {
            $modelName = [string]$nameProperty.Value
        }

        $variantsProperty = $model.PSObject.Properties["variants"]
        $modelVariants = @()
        if ($null -ne $variantsProperty) {
            $modelVariants = @($variantsProperty.Value | ForEach-Object { [string]$_.id })
        }

        [pscustomobject]@{
            Id = "$($providerProperty.Value)/$($modelIdProperty.Value)"
            ProviderId = [string]$providerProperty.Value
            ModelId = [string]$modelIdProperty.Value
            Family = $family
            Name = $modelName
            Variants = $modelVariants
        }
    }

    return @($availableModels | Sort-Object Id -Unique)
}

function Resolve-AgentLoopModel {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$AvailableModels,

        [Parameter(Mandatory = $true)]
        [string]$ModelId,

        [Parameter(Mandatory = $true)]
        [string]$Role,

        [Parameter(Mandatory = $true)]
        [string]$ReasoningBudget
    )

    $model = $AvailableModels | Where-Object { $_.Id -eq $ModelId } | Select-Object -First 1
    if ($null -eq $model) {
        throw "The selected $Role model '$ModelId' is not available with tool support in OpenCode."
    }

    $budgetTarget = switch ($ReasoningBudget) {
        "small" { "medium"; break }
        "medium" { "high"; break }
        "large" { "xhigh"; break }
        "unlimited" { "max"; break }
        default { throw "Unknown reasoning budget '$ReasoningBudget'." }
    }

    $effortOrder = @("minimal", "low", "medium", "high", "xhigh", "max")
    $targetIndex = [array]::IndexOf($effortOrder, $budgetTarget)
    $supportedEfforts = @($model.Variants | Where-Object { $effortOrder -contains $_ })
    $selectedVariant = $null
    $budgetMode = "provider-default"

    if ($supportedEfforts.Count -gt 0) {
        $compatibleEfforts = @(
            $supportedEfforts |
                Where-Object { [array]::IndexOf($effortOrder, $_) -le $targetIndex } |
                Sort-Object { [array]::IndexOf($effortOrder, $_) }
        )

        if ($compatibleEfforts.Count -eq 0) {
            throw "Model '$ModelId' has no reasoning variant compatible with the '$ReasoningBudget' budget."
        }

        $selectedVariant = $compatibleEfforts[-1]
        $budgetMode = "variant"
    }
    elseif ($model.Variants -contains "thinking" -or $model.Variants -contains "none") {
        if ($ReasoningBudget -eq "small" -and $model.Variants -contains "none") {
            $selectedVariant = "none"
            $budgetMode = "variant"
        }
        elseif ($ReasoningBudget -ne "small" -and $model.Variants -contains "thinking") {
            $selectedVariant = "thinking"
            $budgetMode = "variant"
        }
        else {
            throw "Model '$ModelId' has no reasoning variant compatible with the '$ReasoningBudget' budget."
        }
    }
    else {
        throw "Model '$ModelId' does not expose reasoning variants for the '$ReasoningBudget' budget."
    }

    $modelArgument = $model.Id
    if (-not [string]::IsNullOrWhiteSpace($selectedVariant)) {
        $modelArgument = "$modelArgument#$selectedVariant"
    }

    return [pscustomobject]@{
        Id = $model.Id
        Name = $model.Name
        Family = $model.Family
        Variant = $selectedVariant
        BudgetMode = $budgetMode
        Argument = $modelArgument
    }
}

function Read-AgentLoopModelChoice {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$AvailableModels,

        [Parameter(Mandatory = $true)]
        [string]$Role
    )

    while ($true) {
        $searchText = Read-Host "Search models for $Role by ID, name, or family"
        if ([string]::IsNullOrWhiteSpace($searchText)) {
            Write-Warning "Enter a model ID or a search phrase."
            continue
        }

        $exactModel = $AvailableModels | Where-Object { $_.Id -eq $searchText.Trim() } | Select-Object -First 1
        if ($null -ne $exactModel) {
            return $exactModel.Id
        }

        $matchingModels = @(
            $AvailableModels |
                Where-Object {
                    $_.Id -like "*$searchText*" -or
                    $_.Name -like "*$searchText*" -or
                    $_.Family -like "*$searchText*"
                } |
                Sort-Object Id |
                Select-Object -First 25
        )

        if ($matchingModels.Count -eq 0) {
            Write-Warning "No available model matched '$searchText'."
            continue
        }

        $matchingModels | Select-Object Id, Name, Family, Variants | Format-Table -AutoSize | Out-Host
        $selectedId = Read-Host "Enter one exact model ID from the list"
        $selectedModel = $AvailableModels | Where-Object { $_.Id -eq $selectedId.Trim() } | Select-Object -First 1
        if ($null -ne $selectedModel) {
            return $selectedModel.Id
        }

        Write-Warning "The selected model ID is not in the available list."
    }
}

function Get-AgentLoopInteractiveModelSelection {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$AvailableModels
    )

    $implementerModel = Read-AgentLoopModelChoice -AvailableModels $AvailableModels -Role "implementation"
    $repairerModel = Read-Host "Repair model ID (Enter to reuse implementation model)"
    if ([string]::IsNullOrWhiteSpace($repairerModel)) {
        $repairerModel = $implementerModel
    }
    else {
        $repairerModel = $AvailableModels |
            Where-Object { $_.Id -eq $repairerModel.Trim() } |
            Select-Object -ExpandProperty Id -First 1
        if ([string]::IsNullOrWhiteSpace($repairerModel)) {
            Write-Warning "The repair model must be an exact available model ID."
            $repairerModel = Read-AgentLoopModelChoice -AvailableModels $AvailableModels -Role "repair"
        }
    }

    $firstReviewerModel = Read-AgentLoopModelChoice -AvailableModels $AvailableModels -Role "first reviewer"
    $secondReviewerModel = Read-AgentLoopModelChoice -AvailableModels $AvailableModels -Role "second reviewer"
    $reasoningBudget = Read-Host "Reasoning budget (small, medium, large, unlimited)"

    return @{
        ModelSelection = @{
            Implementer = $implementerModel.Trim()
            Repairer = $repairerModel.Trim()
            Reviewers = @($firstReviewerModel.Trim(), $secondReviewerModel.Trim())
        }
        ReasoningBudget = $reasoningBudget.Trim().ToLowerInvariant()
    }
}

function Invoke-AgentLoopSetup {
    [CmdletBinding()]
    param(
        [string]$ConfigPath = (Get-AgentLoopConfigurationPath),

        [hashtable]$ModelSelection,

        [ValidateSet("small", "medium", "large", "unlimited")]
        [string]$ReasoningBudget,

        [Parameter(Mandatory = $true)]
        [scriptblock]$CommandAdapter,

        [string]$WorkingDirectory = (Get-Location).Path,

        [switch]$ValidateOnly
    )

    $versionResult = Invoke-AgentLoopCommand `
        -CommandAdapter $CommandAdapter `
        -Executable "opencode" `
        -Arguments @("--version") `
        -WorkingDirectory $WorkingDirectory

    if ([string]$versionResult.StdOut -notmatch "opencode v?2\.") {
        throw "OpenCode V2 is required. Detected: $($versionResult.StdOut)"
    }

    $catalogResult = Invoke-AgentLoopCommand `
        -CommandAdapter $CommandAdapter `
        -Executable "opencode" `
        -Arguments @("api", "get", "/api/model") `
        -WorkingDirectory $WorkingDirectory

    $catalogResponse = ConvertFrom-AgentLoopJson `
        -Json $catalogResult.StdOut `
        -ErrorMessage "OpenCode returned an invalid model catalog."

    $availableModels = Get-AgentLoopAvailableModels -CatalogResponse @($catalogResponse)
    if ($availableModels.Count -eq 0) {
        throw "OpenCode did not report any active models that support tools."
    }

    $authResult = Invoke-AgentLoopCommand `
        -CommandAdapter $CommandAdapter `
        -Executable "gh" `
        -Arguments @("auth", "status") `
        -WorkingDirectory $WorkingDirectory

    $authOutput = @([string]$authResult.StdOut, [string]$authResult.StdErr) -join [Environment]::NewLine
    $tokenScopeMatch = [regex]::Match($authOutput, "(?im)^\s*-\s*Token scopes:\s*(.*)$")
    $tokenScopes = @()
    if ($tokenScopeMatch.Success) {
        $tokenScopes = @(
            [regex]::Matches($tokenScopeMatch.Groups[1].Value, "'([^']+)'") |
                ForEach-Object { $_.Groups[1].Value }
        )
    }

    $repositoryResult = Invoke-AgentLoopCommand `
        -CommandAdapter $CommandAdapter `
        -Executable "gh" `
        -Arguments @("repo", "view", "--json", "nameWithOwner,defaultBranchRef,viewerPermission,isPrivate") `
        -WorkingDirectory $WorkingDirectory

    $repository = ConvertFrom-AgentLoopJson `
        -Json $repositoryResult.StdOut `
        -ErrorMessage "GitHub CLI returned invalid repository information."

    $repositoryName = [string]$repository.nameWithOwner
    $defaultBranch = ""
    $defaultBranchReference = $repository.PSObject.Properties["defaultBranchRef"]
    if ($null -ne $defaultBranchReference -and $null -ne $defaultBranchReference.Value) {
        $defaultBranchName = $defaultBranchReference.Value.PSObject.Properties["name"]
        if ($null -ne $defaultBranchName) {
            $defaultBranch = [string]$defaultBranchName.Value
        }
    }

    if ([string]::IsNullOrWhiteSpace($repositoryName)) {
        throw "GitHub CLI did not identify the current repository."
    }
    if ([string]::IsNullOrWhiteSpace($defaultBranch)) {
        throw "The GitHub repository has no default branch."
    }

    $isPrivateProperty = $repository.PSObject.Properties["isPrivate"]
    if ($null -eq $isPrivateProperty) {
        throw "GitHub CLI did not report whether the repository is private."
    }

    if ($repository.viewerPermission -notin @("WRITE", "MAINTAIN", "ADMIN")) {
        throw "GitHub access must include write permission to create branches and pull requests."
    }

    $githubScopeStatus = "not-exposed"
    if ($tokenScopes.Count -eq 0 -or $tokenScopes -contains "none") {
        throw "GitHub CLI did not expose token scopes. Authenticate with a token that exposes repository write access before running setup."
    }

    $hasRepositoryScope = $tokenScopes -contains "repo"
    $hasPublicRepositoryScope = -not $isPrivateProperty.Value -and $tokenScopes -contains "public_repo"
    if (-not $hasRepositoryScope -and -not $hasPublicRepositoryScope) {
        throw "The GitHub token is missing the repository write scope required by the agent loop."
    }
    $githubScopeStatus = "verified"

    if ($null -eq $ModelSelection -or [string]::IsNullOrWhiteSpace($ReasoningBudget)) {
        $interactiveSelection = Get-AgentLoopInteractiveModelSelection -AvailableModels $availableModels
        if ($null -eq $ModelSelection) {
            $ModelSelection = $interactiveSelection.ModelSelection
        }
        if ([string]::IsNullOrWhiteSpace($ReasoningBudget)) {
            $ReasoningBudget = $interactiveSelection.ReasoningBudget
        }
    }

    if (@($ModelSelection.Reviewers).Count -ne 2) {
        throw "Exactly two independent reviewer models must be selected."
    }

    $reviewerModels = @(
        Resolve-AgentLoopModel -AvailableModels $availableModels -ModelId $ModelSelection.Reviewers[0] -Role "first reviewer" -ReasoningBudget $ReasoningBudget
        Resolve-AgentLoopModel -AvailableModels $availableModels -ModelId $ModelSelection.Reviewers[1] -Role "second reviewer" -ReasoningBudget $ReasoningBudget
    )

    if ($reviewerModels[0].Id -eq $reviewerModels[1].Id) {
        throw "Reviewer roles must use different model IDs."
    }

    $resolvedModels = [pscustomobject]@{
        Implementer = Resolve-AgentLoopModel -AvailableModels $availableModels -ModelId $ModelSelection.Implementer -Role "implementer" -ReasoningBudget $ReasoningBudget
        Repairer = Resolve-AgentLoopModel -AvailableModels $availableModels -ModelId $ModelSelection.Repairer -Role "repairer" -ReasoningBudget $ReasoningBudget
        Reviewers = $reviewerModels
    }

    $configuration = [pscustomobject]@{
        SchemaVersion = 1
        Repository = $repositoryName
        DefaultBranch = $defaultBranch
        GitHubScopeStatus = $githubScopeStatus
        ReasoningBudget = $ReasoningBudget
        Models = $resolvedModels
    }

    if ($ValidateOnly) {
        if (-not (Test-Path -LiteralPath $ConfigPath)) {
            throw "No saved agent-loop configuration exists at '$ConfigPath'."
        }

        $savedConfiguration = ConvertFrom-AgentLoopJson `
            -Json (Get-Content -LiteralPath $ConfigPath -Raw) `
            -ErrorMessage "The saved agent-loop configuration is invalid."

        if ($savedConfiguration.Repository -ne $configuration.Repository -or
            $savedConfiguration.DefaultBranch -ne $configuration.DefaultBranch -or
            $savedConfiguration.ReasoningBudget -ne $configuration.ReasoningBudget) {
            throw "The saved agent-loop configuration is stale for this repository or its default branch."
        }

        $savedRoles = @(
            $savedConfiguration.Models.Implementer
            $savedConfiguration.Models.Repairer
            $savedConfiguration.Models.Reviewers[0]
            $savedConfiguration.Models.Reviewers[1]
        )
        $currentRoles = @(
            $configuration.Models.Implementer
            $configuration.Models.Repairer
            $configuration.Models.Reviewers[0]
            $configuration.Models.Reviewers[1]
        )

        for ($roleIndex = 0; $roleIndex -lt $currentRoles.Count; $roleIndex++) {
            if ($savedRoles[$roleIndex].Id -ne $currentRoles[$roleIndex].Id -or
                $savedRoles[$roleIndex].Argument -ne $currentRoles[$roleIndex].Argument) {
                throw "The saved model selection or reasoning variant for role $($roleIndex + 1) is no longer available."
            }
        }
    }

    if (-not $ValidateOnly) {
        $configurationDirectory = Split-Path -Parent $ConfigPath
        if (-not (Test-Path -LiteralPath $configurationDirectory)) {
            New-Item -ItemType Directory -Path $configurationDirectory -Force | Out-Null
        }

        $temporaryConfigPath = "$ConfigPath.$PID.tmp"
        $configurationJson = ConvertTo-Json -InputObject $configuration -Depth 8

        try {
            Set-Content -LiteralPath $temporaryConfigPath -Value $configurationJson -Encoding UTF8
            Move-Item -LiteralPath $temporaryConfigPath -Destination $ConfigPath -Force
        }
        catch {
            if (Test-Path -LiteralPath $temporaryConfigPath) {
                Remove-Item -LiteralPath $temporaryConfigPath -Force
            }
            throw
        }
    }

    return [pscustomobject]@{
        ConfigurationPath = $ConfigPath
        Repository = $repositoryName
        DefaultBranch = $defaultBranch
        GitHubScopeStatus = $githubScopeStatus
        ReasoningBudget = $ReasoningBudget
        Models = $resolvedModels
    }
}

function Test-AgentLoopSetupConfiguration {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ConfigPath,

        [Parameter(Mandatory = $true)]
        [scriptblock]$CommandAdapter,

        [string]$WorkingDirectory = (Get-Location).Path
    )

    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        throw "No saved agent-loop configuration exists at '$ConfigPath'."
    }

    $savedConfiguration = ConvertFrom-AgentLoopJson `
        -Json (Get-Content -LiteralPath $ConfigPath -Raw) `
        -ErrorMessage "The saved agent-loop configuration is invalid."
    $modelSelection = @{
        Implementer = [string]$savedConfiguration.Models.Implementer.Id
        Repairer = [string]$savedConfiguration.Models.Repairer.Id
        Reviewers = @(
            [string]$savedConfiguration.Models.Reviewers[0].Id
            [string]$savedConfiguration.Models.Reviewers[1].Id
        )
    }

    return Invoke-AgentLoopSetup `
        -ConfigPath $ConfigPath `
        -ModelSelection $modelSelection `
        -ReasoningBudget ([string]$savedConfiguration.ReasoningBudget) `
        -CommandAdapter $CommandAdapter `
        -WorkingDirectory $WorkingDirectory `
        -ValidateOnly
}

Export-ModuleMember -Function `
    Get-AgentLoopConfigurationPath, `
    Get-AgentLoopAvailableModels, `
    Invoke-AgentLoopCommand, `
    Invoke-AgentLoopSetup, `
    New-AgentLoopCommandAdapter, `
    Test-AgentLoopSetupConfiguration
