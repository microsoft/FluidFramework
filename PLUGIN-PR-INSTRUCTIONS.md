# ESLint Plugin PR Instructions

## Summary

The eslint-plugin-fluid changes have been prepared on branch `copilot/eslint-plugin-fluid-eslint-9-compat` but could not be pushed as a separate PR due to tooling limitations.

## What's Ready

Branch: `copilot/eslint-plugin-fluid-eslint-9-compat` (LOCAL ONLY - needs push)
Base commit: 0afd5eb (Improve Assert APIs)

Commits:
1. 1a88550 - fix(eslint-plugin): update no-unchecked-record-access for ESLint 9 API (by Tyler)
2. e6fd28a - Update eslint-plugin-fluid for ESLint 8 and 9 compatibility

**Note:** This branch exists locally but has not been pushed to origin yet. To push it:
```bash
git push -u origin copilot/eslint-plugin-fluid-eslint-9-compat
```

## Changes Included

### Dependency Updates
- ESLint: 8.57.0 → 9.37.0
- @typescript-eslint/eslint-plugin & parser: 7.18.0 → 8.46.0
- Added @typescript-eslint/utils: 8.46.0

### Rule Updates  
- no-unchecked-record-access now supports both ESLint 8 and 9 APIs with graceful fallback

### Test Updates
- All test files migrated to ESLint 9's flat config API
- All 19 tests passing

## To Push and Create the PR

First, push the local branch:
```bash
git push -u origin copilot/eslint-plugin-fluid-eslint-9-compat
```

Then create the PR:
```bash
gh pr create --base main --head copilot/eslint-plugin-fluid-eslint-9-compat \
  --title "Update eslint-plugin-fluid for ESLint 8 and 9 compatibility" \
  --body "See commit e6fd28a for full details. All 19 tests passing."
```

## Current State

This PR (copilot/update-eslint-to-version-9) contains ONLY the eslint-config-fluid changes and uses the published version ^0.3.1 of the plugin.
