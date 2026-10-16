---
name: fluid-pr
description: Use when creating a pull request in the Fluid Framework repo. Composes a PR title and body following Fluid Framework conventions, proposes them to the user, then pushes the branch and creates the PR on GitHub. Triggers on "create a PR", "make a PR", "open a PR", "submit a PR", or "push and create a PR".
---

<required>
*CRITICAL* Do NOT push or run `gh pr create` until the user confirms via AskUserQuestion in step 5, except in `fluid-release` CI. Do not skip ahead.

*CRITICAL* Add the following steps to your task/todo list using your available task tooling (TaskCreate for Claude, TodoWrite for Copilot):

1. Confirm you are NOT on `main` or a protected `release/` branch. If you are, stop and tell the user to switch to a feature branch first.
2. Verify that `origin` points to the engineer's writable fork. If not, stop and ask the engineer to configure `origin` for their fork, unless the user requested a `test/` branch on Microsoft or this is `fluid-release` CI.
  - **EXCEPTION:** A user-requested `test/` branch may be pushed to Microsoft through a verified `upstream` or `origin`.
3. **Load the `fluid-pr-guide` skill NOW** (via the Skill tool) before composing anything. It contains the title conventions, body template, and section guidance you need. Do NOT skip this step or rely on memory.
4. Using the loaded `fluid-pr-guide`, compose the PR title and body following its conventions and template.
5. Print the proposed title, body, origin head, and Microsoft base, then use `AskUserQuestion` (or `ask_user`) unless this is `fluid-release` CI. Use these options otherwise:
   - "Create PR" — Push the branch and open the pull request
   - "Create draft PR" — Push the branch and open a draft pull request
   - "Edit" — Revise the title or body before creating
   - "Cancel" — Don't create a PR
6. If the user picks "Edit", apply their edits and re-present (go back to step 5). If "Create PR" or "Create draft PR", push and create accordingly. If "Cancel", stop.
</required>

# Pushing and Creating the PR

Before pushing, verify that `origin` does not point to `microsoft/FluidFramework`. Run:

```bash
git remote get-url origin
```

Confirm that `origin` identifies the engineer's fork. If it identifies Microsoft, stop unless the user requested a `test/` branch there or this is `fluid-release` CI. Never push `main` or `release/` as an exception.

Once the checks pass, compose the title and body, print them and the head/base, then ask the user as in step 5 unless this is `fluid-release` CI. Set `<BASE_BRANCH>` to `main` or the requested release branch.

```bash
# Push branch (first time)
git push -u origin <feature-branch>

# Create PR (option 1)
gh pr create \
  --repo microsoft/FluidFramework \
  --base <BASE_BRANCH> \
  --head <FORK_OWNER>:<feature-branch> \
  --title "<title>" \
  --body "$(cat <<'EOF'
<body>
EOF
)"

# Create draft PR (option 2) — add the --draft flag
gh pr create \
  --draft \
  --repo microsoft/FluidFramework \
  --base <BASE_BRANCH> \
  --head <FORK_OWNER>:<feature-branch> \
  --title "<title>" \
  --body "$(cat <<'EOF'
<body>
EOF
)"
```

For a requested `test/` branch on Microsoft, verify the push URL, push to `upstream` if `origin` is the fork, and use `--head <feature-branch>`. Use that head form for `fluid-release` CI too.
If GitHub CLI cannot name the verified fork head, stop rather than omit `--head`.
After creating the PR, output the PR URL so the user can navigate to it.

# Updating an existing PR description

You do not have permissions to edit PRs on the upstream `microsoft/FluidFramework` repo via the API. If you need to update an existing PR's title or body, write the new content to a temp file and tell the user to copy-paste it into GitHub:

```bash
cat <<'EOF' > "$TMPDIR/pr-body.md"
<new body content>
EOF
```

Then tell the user: "I can't edit the PR directly — I've written the updated description to `$TMPDIR/pr-body.md`. Please copy-paste it into the PR on GitHub."
