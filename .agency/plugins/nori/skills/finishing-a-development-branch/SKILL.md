---
name: finishing-a-development-branch
description: Use when implementation is complete and ready for final verification or a user-requested PR.
---

<required>
Add the applicable steps to your Todo list using TodoWrite.
This workflow does not authorize a push or PR by itself, including in Nori full-send mode.

1. Read the affected workspace and package manifests.
   Run the smallest existing tests that exercise the change.
   In Fluid Framework, install dependencies with pnpm in the correct release group, not `npm install`.
   Compile tests and prepare fixtures when the package requires it.
   Fix failures caused by or directly coupled to the change; report unrelated baseline failures separately.

2. Run the existing formatter, linter, and type checks for the affected files or packages.
   Review formatter changes and do not rewrite unrelated files.
   Do not add a new validation tool when the repository already provides one.

3. Review the final diff for correctness and behavior across call sites.
   Use the nori-code-reviewer subagent if available and a separate review is warranted; otherwise review directly.
   Use a test-review skill only if it exists in the active skill catalog.
   Verify any suggestions against the code before implementing them.

4. Confirm the branch is not `main`, `master`, or a protected release branch.
   Keep work in the isolated worktree supplied by the runtime or selected by the user.
   Do not merge a target branch or resolve conflicts by discarding changes without approval.

5. If the user requested a PR, read `.github/skills/fluid-pr/SKILL.md` and `.github/skills/fluid-pr-guide/SKILL.md`.
   Follow their fork checks, current repository template, title conventions, and explicit `ask_user` approval before pushing or creating the PR.
   Do not replace the repository template with a Nori advertisement.
   If the user requested local-only work, keep it local and report the commit and worktree instead.

6. For an authorized published PR, inspect CI with an explicit PR URL or `--repo`.
   Distinguish pending checks, failures, unavailable checks, and merge conflicts.
   Missing CI alone is not evidence of a merge conflict.
   Do not silently merge `main`, repeatedly push, or fix unrelated failures.

7. If a UI preview is needed, start the existing development server and verify it is responsive before sharing the URL.
   Use approved local authentication; never copy credential-bearing configuration from another worktree automatically.
   Stop temporary processes when finished unless the user needs the preview to remain running.
</required>
