---
name: ci-readiness-check
description: Quick pre-push check that catches common CI failures before you push. Use when the user says "ci readiness", "check ci", "pre-push check", "ready for CI", "prepare for push", "ci check", "ready to push", or wants to make sure their branch won't fail CI for silly reasons. This is NOT a full local CI run — it catches low-hanging fruit like forgotten formatting, stale API reports, missing changesets, and policy violations.
---

<required>
Step 1 below asks the user to pick a mode. **Immediately after they respond**, use TaskCreate to create one task per applicable step based on their choice — before doing any other work. Mark each task in_progress when you start it and completed when you finish. This prevents steps from being silently skipped as context grows.

Tasks to create by mode:

- **Check:** Run CI script → Review output → Report final status
- **Build:** Run CI script → Review output → Build unbuilt packages → ESLint auto-fix → Regenerate API reports → Run build:docs → Regenerate type tests → Report final status
- **Test:** same as Build, plus Run tests

For Build/Test: if `@fluidframework/tree` is among the changed packages **and its API surface likely changed**, add a "Cascade API reports to aggregator packages" task after "Regenerate API reports".

Omit steps that don't apply (e.g. skip "Build unbuilt packages" if everything is already built; skip "Regenerate API reports" and "Regenerate type tests" if the API surface didn't change).
</required>

# Step 1: Confirm with the user

Before doing anything, ask the user:

> I'll run a CI readiness check on your branch. Pick a mode (fastest to slowest):
>
> 1. **Cancel** — never mind, don't run checks
> 2. **Check** — auto-fix formatting, policy, and syncpack on changed packages (~5–10 seconds; always fast)
> 3. **Build** — Check + build unbuilt packages + ESLint + regenerate API reports and type tests (~10–20 seconds if packages are already built; longer if a fresh compile is needed)
> 4. **Test** — Build + run the test suite in changed packages (non-tree packages: ~10–30 seconds; tree: ~3+ minutes)

Wait for the user's response. If they say cancel (or anything clearly negative), stop here. Otherwise, note their choice and **immediately create tasks for all remaining steps** as described in the `<required>` block above before proceeding.

# Step 2: Run the script

Run the bundled script from the repository root:

```bash
bash .claude/skills/ci-readiness-check/ci-readiness-check.sh [base-branch]
```

The base branch defaults to `main`. Pass a different branch if needed (e.g., `next`).

The script always runs the same checks regardless of mode — mode only affects what the agent does afterward:
- Detecting which packages have changes vs the base branch
- Installing dependencies if `node_modules` is missing
- Running `fluid-build --task checks:fix` scoped to changed packages, which auto-fixes:
  - Formatting (Biome)
  - Policy violations (flub — copyright headers, package.json sorting, etc.)
  - Dependency version consistency (syncpack)
  - Build version consistency
- Verifying all checks pass after auto-fix (`fluid-build --task checks`)
- Checking for a changeset (via `flub check changeset`)
- Reporting uncommitted changes, categorized (API reports, type tests, other)
- Reporting which changed packages are built vs not built

# Step 3: Review output

Read the script output. Report to the user:
- How many packages changed
- What was auto-fixed (formatting, policy, syncpack, versions)
- Any checks that still fail after auto-fix
- Changeset status
- Uncommitted files

**Check mode stops here.** In Check mode, skip steps 4–8 entirely — even for packages that happen to be already built. Note what was skipped in the final report (step 9).

# Step 4: Handle unbuilt packages (Build and Test only)

If the script reports unbuilt packages, build them:

```bash
cd <package-dir> && pnpm exec fluid-build . --task compile
```

# Step 5: ESLint auto-fix (Build and Test only)

For each built changed package, run:
```bash
cd <package-dir> && pnpm exec fluid-build . -t eslint:fix
```

`eslint:fix` is the registered fluid-build task for linting. Fluid-build ensures compilation is current before running ESLint (important for TypeScript-aware rules) and uses incremental caching so it's fast when the package is already built. If it fails due to non-auto-fixable errors, note them but do not block — CI will catch those.

# Determining if the public API surface changed

Steps 6 and 7 require judging whether a package's public API surface changed. Use these criteria:

**API likely changed — proceed with the check:**
- `src/index.ts` or any entry point file (`src/alpha.ts`, `src/beta.ts`, `src/legacy.ts`, `src/internal.ts`) was modified
- Any file that defines an exported type, interface, class, or function whose **signature** changed (not just the implementation body)
- The package's `package.json` `exports` field changed

**API did not change — skip the check:**
- Only test files changed (`src/test/`, `*.spec.ts`, `*.test.ts`)
- Only internal implementation changed with no exported signature differences
- Only comments, documentation, or non-code files changed
- Only a function body changed (not its signature)

**Why be conservative:** Running `build:api-reports` when nothing actually changed can introduce spurious diffs that look like real API changes. This is especially true for `@fluidframework/tree` and `fluid-framework`, which have a known API Extractor bug that non-deterministically reorders some generated types. Only run it when you're confident the public API actually changed.

# Step 6: API reports and cross-package cascade (Build and Test only)

> **If `@fluidframework/tree` is among the changed packages AND its API surface likely changed** (per the criteria above): read `.claude/skills/ci-readiness-check/tree-api-checks.md` now. It has required pre-steps (before `build:api-reports`) and post-steps (after `build:api-reports` and cascade) specific to that package. Do this before proceeding with 6a. For pure implementation changes to tree (no exported signature changes), skip it.

## 6a. Regenerate API reports

For each built changed package that has a `build:api-reports` script, and where the public API surface likely changed (see criteria above):

```bash
cd <package-dir> && pnpm exec fluid-build . -t build:api-reports
```

If API Extractor fails with `ae-missing-release-tag`, the new export needs a TSDoc release tag (`@alpha`, `@beta`, `@public`, or `@internal`). Add the appropriate tag to the function/class/interface, rebuild the package, then retry `build:api-reports`. Check other exports in the same package to see which tag is conventional — most public exports use `@public`.

## 6b. Run `build:docs` to catch TSDoc errors

**Critical:** `build:api-reports` uses an API Extractor config that suppresses `ae-unresolved-link` errors. CI catches these via a separate `build:docs` step that uses the package-root `api-extractor.json` without that suppression. You must run `build:docs` locally to catch these before pushing.

For each built changed package that has a `build:docs` script, run it regardless of whether the API surface changed (TSDoc link errors can come from any modified source file):

```bash
cd <package-dir> && pnpm run build:docs
```

If you see `ae-unresolved-link` errors, the `{@link}` or `{@inheritdoc}` tag references an ambiguous name (most commonly a member that exists as both a static and instance declaration). Fix by linking to an unambiguous target — for example, link to the interface that declares the member (which has exactly one declaration) rather than the class that exposes it as both static and instance. The TSDoc `:instance`/`:static` system selectors are **not** supported by this version of API Extractor.

# Step 7: Type test regeneration (Build and Test only)

For each built changed package that has a `typetests:gen` script in its `package.json`, and where the public API surface likely changed (see criteria above):

```bash
cd <package-dir> && pnpm run typetests:gen
```

Not all packages have type tests. Only run this where the script exists.

# Step 8: Run tests (Test mode only)

If the user chose **Test** mode, run tests in each built changed package. Check the package's `package.json` for available test scripts and run whichever exist:

```bash
cd <package-dir> && pnpm run test:mocha
cd <package-dir> && pnpm run test:jest
```

Some packages have both, some have one, some have neither. Only run what exists. Skip performance tests (`test:benchmark`, `test:stress`) and real service tests (`test:realsvc`) — those are too slow and flaky for a pre-push check. If tests fail, report the failures but continue with remaining packages — collect all results for the final report.

# Step 9: Final status

Run `git status` and report to the user:

1. **Files auto-fixed** — formatting, policy, ESLint fixes. These are unstaged; the user should review and stage them.
2. **Generated files updated** — API reports, type tests. These need to be committed with the PR.
3. **Test results** — if Test mode, report pass/fail per package.
4. **Remaining issues** — anything the skill couldn't auto-fix (check failures, missing changeset, etc.).
5. **Skipped checks** — anything skipped due to mode choice or unbuilt packages.

End with a clear statement: "Your branch is ready to push" or "These issues remain: ..."

**If further code changes are made after this check** (e.g. fixing a review comment, addressing a lint error manually, or any other edit), re-run ESLint and — if the API surface changed — regenerate API reports before pushing. A CI readiness check only reflects the state of the code at the time it was run.
