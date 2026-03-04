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

Use the GitHub CLI command `gh pr comment` to post the required comments to the PR. If `gh` is not available, but `$GITHUB_TOKEN` is, you can try the GitHub REST API directly, e.g.:

\`\`\`
curl -L \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/pulls/PULL_NUMBER/comments \
  -d '{"body":"Great stuff!","commit_id":"6dcb09b5b57875f334f61aebed695e2e4193db5e","path":"file1.txt","start_line":1,"start_side":"RIGHT","line":2,"side":"RIGHT"}'
\`\`\`

If neither is available, don't do anything and tell the user you can't complete the request and why.
If you're just given the PR number, assume it's for the microsoft/FluidFramework repository on GitHub, and ensure that any `gh pr comment` invocation includes `--repo microsoft/FluidFramework` (or an equivalent explicit repo selection) so it targets that repository when `$ARGUMENTS` is just a number.

The contents for each comment are as follows (text should be used verbatim):

First comment:

```
/azp run Build - protocol-definitions,Build - test-tools,server-gitrest,server-gitssh,server-historian,server-routerlicious,Build - client packages,repo-policy-check
```

Second comment:

```
/azp run Build - api-markdown-documenter,Build - benchmark-tool,Build - build-common,Build - build-tools,Build - common-utils,Build - eslint-config-fluid,Build - eslint-plugin-fluid
```
