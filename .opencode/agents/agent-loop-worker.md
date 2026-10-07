---
description: Implements or repairs one assigned issue inside its isolated worktree.
mode: primary
permissions:
  - action: "*"
    resource: "*"
    effect: deny
  - action: external_directory
    resource: "*"
    effect: deny
  - action: read
    resource: "*"
    effect: allow
  - action: glob
    resource: "*"
    effect: allow
  - action: grep
    resource: "*"
    effect: allow
  - action: edit
    resource: "*"
    effect: allow
  - action: shell
    resource: "npm run test:safety --prefix frontend"
    effect: allow
  - action: shell
    resource: "npm run lint --prefix frontend"
    effect: allow
  - action: shell
    resource: "npm run build --prefix frontend"
    effect: allow
  - action: shell
    resource: "git status --short"
    effect: allow
  - action: shell
    resource: "git diff --check"
    effect: allow
  - action: shell
    resource: "git diff -- ."
    effect: allow
  - action: shell
    resource: "git diff --cached -- ."
    effect: allow
  - action: read
    resource: "*.env*"
    effect: deny
  - action: read
    resource: "*secrets/*"
    effect: deny
  - action: read
    resource: "*credentials*"
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
    resource: "*.env.example"
    effect: allow
---

Work only on the assigned issue in the current isolated worktree. Follow the repository instructions and ticket acceptance criteria. Build one test-first, verifiable slice at a time. Run only the allowed repository checks. Report the exact files changed, checks run, and unresolved blockers. The orchestration runner owns Git branches, commits, pushes, GitHub issue changes, and pull requests.
