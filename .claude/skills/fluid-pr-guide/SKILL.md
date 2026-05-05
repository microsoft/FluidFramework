---
name: fluid-pr-guide
description: Use when composing, writing, drafting, or reviewing a PR title, PR description, or PR body in Fluid Framework — provides title style, body template, and section guidance.
---

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

Always include a `## Description` section, even if it is brief and somewhat redundant with the title.

# PR Body Template

Read `.github/pull_request_template.md` from the repo root and use it as the starting point for the PR body. Fill in each relevant section, then **delete sections and placeholder text that don't apply** — do not leave empty sections.

> CI requirement: the preamble line "Feel free to remove or alter parts of this template..." must be removed from the PR body. Leaving it in will cause the `.github/workflows/pr-validation.yml` check to fail.

## Notes on body sections

- **`## Description`**: Focus on *why* and *impact*, not just what lines changed. For bug fixes, include repro steps or a test that demonstrates the fix.
- **`## Breaking Changes`**: Only include when a change removes or alters public API surface or behavior in a way that requires consumer action (like migration or build-time updates). Link the wiki page.
- **`## Reviewer Guidance`**: Always include the wiki link line. Add content if you have specific asks; delete the placeholder bullets if you don't. If design questions are unresolved, mark the PR as a draft.
- **Azure DevOps work items**: Reference inline in the body as `AB#<item-id>` if applicable (e.g. `AB#12345`). No dedicated section needed.
