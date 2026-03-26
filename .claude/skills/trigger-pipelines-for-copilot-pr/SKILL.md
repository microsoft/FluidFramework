---
name: trigger-pipelines-for-copilot-pr
description: Trigger ADO pipelines for a Copilot-created PR by posting /azp run comments. Use when the user asks to trigger CI pipelines for a specific PR.
allowed-tools: Bash(gh pr comment *)
context: fork
model: claude-haiku-4-5-20251001
argument-hint: [pr-number-or-url]
---

Post the following two comments to the PR specified by the user ($ARGUMENTS), in the `microsoft/FluidFramework` repository on GitHub.
They need to be posted separately because otherwise it gets too long and
fails to trigger correctly.

First comment:

```
/azp run Build - protocol-definitions,Build - test-tools,server-gitrest,server-gitssh,server-historian,server-routerlicious,Build - client packages,repo-policy-check
```

Second comment:

```
/azp run Build - api-markdown-documenter,Build - benchmark-tool,Build - build-common,Build - build-tools,Build - common-utils,Build - eslint-config-fluid,Build - eslint-plugin-fluid
```

Posting those comments will trigger all our pipelines, which is necessary for PRs that are created by Copilot.

To post the comments first check if the GitHub CLI is available,
and if so use `MSYS_NO_PATHCONV=1 gh pr comment <PULL_REQUEST_NUMBER> --repo microsoft/FluidFramework --body "<COMMENT_TEXT>"`.
Note: `MSYS_NO_PATHCONV=1` is required on Windows (Git Bash) to prevent `/azp` from being expanded to `C:/Program Files/Git/azp`.
If `gh` is not available but `$GITHUB_TOKEN` is, you can try the GitHub REST API directly, e.g.:

```
curl -L \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/microsoft/FluidFramework/issues/PULL_REQUEST_NUMBER/comments \
  -d '{"body":"<COMMENT_TEXT>"}'
```

If neither is available, don't do anything and tell the user you can't complete the request and why.
