BeforeAll {
    Import-Module (Join-Path $PSScriptRoot "../../scripts/agent-loop/AgentLoop.psm1") -Force

    function New-FakeAgentLoopCommandAdapter {
        param(
            [Parameter(Mandatory = $true)]
            [hashtable]$Responses
        )

        $calls = New-Object System.Collections.ArrayList
        $adapter = {
            param(
                [string]$Executable,
                [string[]]$Arguments,
                [string]$WorkingDirectory
            )

            $call = [pscustomobject]@{
                Executable = $Executable
                Arguments = @($Arguments)
                WorkingDirectory = $WorkingDirectory
            }
            [void]$calls.Add($call)

            $commandKey = "$Executable $($Arguments -join ' ')"
            if (-not $Responses.ContainsKey($commandKey)) {
                throw "Unexpected external command: $commandKey"
            }

            return $Responses[$commandKey]
        }.GetNewClosure()

        return [pscustomobject]@{
            Invoke = $adapter
            Calls = $calls
        }
    }

    function New-AgentLoopDefaultSetupSelection {
        param(
            [string]$Implementer = "openrouter/openai/gpt-6-luna",
            [string]$Repairer = "openrouter/openai/gpt-6-luna",
            [string[]]$Reviewers = @(
                "openrouter/anthropic/claude-opus-5.5"
                "openrouter/x-ai/grok-4.7"
            ),
            [string]$ReasoningBudget = "large"
        )

        return @{
            Implementer = $Implementer
            Repairer = $Repairer
            Reviewers = $Reviewers
            ReasoningBudget = $ReasoningBudget
        }
    }

    function New-AgentLoopSetupResponses {
        $models = @(
            [pscustomobject]@{
                providerID = "openrouter"
                modelID = "openai/gpt-6-luna"
                family = "gpt"
                name = "GPT-6 Luna"
                status = "active"
                enabled = $true
                capabilities = [pscustomobject]@{
                    tools = $true
                }
                variants = @(
                    [pscustomobject]@{
                        id = "low"
                    }
                    [pscustomobject]@{
                        id = "medium"
                    }
                    [pscustomobject]@{
                        id = "high"
                    }
                    [pscustomobject]@{
                        id = "xhigh"
                    }
                    [pscustomobject]@{
                        id = "max"
                    }
                )
            }
            [pscustomobject]@{
                providerID = "openrouter"
                modelID = "openai/gpt-5.4"
                family = "gpt"
                name = "GPT-5.4"
                status = "active"
                enabled = $true
                capabilities = [pscustomobject]@{
                    tools = $true
                }
                variants = @(
                    [pscustomobject]@{
                        id = "high"
                    }
                )
            }
            [pscustomobject]@{
                providerID = "openrouter"
                modelID = "anthropic/claude-opus-5.5"
                family = "claude-opus"
                name = "Claude Opus 5.5"
                status = "active"
                enabled = $true
                capabilities = [pscustomobject]@{
                    tools = $true
                }
                variants = @(
                    [pscustomobject]@{
                        id = "high"
                    }
                    [pscustomobject]@{
                        id = "max"
                    }
                )
            }
            [pscustomobject]@{
                providerID = "openrouter"
                modelID = "x-ai/grok-4.7"
                family = "grok"
                name = "Grok 4.7"
                status = "active"
                enabled = $true
                capabilities = [pscustomobject]@{
                    tools = $true
                }
                variants = @(
                    [pscustomobject]@{
                        id = "high"
                    }
                    [pscustomobject]@{
                        id = "xhigh"
                    }
                )
            }
            [pscustomobject]@{
                providerID = "openrouter"
                modelID = "microsoft/phi-4"
                name = "Phi 4"
                status = "active"
                enabled = $true
                capabilities = [pscustomobject]@{
                    tools = $true
                }
                variants = @(
                    [pscustomobject]@{
                        id = "high"
                    }
                )
            }
            [pscustomobject]@{
                providerID = "openrouter"
                modelID = "microsoft/phi-4-mini"
                family = "phi"
                name = "Phi 4 Mini"
                status = "active"
                enabled = $true
                capabilities = [pscustomobject]@{
                    tools = $true
                }
                variants = @()
            }
        )

        $modelCatalog = [pscustomobject]@{
            location = [pscustomobject]@{
                directory = "C:\repo"
            }
            data = $models
        }

        $repository = [pscustomobject]@{
            nameWithOwner = "KaoLost277/PatternX"
            defaultBranchRef = [pscustomobject]@{
                name = "main"
            }
            viewerPermission = "WRITE"
            isPrivate = $false
        }

        return @{
            "opencode --version" = [pscustomobject]@{
                ExitCode = 0
                StdOut = "opencode v2.0.24"
                StdErr = ""
            }
            "opencode api get /api/model" = [pscustomobject]@{
                ExitCode = 0
                StdOut = ConvertTo-Json -InputObject $modelCatalog -Depth 8 -Compress
                StdErr = ""
            }
            "gh auth status" = [pscustomobject]@{
                ExitCode = 0
                StdOut = "Logged in to github.com`n  - Token scopes: 'repo', 'workflow'"
                StdErr = ""
            }
            "gh repo view --json nameWithOwner,defaultBranchRef,viewerPermission,isPrivate" = [pscustomobject]@{
                ExitCode = 0
                StdOut = ConvertTo-Json -InputObject $repository -Depth 4 -Compress
                StdErr = ""
            }
        }
    }
}

Describe "Invoke-AgentLoopSetup" {
    It "stores the default configuration outside the repository" {
        $configurationPath = Get-AgentLoopConfigurationPath
        $repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path

        $configurationPath.StartsWith($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) |
            Should -Be $false
        $configurationPath | Should -Match "PatternX[\\/]agent-loop\.json$"
    }

    It "revalidates an existing setup without changing its saved model choices" {
        $configurationPath = Join-Path $TestDrive "revalidated-agent-loop.json"
        $selection = New-AgentLoopDefaultSetupSelection
        $setupAdapter = New-FakeAgentLoopCommandAdapter -Responses (New-AgentLoopSetupResponses)

        Invoke-AgentLoopSetup `
            -ConfigPath $configurationPath `
            -SetupSelection $selection `
            -CommandAdapter $setupAdapter.Invoke `
            -WorkingDirectory $TestDrive | Out-Null

        $configurationBeforeValidation = Get-Content $configurationPath -Raw
        $validationAdapter = New-FakeAgentLoopCommandAdapter -Responses (New-AgentLoopSetupResponses)
        $result = Test-AgentLoopSetupConfiguration `
            -ConfigPath $configurationPath `
            -CommandAdapter $validationAdapter.Invoke `
            -WorkingDirectory $TestDrive

        $result.GitHubScopeStatus | Should -Be "verified"
        (Get-Content $configurationPath -Raw) | Should -Be $configurationBeforeValidation
    }

    It "validates the local tools and writes the selected role models without credentials" {
        $fakeCommandAdapter = New-FakeAgentLoopCommandAdapter -Responses (New-AgentLoopSetupResponses)
        $configurationPath = Join-Path $TestDrive "agent-loop.json"
        $selection = New-AgentLoopDefaultSetupSelection

        $result = Invoke-AgentLoopSetup `
            -ConfigPath $configurationPath `
            -SetupSelection $selection `
            -CommandAdapter $fakeCommandAdapter.Invoke `
            -WorkingDirectory $TestDrive

        $result.Repository | Should -Be "KaoLost277/PatternX"
        $result.DefaultBranch | Should -Be "main"
        $result.GitHubScopeStatus | Should -Be "verified"
        (Test-Path $configurationPath) | Should -Be $true
        $savedConfiguration = Get-Content $configurationPath -Raw | ConvertFrom-Json
        $savedConfiguration.Models.Implementer.Id | Should -Be "openrouter/openai/gpt-6-luna"
        $savedConfiguration.Models.Implementer.Argument | Should -Be "openrouter/openai/gpt-6-luna#xhigh"
        $savedConfiguration.Models.Implementer.BudgetMode | Should -Be "variant"
        $savedConfiguration.Models.Reviewers.Count | Should -Be 2
        $savedConfiguration.Models.Reviewers[0].Argument | Should -Be "openrouter/anthropic/claude-opus-5.5#high"
        $savedConfiguration.Models.Reviewers[1].Argument | Should -Be "openrouter/x-ai/grok-4.7#xhigh"
        $savedConfiguration.ReasoningBudget | Should -Be "large"
        $fakeCommandAdapter.Calls.Count | Should -Be 4
        ($fakeCommandAdapter.Calls | Where-Object { $_.Executable -eq "gh" }).Count | Should -Be 2
        ((Get-Content $configurationPath -Raw) -match "token|secret|api.?key") | Should -Be $false
    }

    It "refuses GitHub accounts without write access before saving configuration" {
        $responses = New-AgentLoopSetupResponses
        $responses["gh repo view --json nameWithOwner,defaultBranchRef,viewerPermission,isPrivate"] = [pscustomobject]@{
            ExitCode = 0
            StdOut = '{"nameWithOwner":"KaoLost277/PatternX","defaultBranchRef":{"name":"main"},"viewerPermission":"READ","isPrivate":false}'
            StdErr = ""
        }
        $fakeCommandAdapter = New-FakeAgentLoopCommandAdapter -Responses $responses
        $configurationPath = Join-Path $TestDrive "read-only-agent-loop.json"
        $selection = New-AgentLoopDefaultSetupSelection

        {
            Invoke-AgentLoopSetup `
                -ConfigPath $configurationPath `
                -SetupSelection $selection `
                -CommandAdapter $fakeCommandAdapter.Invoke `
                -WorkingDirectory $TestDrive
        } | Should -Throw

        (Test-Path $configurationPath) | Should -Be $false
    }

    It "refuses classic GitHub credentials without repository write scope" {
        $responses = New-AgentLoopSetupResponses
        $responses["gh auth status"] = [pscustomobject]@{
            ExitCode = 0
            StdOut = "Logged in to github.com`n  - Token scopes: 'read:org', 'workflow'"
            StdErr = ""
        }
        $fakeCommandAdapter = New-FakeAgentLoopCommandAdapter -Responses $responses
        $configurationPath = Join-Path $TestDrive "missing-write-scope-agent-loop.json"
        $selection = New-AgentLoopDefaultSetupSelection

        {
            Invoke-AgentLoopSetup `
                -ConfigPath $configurationPath `
                -SetupSelection $selection `
                -CommandAdapter $fakeCommandAdapter.Invoke `
                -WorkingDirectory $TestDrive
        } | Should -Throw -ExpectedMessage "*repo*scope*"

        (Test-Path $configurationPath) | Should -Be $false
    }

    It "refuses GitHub credentials when token write scopes cannot be verified" {
        $responses = New-AgentLoopSetupResponses
        $responses["gh auth status"] = [pscustomobject]@{
            ExitCode = 0
            StdOut = "Logged in to github.com"
            StdErr = ""
        }
        $fakeCommandAdapter = New-FakeAgentLoopCommandAdapter -Responses $responses
        $configurationPath = Join-Path $TestDrive "unknown-write-scope-agent-loop.json"
        $selection = New-AgentLoopDefaultSetupSelection

        {
            Invoke-AgentLoopSetup `
                -ConfigPath $configurationPath `
                -SetupSelection $selection `
                -CommandAdapter $fakeCommandAdapter.Invoke `
                -WorkingDirectory $TestDrive
        } | Should -Throw -ExpectedMessage "*token scopes*"

        (Test-Path $configurationPath) | Should -Be $false
    }

    It "allows distinct reviewer models from the same family" {
        $fakeCommandAdapter = New-FakeAgentLoopCommandAdapter -Responses (New-AgentLoopSetupResponses)
        $configurationPath = Join-Path $TestDrive "same-family-agent-loop.json"
        $selection = New-AgentLoopDefaultSetupSelection -Reviewers @(
            "openrouter/openai/gpt-6-luna"
            "openrouter/openai/gpt-5.4"
        )

        $result = Invoke-AgentLoopSetup `
            -ConfigPath $configurationPath `
            -SetupSelection $selection `
            -CommandAdapter $fakeCommandAdapter.Invoke `
            -WorkingDirectory $TestDrive

        $result.Models.Reviewers[0].Id | Should -Be "openrouter/openai/gpt-6-luna"
        $result.Models.Reviewers[1].Id | Should -Be "openrouter/openai/gpt-5.4"
        (Test-Path $configurationPath) | Should -Be $true
    }

    It "rejects using one model ID for both independent reviewer roles" {
        $fakeCommandAdapter = New-FakeAgentLoopCommandAdapter -Responses (New-AgentLoopSetupResponses)
        $configurationPath = Join-Path $TestDrive "duplicate-reviewer-agent-loop.json"
        $selection = New-AgentLoopDefaultSetupSelection -Reviewers @(
            "openrouter/anthropic/claude-opus-5.5"
            "openrouter/anthropic/claude-opus-5.5"
        )

        {
            Invoke-AgentLoopSetup `
                -ConfigPath $configurationPath `
                -SetupSelection $selection `
                -CommandAdapter $fakeCommandAdapter.Invoke `
                -WorkingDirectory $TestDrive
        } | Should -Throw

        (Test-Path $configurationPath) | Should -Be $false
    }

    It "rejects a model ID that is not enabled in the current OpenCode catalog" {
        $fakeCommandAdapter = New-FakeAgentLoopCommandAdapter -Responses (New-AgentLoopSetupResponses)
        $configurationPath = Join-Path $TestDrive "unavailable-model-agent-loop.json"
        $selection = New-AgentLoopDefaultSetupSelection -Implementer "unavailable/provider-model"

        {
            Invoke-AgentLoopSetup `
                -ConfigPath $configurationPath `
                -SetupSelection $selection `
                -CommandAdapter $fakeCommandAdapter.Invoke `
                -WorkingDirectory $TestDrive
        } | Should -Throw

        (Test-Path $configurationPath) | Should -Be $false
    }

    It "uses the model ID as its family when the catalog omits that optional field" {
        $fakeCommandAdapter = New-FakeAgentLoopCommandAdapter -Responses (New-AgentLoopSetupResponses)
        $configurationPath = Join-Path $TestDrive "optional-family-agent-loop.json"
        $selection = New-AgentLoopDefaultSetupSelection -Implementer "openrouter/microsoft/phi-4"

        $result = Invoke-AgentLoopSetup `
            -ConfigPath $configurationPath `
            -SetupSelection $selection `
            -CommandAdapter $fakeCommandAdapter.Invoke `
            -WorkingDirectory $TestDrive

        $result.Models.Implementer.Family | Should -Be "openrouter/microsoft/phi-4"
        $result.Models.Implementer.Argument | Should -Be "openrouter/microsoft/phi-4#high"
    }

    It "refuses an empty repository without a default branch" {
        $responses = New-AgentLoopSetupResponses
        $responses["gh repo view --json nameWithOwner,defaultBranchRef,viewerPermission,isPrivate"] = [pscustomobject]@{
            ExitCode = 0
            StdOut = '{"nameWithOwner":"KaoLost277/PatternX","defaultBranchRef":null,"viewerPermission":"WRITE","isPrivate":false}'
            StdErr = ""
        }
        $fakeCommandAdapter = New-FakeAgentLoopCommandAdapter -Responses $responses
        $configurationPath = Join-Path $TestDrive "missing-default-branch-agent-loop.json"
        $selection = New-AgentLoopDefaultSetupSelection

        {
            Invoke-AgentLoopSetup `
                -ConfigPath $configurationPath `
                -SetupSelection $selection `
                -CommandAdapter $fakeCommandAdapter.Invoke `
                -WorkingDirectory $TestDrive
        } | Should -Throw -ExpectedMessage "*default branch*"

        (Test-Path $configurationPath) | Should -Be $false
    }

    It "rejects a selected model with no reasoning variants" {
        $fakeCommandAdapter = New-FakeAgentLoopCommandAdapter -Responses (New-AgentLoopSetupResponses)
        $configurationPath = Join-Path $TestDrive "provider-default-agent-loop.json"
        $selection = New-AgentLoopDefaultSetupSelection -Implementer "openrouter/microsoft/phi-4-mini"

        {
            Invoke-AgentLoopSetup `
                -ConfigPath $configurationPath `
                -SetupSelection $selection `
                -CommandAdapter $fakeCommandAdapter.Invoke `
                -WorkingDirectory $TestDrive
        } | Should -Throw -ExpectedMessage "*reasoning variant*"

        (Test-Path $configurationPath) | Should -Be $false
    }

    It "rejects a reasoning budget that no selected model variant can satisfy" {
        $fakeCommandAdapter = New-FakeAgentLoopCommandAdapter -Responses (New-AgentLoopSetupResponses)
        $configurationPath = Join-Path $TestDrive "unsupported-budget-agent-loop.json"
        $selection = New-AgentLoopDefaultSetupSelection -Implementer "openrouter/openai/gpt-5.4" -ReasoningBudget "small"

        {
            Invoke-AgentLoopSetup `
                -ConfigPath $configurationPath `
                -SetupSelection $selection `
                -CommandAdapter $fakeCommandAdapter.Invoke `
                -WorkingDirectory $TestDrive
        } | Should -Throw -ExpectedMessage "*reasoning variant compatible*"

        (Test-Path $configurationPath) | Should -Be $false
    }
}

Describe "Agent-loop OpenCode permissions" {
    It "denies arbitrary tools and external paths and keeps reviewers read-only" {
        $agentDirectory = Join-Path $PSScriptRoot "../../.opencode/agents"
        $workerProfile = Get-Content (Join-Path $agentDirectory "agent-loop-worker.md") -Raw
        $reviewerProfile = Get-Content (Join-Path $agentDirectory "agent-loop-reviewer.md") -Raw

        $workerProfile | Should -Match 'action: "\*"\s+resource: "\*"\s+effect: deny'
        $workerProfile | Should -Match 'action: external_directory\s+resource: "\*"\s+effect: deny'
        $workerProfile | Should -Match 'action: edit\s+resource: "\.git"\s+effect: deny'
        $workerProfile | Should -Match 'action: read\s+resource: "\.git"\s+effect: deny'
        $workerProfile | Should -Match 'resource: "\*\.env\*"\s+effect: deny'
        $workerProfile | Should -Match 'resource: "\*secrets/\*"\s+effect: deny'
        $workerProfile | Should -Match 'resource: "\*secret\*"\s+effect: deny'
        $workerProfile | Should -Match 'resource: "\*\.env\.example"\s+effect: allow'
        $workerProfile | Should -Not -Match 'action: shell'
        $workerProfile | Should -Match 'action: edit\s+resource: "\*secret\*"\s+effect: deny'
        $workerProfile | Should -Not -Match 'action: grep\s+resource: "\*"\s+effect: allow'
        $workerProfile | Should -Not -Match 'action: shell\s+resource: "git '
        $reviewerProfile | Should -Match 'action: "\*"\s+resource: "\*"\s+effect: deny'
        $reviewerProfile | Should -Match 'action: external_directory\s+resource: "\*"\s+effect: deny'
        $reviewerProfile | Should -Match 'action: read\s+resource: "\.git"\s+effect: deny'
        $reviewerProfile | Should -Match 'resource: "\*secret\*"\s+effect: deny'
        $reviewerProfile | Should -Match 'resource: "\*\.env\.example"\s+effect: allow'
        $reviewerProfile | Should -Not -Match 'action: grep\s+resource: "\*"\s+effect: allow'
        $reviewerProfile | Should -Not -Match 'action: edit'
        $reviewerProfile | Should -Not -Match 'action: shell'
    }
}
