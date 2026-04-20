---
name: ci-readiness-check
description: Use when the user explicitly asks for a CI check or to push their branch — e.g. "ci readiness", "check ci", "pre-push check", "ready for CI", "ci check", "ready to push", "push my changes", "push the branch", "let's push". Catches common CI failures before pushing — formatting, stale API reports, missing changesets, policy violations.
---

<required>
Step 1 asks the user to pick a mode. Immediately after they respond, create one task/todo item per applicable step using your available task tooling (TaskCreate for Claude, TodoWrite for Copilot) — before doing any other work. Mark each task in_progress when you start it and completed when you finish. This prevents steps from being silently skipped as context grows.

Tasks to create by mode:

- Check: Run CI script → Review output → Report final status
- Build: Run CI script → Review output → Build unbuilt packages → ESLint auto-fix → Regenerate API reports → API changes review → Run build:docs → Regenerate type tests → Report final status
- Test: same as Build, plus Run tests

For Build/Test: if `@fluidframework/tree` is among the changed packages and its API surface likely changed, add a "Cascade API reports to aggregator packages" task after "Regenerate API reports".

Omit steps that don't apply (e.g. skip "Build unbuilt packages" if everything is already built; skip "Regenerate API reports" and "Regenerate type tests" if the API surface didn't change).
</required>

# Step 1: Confirm with the user

Before doing anything, ask the user:

> I can run a CI readiness check on your branch. Pick a mode (fastest to slowest):
>
> 1. Skip — skip the CI readiness check
> 2. Check (quick) — auto-fix formatting, policy, and syncpack on changed packages
> 3. Build — Check + build unbuilt packages + ESLint + regenerate API reports and type tests
> 4. Test (slower) — Build + run the test suite in changed packages

Wait for the user's response. If they say skip (or anything clearly negative), stop here. Otherwise, note their choice and immediately create tasks for all remaining steps as described in the required block above before proceeding.

# Step 2: Run the script

Run the bundled script from the repository root:

```bash
bash .claude/skills/ci-readiness-check/ci-readiness-check.sh [base-branch]
```

The base branch defaults to `main`. Pass a different branch if needed (e.g., `next`).

The script detects changed packages, installs dependencies if needed, runs `fluid-build --task checks:fix` (auto-fixing formatting, policy, syncpack, and build version consistency), verifies all checks pass, checks for a changeset, and reports uncommitted changes and build status.

# Step 3: Review output

Report to the user: packages changed, what was auto-fixed, any checks still failing, and uncommitted files. (Changeset guidance is handled by the `api-changes` skill if API reports changed; otherwise the script warning is sufficient.)

If you see unexpected generated artifacts unrelated to the branch's changes (especially in `*.api.md` files), stale build artifacts from a previous session or the incremental TypeScript bug are likely the cause. For `@fluidframework/tree` or its aggregator (`fluid-framework`), a scoped per-package clean is **not reliable** — you must do a full clean build from the repo root:

```bash
# From the repo root — no shortcuts
pnpm clean
pnpm build
```

The full build includes API report generation for all packages (including the `fluid-framework` aggregator), so no separate regeneration step is needed. Check the reports afterward — if only your intended changes appear, you're good.

For other packages, a scoped clean may suffice:

```bash
cd $PKG && pnpm exec fluid-build . --task clean && pnpm exec fluid-build . --task compile
```

Then re-run the CI readiness check. **Never hand-edit `*.api.md` files** — they are generated artifacts. If they're wrong, rebuild and regenerate.

Check mode stops here — skip steps 4–8 entirely. Note what was skipped in the final report.

# Step 4: Handle unbuilt packages (Build and Test only)

```bash
cd $PKG && pnpm exec fluid-build . --task compile
```

# Step 5: ESLint auto-fix (Build and Test only)

```bash
cd $PKG && pnpm exec fluid-build . -t eslint:fix
```

`eslint:fix` ensures compilation is current before linting and uses incremental caching so it's fast when the package is already built. If it fails due to non-auto-fixable errors, note them but continue.

# Determining if the public API surface changed

Steps 6 and 7 only run if the public API surface changed. Proceed if: `src/index.ts` or any entry point (`src/alpha.ts`, `src/beta.ts`, `src/legacy.ts`, `src/internal.ts`) was modified; any exported type/interface/class/function signature changed; or `package.json` `exports` changed. Skip if only tests, internal implementation, comments, or function bodies (not signatures) changed.

Running `build:api-reports` when nothing changed can introduce spurious diffs — specifically for the `@fluidframework/tree` and `fluid-framework` packages, which surface a known incremental TypeScript bug that non-deterministically reorders type unions and can cause other phantom changes. If you see any unexpected API report diffs, do a full clean build from the repo root (`pnpm clean && pnpm build`) and regenerate. Per-package cleans are not reliable for the tree package. See `tree-api-checks.md` for details.

# Step 6: API reports and cross-package cascade (Build and Test only)

If `@fluidframework/tree` is among the changed packages and its API surface likely changed, read `.claude/skills/ci-readiness-check/tree-api-checks.md` before proceeding with 6a.

## 6a. Regenerate API reports

```bash
cd $PKG && pnpm exec fluid-build . -t build:api-reports
```

If API Extractor fails with `ae-missing-release-tag`, add a TSDoc release tag (`@alpha`, `@beta`, `@public`, or `@internal`) to the new export, rebuild, then retry.

## 6b. API changes review

After regenerating reports, check whether any api-report files actually changed:

```bash
git diff --name-only HEAD -- | grep api-report
```

If any api-report files changed, run the `api-changes` skill. It will classify the changes by release tag, determine whether API Council approval is needed, flag any breaking changes that require process steps, and verify changeset and deprecation requirements.

## 6c. Run `build:docs` to catch TSDoc errors

`build:api-reports` suppresses `ae-unresolved-link` errors; CI catches these via `build:docs`. Run for each built changed package with a `build:docs` script, regardless of API surface change:

```bash
cd $PKG && pnpm run build:docs
```

If you see `ae-unresolved-link` errors, the `{@link}` or `{@inheritdoc}` tag references an ambiguous name. Fix by linking to an unambiguous target. The TSDoc `:instance`/`:static` selectors are not supported by this version of API Extractor.

# Step 7: Type test regeneration (Build and Test only)

For each built changed package with a `typetests:gen` script and where the public API surface likely changed:

```bash
cd $PKG && pnpm run typetests:gen
```

# Step 8: Run tests (Test mode only)

Run whichever test scripts exist in each built changed package:

```bash
cd $PKG && pnpm run test:mocha
cd $PKG && pnpm run test:jest
```

Skip `test:benchmark`, `test:stress`, and `test:realsvc` — too slow and flaky for a pre-push check. Report all results for the final report even if some fail.

# Step 9: Final status

Run `git status` and report:

1. Files auto-fixed — formatting, policy, ESLint fixes (unstaged; user should review and stage)
2. Generated files updated — API reports, type tests (need to be committed with the PR)
3. Test results — if Test mode, pass/fail per package
4. Remaining issues — anything the skill couldn't auto-fix
5. Skipped checks — anything skipped due to mode choice or unbuilt packages

End with a clear statement: "Your branch is ready to push" or "These issues remain: ..."

If further code changes are made after this check, re-run ESLint and — if the API surface changed — regenerate API reports before pushing.
