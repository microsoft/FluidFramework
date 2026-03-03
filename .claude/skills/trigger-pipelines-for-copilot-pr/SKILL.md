---
name: trigger-pipelines-for-copilot-pr
description: Trigger ADO pipelines for a Copilot-created PR by posting /azp run comments. Use when the user asks to trigger CI pipelines for a specific PR.
allowed-tools: Bash(gh pr comment *)
argument-hint: [pr-number-or-url]
---

Post two comments to the PR specified by the user ($ARGUMENTS).
That will trigger all our pipelines, which is necessary for PRs that
are created by Copilot.
Comments need to be separate because otherwise it gets too long and
fails to trigger correctly.

Use the best technology available to you to comment on PRs.
If you're just given the PR number, assume it's for the microsoft/FluidFramework repository on GitHub.

The contents for each comment are as follows (text should be used verbatim):

First comment:

```
/azp run Build - protocol-definitions,Build - test-tools,server-gitrest,server-gitssh,server-historian,server-routerlicious,Build - client packages,repo-policy-check
```

Second comment:

```
/azp run Build - api-markdown-documenter,Build - benchmark-tool,Build - build-common,Build - build-tools,Build - common-utils,Build - eslint-config-fluid,Build - eslint-plugin-fluid
```
