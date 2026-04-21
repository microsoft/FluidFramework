---
name: fluid-pr
description: Use when creating a pull request in the Fluid Framework repo. Composes a PR title and body following Fluid Framework conventions, proposes them to the user, then pushes the branch and creates the PR on GitHub. Triggers on "create a PR", "make a PR", "open a PR", "submit a PR", or "push and create a PR".
---

<required>
*CRITICAL* Do NOT run `gh pr create` until the user has explicitly confirmed via AskUserQuestion in step 5. Do not skip ahead.

*CRITICAL* Add the following steps to your task/todo list using your available task tooling (TaskCreate for Claude, TodoWrite for Copilot):

1. Confirm you are NOT on `main` or any release branch. If you are, stop and tell the user: you cannot create a PR from a protected branch — they need to create or switch to a feature branch first.
2. Verify that the `origin` remote does not point to `microsoft/FluidFramework`. If it does, stop and tell the user: pushing a branch directly to the main repo is not allowed — they should push to their fork instead.
3. **Load the `fluid-pr-guide` skill NOW** (via the Skill tool) before composing anything. It contains the title conventions, body template, and section guidance you need. Do NOT skip this step or rely on memory.
4. Using the loaded `fluid-pr-guide`, compose the PR title and body following its conventions and template.
5. Print the proposed title and body as text, then immediately use the `AskUserQuestion` tool to let the user choose what to do next. Use these exact options:
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

If the URL contains `microsoft/FluidFramework`, **stop** — pushing a branch directly to the main repo is almost certainly not intended. Tell the user they likely need to push to their fork instead. Do not proceed.

Once the checks in steps 1–2 pass silently, compose the title and body, print them as text, then use the `AskUserQuestion` tool with the four options as described in step 5. This is the only point where the `fluid-pr` flow asks the user a question.

```bash
# Push branch (first time)
git push -u origin <feature-branch>

# Create PR (option 1)
gh pr create \
  --title "<title>" \
  --body "$(cat <<'EOF'
<body>
EOF
)"

# Create draft PR (option 2) — add the --draft flag
gh pr create \
  --draft \
  --title "<title>" \
  --body "$(cat <<'EOF'
<body>
EOF
)"
```

After creating the PR, output the PR URL so the user can navigate to it.

# Updating an existing PR description

You do not have permissions to edit PRs on the upstream `microsoft/FluidFramework` repo via the API. If you need to update an existing PR's title or body, write the new content to a temp file and tell the user to copy-paste it into GitHub:

```bash
cat <<'EOF' > "$TMPDIR/pr-body.md"
<new body content>
EOF
```

Then tell the user: "I can't edit the PR directly — I've written the updated description to `$TMPDIR/pr-body.md`. Please copy-paste it into the PR on GitHub."
