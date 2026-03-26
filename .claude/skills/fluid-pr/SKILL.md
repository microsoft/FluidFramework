---
name: fluid-pr
description: Fluid Framework pull request creation — composes a PR title and body following Fluid Framework conventions, proposes them to the user, then pushes the branch and creates the PR on GitHub. Triggers on "create a PR", "make a PR", "open a PR", "submit a PR", or "push and create a PR".
---

<required>
*CRITICAL* Add the following steps to your Todo list using TodoWrite:

1. Confirm you are NOT on `main` or any release branch. If you are, stop and ask the user.
2. Compose the PR title following Fluid Framework conventions.
3. Compose the PR body following the official template.
4. Present the proposed title and body to the user and ask: "Does this look right? Should I push and create the PR?"
5. On confirmation: push the branch and create the PR with `gh pr create`.
</required>

# PR Title Conventions

There is no enforced title policy in this repo. Two styles appear in roughly equal proportion — use whichever fits the change. Do not mix them (e.g., don't add a `fix:` prefix to an otherwise plain-imperative title just because it's a bug fix).

**Option A — Conventional Commits prefix:**

```
type(optional-scope): short imperative description
```

- Common types: `fix`, `feat`, `chore`, `build`, `docs`
- Scope is a package or area name (e.g., `build-cli`, `id-compressor`, `eslint-config-fluid`)
- Examples:
  - `fix: Prompt copilot-oce to check for Teams channel replies`
  - `fix(build-cli): remove flaky parallel changeset test`
  - `feat(devcontainer): add agency installation and update host requirements`
  - `chore: move misplaced @types/ packages from dependencies to devDependencies`
  - `build(client): Update type tests after minor release 2.91.0`

**Option B — Plain imperative:**

```
Short imperative or noun-phrase description
```

- No prefix, just a clear description of what changed
- Examples:
  - `Port MessageCodec to ClientVersionDispatchingCodecBuilder`
  - `Remove tree checkout's branch method`
  - `Ensure a summarizer stop request is respected after connecting`

**Never use** the `[bump]` prefix — that is reserved for automated bot PRs.

If the title alone fully describes the change, the `## Description` body section can be omitted — but this is rare. Most changes warrant a Description section.

# PR Body Template

Read `.github/pull_request_template.md` from the repo root and use it as the starting point for the PR body. Fill in each relevant section, then **delete sections and placeholder text that don't apply** — do not leave empty sections.

> CI requirement: the preamble line "Feel free to remove or alter parts of this template..." must be removed from the PR body. Leaving it in will cause the `.github/workflows/pr-validation.yml` check to fail.

## Notes on body sections

- **`## Description`**: Focus on *why* and *impact*, not just what lines changed. For bug fixes, include repro steps or a test that demonstrates the fix.
- **`## Breaking Changes`**: Only include when a change removes or alters public API surface in a way that requires consumer migration. Link the wiki page.
- **`## Reviewer Guidance`**: Always include the wiki link line. Add content if you have specific asks; delete the placeholder bullets if you don't. If design questions are unresolved, mark the PR as a draft.
- **Azure DevOps work items**: Reference inline in the body as `AB#NNNNN` if applicable. No dedicated section needed.

# Pushing and Creating the PR

```bash
# Push branch (first time)
git push -u origin <feature-branch>

# Create PR
gh pr create \
  --title "<title>" \
  --body "$(cat <<'EOF'
<body>
EOF
)"
```

After creating the PR, output the PR URL so the user can navigate to it.
