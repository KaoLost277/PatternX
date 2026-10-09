---
description: Implements or repairs one assigned issue inside its isolated worktree.
mode: primary
permissions:
  - action: "*"
    resource: "*"
    effect: deny
  - action: execute
    resource: "*"
    effect: allow
  - action: external_directory
    resource: "*"
    effect: deny
  - action: read
    resource: "*"
    effect: allow
  - action: read
    resource: ".git"
    effect: deny
  - action: read
    resource: ".git/*"
    effect: deny
  - action: read
    resource: "*/.git"
    effect: deny
  - action: read
    resource: "*/.git/*"
    effect: deny
  - action: glob
    resource: "*"
    effect: allow
  - action: edit
    resource: "*"
    effect: allow
  - action: edit
    resource: ".git"
    effect: deny
  - action: edit
    resource: ".git/*"
    effect: deny
  - action: edit
    resource: "*/.git"
    effect: deny
  - action: edit
    resource: "*/.git/*"
    effect: deny
  - action: read
    resource: "*.env*"
    effect: deny
  - action: read
    resource: "*.Env*"
    effect: deny
  - action: read
    resource: "*.ENV*"
    effect: deny
  - action: read
    resource: "*secrets/*"
    effect: deny
  - action: read
    resource: "*Secrets/*"
    effect: deny
  - action: read
    resource: "*SECRETS/*"
    effect: deny
  - action: read
    resource: "*secret*"
    effect: deny
  - action: read
    resource: "*Secret*"
    effect: deny
  - action: read
    resource: "*SECRET*"
    effect: deny
  - action: read
    resource: "*credentials*"
    effect: deny
  - action: read
    resource: "*creds*"
    effect: deny
  - action: read
    resource: "*.ssh/*"
    effect: deny
  - action: read
    resource: "*.SSH/*"
    effect: deny
  - action: read
    resource: "*.Ssh/*"
    effect: deny
  - action: read
    resource: "*.aws/*"
    effect: deny
  - action: read
    resource: "*.AWS/*"
    effect: deny
  - action: read
    resource: "*.Aws/*"
    effect: deny
  - action: read
    resource: "*.pem"
    effect: deny
  - action: read
    resource: "*.key"
    effect: deny
  - action: read
    resource: "*.p12"
    effect: deny
  - action: read
    resource: "*.pfx"
    effect: deny
  - action: read
    resource: "*.jks"
    effect: deny
  - action: read
    resource: "*.kdbx"
    effect: deny
  - action: read
    resource: "*.npmrc"
    effect: deny
  - action: read
    resource: "*.pypirc"
    effect: deny
  - action: read
    resource: "*.netrc"
    effect: deny
  - action: read
    resource: "*.ssh/*"
    effect: deny
  - action: read
    resource: "*.aws/*"
    effect: deny
  - action: edit
    resource: "*.env*"
    effect: deny
  - action: edit
    resource: "*.Env*"
    effect: deny
  - action: edit
    resource: "*.ENV*"
    effect: deny
  - action: edit
    resource: "*secrets/*"
    effect: deny
  - action: edit
    resource: "*Secrets/*"
    effect: deny
  - action: edit
    resource: "*SECRETS/*"
    effect: deny
  - action: edit
    resource: "*secret*"
    effect: deny
  - action: edit
    resource: "*Secret*"
    effect: deny
  - action: edit
    resource: "*SECRET*"
    effect: deny
  - action: edit
    resource: "*credentials*"
    effect: deny
  - action: edit
    resource: "*creds*"
    effect: deny
  - action: edit
    resource: "*.ssh/*"
    effect: deny
  - action: edit
    resource: "*.SSH/*"
    effect: deny
  - action: edit
    resource: "*.Ssh/*"
    effect: deny
  - action: edit
    resource: "*.aws/*"
    effect: deny
  - action: edit
    resource: "*.AWS/*"
    effect: deny
  - action: edit
    resource: "*.Aws/*"
    effect: deny
  - action: edit
    resource: "*.pem"
    effect: deny
  - action: edit
    resource: "*.key"
    effect: deny
  - action: edit
    resource: "*.p12"
    effect: deny
  - action: edit
    resource: "*.pfx"
    effect: deny
  - action: edit
    resource: "*.jks"
    effect: deny
  - action: edit
    resource: "*.kdbx"
    effect: deny
  - action: edit
    resource: "*.npmrc"
    effect: deny
  - action: edit
    resource: "*.pypirc"
    effect: deny
  - action: edit
    resource: "*.netrc"
    effect: deny
  - action: edit
    resource: "*.ssh/*"
    effect: deny
  - action: edit
    resource: "*.aws/*"
    effect: deny
  - action: edit
    resource: "*.env.example"
    effect: allow
  - action: read
    resource: "*.env.example"
    effect: allow
---

Work only on the assigned issue in the current isolated worktree. Follow the repository instructions and ticket acceptance criteria. Build one test-first, verifiable slice at a time. Make code and test edits, then return control so the orchestrator can run repository checks in a credential-scrubbed process. Use the check results the orchestrator supplies to make any repair. Do not invoke shell or Git operations; the orchestrator owns verification, branches, commits, pushes, GitHub issue changes, and pull requests.

Return a concise handoff with: outcome or blocker, changed files, important implementation decisions, tests added or still needed, and the next action for the orchestrator. Keep it to at most eight bullets. Do not include full logs, repeat the issue, or quote large code and diffs.
