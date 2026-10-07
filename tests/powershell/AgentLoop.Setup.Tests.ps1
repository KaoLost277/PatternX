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

    function New-AgentLoopSetupResponses {
        $models = @(
        [pscustomobject]@{
            providerID = "openrouter"
            modelID = "openai/gpt-6-luna"
            family = "gpt"
            name = "GPT-6 Luna"
            status = "active"
            enabled = $true
            capabilities = [pscustomobject]@{ tools = $true }
            variants = @(
                [pscustomobject]@{ id = "low" }
                [pscustomobject]@{ id = "medium" }
                [pscustomobject]@{ id = "high" }
                [pscustomobject]@{ id = "xhigh" }
                [pscustomobject]@{ id = "max" }
            )
        }
        [pscustomobject]@{
            providerID = "openrouter"
            modelID = "openai/gpt-5.4"
            family = "gpt"
            name = "GPT-5.4"
            status = "active"
            enabled = $true
            capabilities = [pscustomobject]@{ tools = $true }
            variants = @([pscustomobject]@{ id = "high" })
        }
        [pscustomobject]@{
            providerID = "openrouter"
            modelID = "anthropic/claude-opus-5.5"
            family = "claude-opus"
            name = "Claude Opus 5.5"
            status = "active"
            enabled = $true
            capabilities = [pscustomobject]@{ tools = $true }
            variants = @([pscustomobject]@{ id = "high" }, [pscustomobject]@{ id = "max" })
        }
        [pscustomobject]@{
            providerID = "openrouter"
            modelID = "x-ai/grok-4.7"
            family = "grok"
            name = "Grok 4.7"
            status = "active"
            enabled = $true
            capabilities = [pscustomobject]@{ tools = $true }
            variants = @([pscustomobject]@{ id = "high" }, [pscustomobject]@{ id = "xhigh" })
        }
        [pscustomobject]@{
            providerID = "openrouter"
            modelID = "microsoft/phi-4"
            name = "Phi 4"
            status = "active"
            enabled = $true
            capabilities = [pscustomobject]@{ tools = $true }
            variants = @()
        }
        )

        return @{
            "opencode --version" = [pscustomobject]@{
                ExitCode = 0
                StdOut = "opencode v2.0.24"
                StdErr = ""
            }
            "opencode api get /api/model" = [pscustomobject]@{
                ExitCode = 0
                StdOut = (@{ location = @{ directory = "C:\repo" }; data = $models } | ConvertTo-Json -Depth 8 -Compress)
                StdErr = ""
            }
            "gh auth status" = [pscustomobject]@{
                ExitCode = 0
                StdOut = "Logged in to github.com"
                StdErr = ""
            }
            "gh repo view --json nameWithOwner,defaultBranchRef,viewerPermission" = [pscustomobject]@{
                ExitCode = 0
                StdOut = '{"nameWithOwner":"KaoLost277/PatternX","defaultBranchRef":{"name":"main"},"viewerPermission":"WRITE"}'
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

    It "validates the local tools and writes the selected role models without credentials" {
        $fake = New-FakeAgentLoopCommandAdapter -Responses (New-AgentLoopSetupResponses)
        $configurationPath = Join-Path $TestDrive "agent-loop.json"
        $selection = @{
            Implementer = "openrouter/openai/gpt-6-luna"
            Repairer = "openrouter/openai/gpt-6-luna"
            Reviewers = @(
                "openrouter/anthropic/claude-opus-5.5"
                "openrouter/x-ai/grok-4.7"
            )
        }

        $result = Invoke-AgentLoopSetup `
            -ConfigPath $configurationPath `
            -ModelSelection $selection `
            -ReasoningBudget "large" `
            -CommandAdapter $fake.Invoke `
            -WorkingDirectory $TestDrive

        $result.Repository | Should -Be "KaoLost277/PatternX"
        $result.DefaultBranch | Should -Be "main"
        (Test-Path $configurationPath) | Should -Be $true
        $savedConfiguration = Get-Content $configurationPath -Raw | ConvertFrom-Json
        $savedConfiguration.Models.Implementer.Id | Should -Be "openrouter/openai/gpt-6-luna"
        $savedConfiguration.Models.Implementer.Argument | Should -Be "openrouter/openai/gpt-6-luna#xhigh"
        $savedConfiguration.Models.Reviewers.Count | Should -Be 2
        $savedConfiguration.Models.Reviewers[0].Argument | Should -Be "openrouter/anthropic/claude-opus-5.5#high"
        $savedConfiguration.Models.Reviewers[1].Argument | Should -Be "openrouter/x-ai/grok-4.7#xhigh"
        $savedConfiguration.ReasoningBudget | Should -Be "large"
        $fake.Calls.Count | Should -Be 4
        ($fake.Calls | Where-Object { $_.Executable -eq "gh" }).Count | Should -Be 2
        ((Get-Content $configurationPath -Raw) -match "token|secret|api.?key") | Should -Be $false
    }

    It "refuses GitHub accounts without write access before saving configuration" {
        $responses = New-AgentLoopSetupResponses
        $responses["gh repo view --json nameWithOwner,defaultBranchRef,viewerPermission"] = [pscustomobject]@{
            ExitCode = 0
            StdOut = '{"nameWithOwner":"KaoLost277/PatternX","defaultBranchRef":{"name":"main"},"viewerPermission":"READ"}'
            StdErr = ""
        }
        $fake = New-FakeAgentLoopCommandAdapter -Responses $responses
        $configurationPath = Join-Path $TestDrive "read-only-agent-loop.json"
        $selection = @{
            Implementer = "openrouter/openai/gpt-6-luna"
            Repairer = "openrouter/openai/gpt-6-luna"
            Reviewers = @(
                "openrouter/anthropic/claude-opus-5.5"
                "openrouter/x-ai/grok-4.7"
            )
        }

        {
            Invoke-AgentLoopSetup `
                -ConfigPath $configurationPath `
                -ModelSelection $selection `
                -ReasoningBudget "large" `
                -CommandAdapter $fake.Invoke `
                -WorkingDirectory $TestDrive
        } | Should -Throw

        (Test-Path $configurationPath) | Should -Be $false
    }

    It "requires the independent reviewers to come from different model families" {
        $fake = New-FakeAgentLoopCommandAdapter -Responses (New-AgentLoopSetupResponses)
        $configurationPath = Join-Path $TestDrive "same-family-agent-loop.json"
        $selection = @{
            Implementer = "openrouter/openai/gpt-6-luna"
            Repairer = "openrouter/openai/gpt-6-luna"
            Reviewers = @(
                "openrouter/openai/gpt-6-luna"
                "openrouter/openai/gpt-5.4"
            )
        }

        {
            Invoke-AgentLoopSetup `
                -ConfigPath $configurationPath `
                -ModelSelection $selection `
                -ReasoningBudget "large" `
                -CommandAdapter $fake.Invoke `
                -WorkingDirectory $TestDrive
        } | Should -Throw

        (Test-Path $configurationPath) | Should -Be $false
    }

    It "rejects a model ID that is not enabled in the current OpenCode catalog" {
        $fake = New-FakeAgentLoopCommandAdapter -Responses (New-AgentLoopSetupResponses)
        $configurationPath = Join-Path $TestDrive "unavailable-model-agent-loop.json"
        $selection = @{
            Implementer = "unavailable/provider-model"
            Repairer = "openrouter/openai/gpt-6-luna"
            Reviewers = @(
                "openrouter/anthropic/claude-opus-5.5"
                "openrouter/x-ai/grok-4.7"
            )
        }

        {
            Invoke-AgentLoopSetup `
                -ConfigPath $configurationPath `
                -ModelSelection $selection `
                -ReasoningBudget "large" `
                -CommandAdapter $fake.Invoke `
                -WorkingDirectory $TestDrive
        } | Should -Throw

        (Test-Path $configurationPath) | Should -Be $false
    }

    It "uses the model ID as its family when the catalog omits that optional field" {
        $fake = New-FakeAgentLoopCommandAdapter -Responses (New-AgentLoopSetupResponses)
        $configurationPath = Join-Path $TestDrive "optional-family-agent-loop.json"
        $selection = @{
            Implementer = "openrouter/microsoft/phi-4"
            Repairer = "openrouter/openai/gpt-6-luna"
            Reviewers = @(
                "openrouter/anthropic/claude-opus-5.5"
                "openrouter/x-ai/grok-4.7"
            )
        }

        $result = Invoke-AgentLoopSetup `
            -ConfigPath $configurationPath `
            -ModelSelection $selection `
            -ReasoningBudget "large" `
            -CommandAdapter $fake.Invoke `
            -WorkingDirectory $TestDrive

        $result.Models.Implementer.Family | Should -Be "openrouter/microsoft/phi-4"
        $result.Models.Implementer.Argument | Should -Be "openrouter/microsoft/phi-4"
    }
}
