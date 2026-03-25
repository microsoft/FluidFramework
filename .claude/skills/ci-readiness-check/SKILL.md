---
name: ci-readiness-check
description: Quick pre-push check that catches common CI failures before you push. Use when the user says "ci readiness", "check ci", "pre-push check", "ready for CI", "prepare for push", "ci check", "ready to push", or wants to make sure their branch won't fail CI for silly reasons. This is NOT a full local CI run — it catches low-hanging fruit like forgotten formatting, stale API reports, missing changesets, and policy violations.
---

<required>
*CRITICAL* Add the following steps to your Todo list using TodoWrite:

1. Confirm with the user before proceeding.
2. Run the CI readiness script.
3. Review script output and report results to the user.
4. If the user chose Full or Thorough mode and there are unbuilt packages, build them.
5. For each built changed package, determine if API reports need regeneration. If so, check for downstream cascade.
6. For each built changed package, run ESLint auto-fix.
7. For each built changed package, check if type tests need regeneration.
8. If the user chose Thorough mode, run tests in changed packages.
9. Report final status: what was fixed, what needs staging, any remaining issues.
</required>

# Step 1: Confirm with the user

Before doing anything, ask the user:

> I'll run a CI readiness check on your branch. Pick a mode (fastest to slowest):
>
> 1. **Cancel** — never mind, don't run checks
> 2. **Quick** — auto-fix formatting, policy, and lint; skip anything that needs unbuilt packages
> 3. **Full** — Quick + build unbuilt packages + regenerate API reports and type tests
> 4. **Thorough** — Full + run tests in changed packages

Wait for the user's response. If they say cancel (or anything clearly negative), stop here. Otherwise, note their choice and proceed.

# Step 2: Run the script

Run the bundled script from the repository root:

```bash
bash .claude/skills/ci-readiness-check/ci-readiness-check.sh [base-branch]
```

The base branch defaults to `main`. Pass a different branch if needed (e.g., `next`).

The script handles:
- Detecting which packages have changes vs the base branch
- Auto-fixing formatting in each changed package (via Biome)
- Running `flub check policy --fix` scoped to changed package paths, then verifying
- Checking for a changeset (via `flub check changeset`)
- Reporting uncommitted changes, categorized (API reports, type tests, other)
- Reporting which changed packages are built vs not built

# Step 3: Review output

Read the script output. Report to the user:
- How many packages changed
- What was auto-fixed (formatting, policy)
- Any policy issues that couldn't be auto-fixed
- Changeset status
- Uncommitted files

# Step 4: Handle unbuilt packages

If the script reports unbuilt packages:
- **Full** or **Thorough** mode: build them with `cd <package-dir> && fluid-build . --task compile`
- **Quick** mode: skip them for all remaining steps. Note what was skipped in the final report.

# Determining if the public API surface changed

Steps 5 and 7 require judging whether a package's public API surface changed. Use these criteria:

**API likely changed — proceed with the check:**
- `src/index.ts` or any entry point file (`src/alpha.ts`, `src/beta.ts`, `src/legacy.ts`, `src/internal.ts`) was modified
- Any file that defines an exported type, interface, class, or function whose **signature** changed (not just the implementation body)
- The package's `package.json` `exports` field changed

**API did not change — skip the check:**
- Only test files changed (`src/test/`, `*.spec.ts`, `*.test.ts`)
- Only internal implementation changed with no exported signature differences
- Only comments, documentation, or non-code files changed
- Only a function body changed (not its signature)

**Why be conservative:** There is a known bug in API Extractor where it non-deterministically reorders some generated types. The output differs between local and CI, producing bogus diffs that look like real changes but aren't. Running API Extractor unnecessarily can introduce these confusing phantom diffs. Only run it when you're confident the public API actually changed.

# Step 5: API reports and cross-package cascade

For each built changed package that has a `build:api-reports` script, and where the public API surface likely changed (see criteria above):

```bash
cd <package-dir> && pnpm run build:api-reports
```

**Cross-package cascade:** After regenerating API reports for a package, check if any "aggregator" packages re-export from it. If so, their API reports are now stale too.

Read the source index files of these aggregator packages and look for imports from the changed package:
- `packages/framework/fluid-framework/src/index.ts`
- `packages/service-clients/azure-client/src/index.ts`

For example, if you changed `@fluidframework/tree` and `fluid-framework/src/index.ts` contains `export * from "@fluidframework/tree/alpha"`, then also run:
```bash
cd packages/framework/fluid-framework && pnpm run build:api-reports
```

Only do this if the source package's reports actually changed (check `git diff` on its `api-report/` directory). If the source reports are unchanged, the aggregator's won't be either.

# Step 6: ESLint auto-fix

For each built changed package:
```bash
cd <package-dir> && pnpm run eslint:fix
```

If `eslint:fix` fails due to non-auto-fixable errors, note them but do not block — CI will catch those.

# Step 7: Type test regeneration

For each built changed package that has a `typetests:gen` script in its `package.json`, and where the public API surface likely changed (see criteria above):

```bash
cd <package-dir> && pnpm run typetests:gen
```

Not all packages have type tests. Only run this where the script exists.

# Step 8: Run tests (Thorough mode only)

If the user chose **Thorough** mode, run tests in each built changed package. Check the package's `package.json` for available test scripts and run whichever exist:

```bash
cd <package-dir> && pnpm run test:mocha
cd <package-dir> && pnpm run test:jest
```

Some packages have both, some have one, some have neither. Only run what exists. If tests fail, report the failures but continue with remaining packages — collect all results for the final report.

# Step 9: Final status

Run `git status` and report to the user:

1. **Files auto-fixed** — formatting, policy, ESLint fixes. These are unstaged; the user should review and stage them.
2. **Generated files updated** — API reports, type tests. These need to be committed with the PR.
3. **Test results** — if Thorough mode, report pass/fail per package.
4. **Remaining issues** — anything the skill couldn't auto-fix (policy failures, missing changeset, etc.).
5. **Skipped checks** — anything skipped due to mode choice or unbuilt packages.

End with a clear statement: "Your branch is ready to push" or "These issues remain: ..."
