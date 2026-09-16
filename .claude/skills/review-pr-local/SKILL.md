---
name: review-pr-local
description: The authority on pulling a pull request — Azure DevOps or GitHub — into an isolated local worktree so a human can review it in their editor, and on posting human-controlled review comments back to the PR (ADO via the ado PR-thread MCP tools or the Azure DevOps REST API, GitHub via the gh CLI). Auto-detects the platform and all identifiers from the PR URL; not tied to any specific repository. The AI assists an interactive human review and only ever posts comments the human explicitly requests. If you find yourself checking out a PR branch over the user's own working tree, or posting AI-authored review prose the human did not ask for, invoke this skill instead.
allowed-tools: Bash(git:*), Bash(az:*), Bash(gh:*), Read, Grep, Glob, AskUserQuestion
argument-hint: "[PR-url]"
---

# Review a PR Locally (ADO + GitHub)

Check out a pull request into an **isolated git worktree** — never disturbing the user's current checkout — surface its changes in the editor, run an interactive review where the human drives, and post only the comments the human asks for. All identifiers are derived from the PR URL, so the skill works against any ADO or GitHub repository.

## Review Philosophy — high-signal, human-owned

This is the core of the skill. Violating it defeats the purpose.

- **The human drives the review.** The AI surfaces the parts worth attention and answers the human's questions. It never decides on its own to flood the PR with comments.
- **Comments are posted only on explicit human request**, in one of two ways:
  1. **Human-dictated:** the human gives exact location + text (e.g. `post comment on line 53 of src/foo.ts - this returns before the lock is released`). Post it verbatim.
  2. **AI-drafted on request:** the human asks the AI to write a comment for a specific spot (e.g. `add a comment on the null check in bar.ts`). Draft it terse and high-signal, show it, and post only after the human approves.
- **When surfacing "important parts," comment-worthy means:** correctness bugs, logic errors, security issues, breaking API changes, missing edge cases, data loss/corruption, race conditions, broken error handling. Ignore style, formatting, and naming.
- **Never post** praise, summaries, restatements of what the code does, or style nits — in either mode.
- **Every posted comment** cites a concrete `file:line` and is 1–3 sentences.

## Step 1 — Parse the PR URL

Detect the platform and extract every identifier from the URL — nothing is hardcoded.

| Platform | URL shape | Extract |
|----------|-----------|---------|
| Azure DevOps | `https://<org>.visualstudio.com/<project>/_git/<repo>/pullrequest/<id>` or `https://dev.azure.com/<org>/<project>/_git/<repo>/pullrequest/<id>` | org, project, repo, id |
| GitHub | `https://github.com/<owner>/<repo>/pull/<number>` | owner, repo, number |

If given a bare number instead of a URL, use `AskUserQuestion` to get the full URL (or the platform + identifiers).

## Step 2 — Prerequisites (self-contained)

| Platform | Ensure tooling | Auth check → recovery |
|----------|----------------|-----------------------|
| Azure DevOps | `az extension show --name azure-devops` — if absent, `az extension add --name azure-devops` | `az account show`; on failure prompt the user to run `az login`, then stop |
| GitHub | `gh --version` | `gh auth status`; on failure prompt the user to run `gh auth login`, then stop |

For ADO, pass the org explicitly on every command: `--organization https://<org>.visualstudio.com`. If any later `az` call fails with an auth error, prompt the user to re-run `az login`.

## Step 3 — Resolve PR metadata

| Platform | Command | Fields |
|----------|---------|--------|
| Azure DevOps | `az repos pr show --id <id> --organization https://<org>.visualstudio.com --output json` | `sourceRefName`, `targetRefName`, `lastMergeSourceCommit.commitId` (head), `lastMergeTargetCommit.commitId` (base) |
| GitHub | `gh pr view <number> --repo <owner>/<repo> --json headRefName,baseRefName,headRefOid,baseRefOid` | `headRefName`, `baseRefName`, `headRefOid` (head), `baseRefOid` (base) |

## Step 4 — Fetch the PR into an isolated worktree

Never run `git checkout` / `gh pr checkout` in the user's working directory. Always use a separate worktree.

1. Reuse an existing worktree if present:
   - Repo root: `git rev-parse --show-toplevel`.
   - Worktree path: sibling of the repo root named `<repo-name>-pr-<id-or-number>`.
   - If it already appears in `git worktree list`, skip to Step 5.
2. Fetch the head and base commits:

   | Platform | Fetch head | Fetch base |
   |----------|------------|------------|
   | Azure DevOps | `git fetch origin <source-branch>` | `git fetch origin <head-commit> <base-commit>` |
   | GitHub | `git fetch origin pull/<number>/head` (works for forks) | `git fetch origin <base-branch>` |

3. Create a **detached** worktree at the head commit (detached avoids "branch already checked out" errors and leaves no stray local branch):

   ```
   git worktree add --detach <worktree-path> <head-commit>
   ```

   This writes the full tree and can take minutes on a large monorepo — use a long timeout and let it finish.

## Step 5 — Surface the PR changes in the editor

The editor's Source Control panel shows only *uncommitted* changes, so a committed PR branch looks empty. Soft-reset the detached worktree to the PR's merge-base so the PR's changes become staged changes with per-file diffs.

1. Merge-base (isolates the PR's own changes): `git -C <worktree-path> merge-base <head-commit> <base-commit>`
2. Verify the real file set first: `git -C <worktree-path> diff --stat <merge-base> <head-commit>`
3. Surface as staged: `git -C <worktree-path> reset --soft <merge-base>`
4. Offer to open it: `code <worktree-path>` — changed files appear under **Staged Changes**. Tell the user not to run `git pull` there (it re-applies the commits and hides the diff); an already-open editor needs a Source Control refresh.

## Step 6 — Interactive review

1. Read the three-dot diff (`<merge-base>..<head-commit>`) and the modified files for context.
2. Present a short list of the **important parts** (per the Philosophy bar), each as `file:line` + a one-line reason. Default to few.
3. Answer the human's follow-up questions about any file, hunk, or symbol — read more of the tree as needed. Stay in this loop until the human is ready to comment or finish.

## Step 7 — Post comments the human requests

Parse each request into `file`, `line`, and `body` (draft the body only if the human asked the AI to write it, then get approval). Post one comment per request. Read existing threads first to avoid duplicates.

Anchor identifiers come from Step 1 (org/project/repo/id) and Step 3 (`<head-commit>`). File paths are repo-relative. In the examples below, substitute the values parsed in Step 1 for every `<...>` placeholder.

### Azure DevOps — inline (anchored to a line)

Preferred: the `ado/repo_create_pull_request_thread` MCP tool with a `threadContext`:

```
organization:  <org>
project:       <project>
repositoryId:  <repo>
pullRequestId: <id>                         # integer
content:       "This returns before the lock is released."
threadContext:
  filePath:        "/<repo-relative-path>"  # leading slash
  rightFileStart:  { line: <n>, offset: 1 }
  rightFileEnd:    { line: <n>, offset: 5 }
```

REST fallback (when the `ado` MCP server is not configured) — uses the `az login` token:

```
az rest --method post \
  --resource 499b84ac-1321-427f-aa17-267ca6975798 \
  --uri "https://dev.azure.com/<org>/<project>/_apis/git/repositories/<repo>/pullRequests/<id>/threads?api-version=7.1" \
  --headers "Content-Type=application/json" \
  --body @thread-body.json
```

where `thread-body.json` is `{ "comments": [{ "parentCommentId": 0, "content": "...", "commentType": 1 }], "status": "active", "threadContext": { "filePath": "/<repo-relative-path>", "rightFileStart": { "line": <n>, "offset": 1 }, "rightFileEnd": { "line": <n>, "offset": 5 } } }`. Generate the body with a JSON serializer, not string interpolation. Delete the temp file afterward.

### Azure DevOps — general (PR-level)

Same MCP tool or REST call, **omit** `threadContext` (and the body's `threadContext`).

### GitHub — inline (anchored to a line)

```
gh api --method POST /repos/<owner>/<repo>/pulls/<number>/comments \
  -f body="This returns before the lock is released." \
  -f commit_id=<head-commit> \
  -f path=<repo-relative-path> \
  -F line=<n> \
  -f side=RIGHT
```

To post several inline comments as one review, batch them via `gh api /repos/<owner>/<repo>/pulls/<number>/reviews` (event `COMMENT`).

### GitHub — general (PR-level)

```
gh pr comment <number> --repo <owner>/<repo> \
  --body "Validation approach looks solid overall."
```

Rules for all paths: call ADO MCP tools server-qualified (`ado/repo_*`) — never `ado-repo_*` aliases; `pullRequestId` is an integer; prefer inline over general when the human gives a line. Confirm each post back to the human with the PR link.

## Step 8 — Cleanup

When finished, remove the worktree (never affects the user's own branch):

```
git worktree remove --force <worktree-path>
```

If the directory is locked (an editor still has it open), close that editor window, then re-run the remove and `git worktree prune`.

## Error handling

- **Stale `origin`:** if the three-dot diff looks far larger than the PR, the local base ref is stale — re-fetch the base commit/branch and recompute the merge-base.
- **Fork PR (GitHub):** always fetch via `pull/<number>/head`; don't assume the head branch exists on `origin`.
- **Slow checkout:** the full-tree checkout on a large monorepo can take minutes — use a long timeout rather than interrupting.
