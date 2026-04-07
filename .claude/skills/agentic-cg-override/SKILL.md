---
name: agentic-cg-override
description: Fix a vulnerable transitive dependency by applying pnpm overrides to affected lockfiles. Use when a CG alert identifies a vulnerable package version that needs to be bumped. Provide the package name, vulnerable version(s), and the fixed version.
---

# Vulnerable Dependency Override

This skill remediates a vulnerable transitive dependency across all pnpm lockfiles in the repo.

**Important:** When searching for files or text in this repo, **always exclude `node_modules`**. Use
`-not -path "*/node_modules/*"` with `find`, `--glob '!node_modules'` with `grep`/ripgrep, and avoid
glob patterns like `**/pnpm-workspace.yaml` that will match inside `node_modules`. There is never a
reason to look inside `node_modules` during this workflow.

## Inputs

Before starting, confirm you have all three of these from the user:

1. **Package name** — the npm package with the vulnerability (e.g., `tar`)
2. **Vulnerable versions** — the version(s) to eliminate (e.g., `<7.5.11`, or `6.2.0, 6.1.15`, or `all versions before 4.0.0`)
3. **Fixed version** — the minimum safe version to override to (e.g., `^7.5.11`)

If any input is missing or ambiguous, ask the user before proceeding.

## Step 1: Find affected lockfiles

Discover every pnpm lockfile in the repo, excluding `node_modules` and test fixture data:

```bash
find . -name pnpm-lock.yaml -not -path "*/node_modules/*" -not -path "*/test/data/*" -not -path "*/src/test/*"
```

For each lockfile, search for the vulnerable package at a vulnerable version. Lockfile v9 format stores
resolved packages as top-level keys like `<package>@<version>:`. Search with grep:

```bash
grep -n '<package>@' <lockfile>
```

Parse the versions found and compare against the vulnerable version specification. A lockfile is "affected"
if it contains the package at any version that falls within the vulnerable range.

Report to the user which lockfiles are affected and which versions were found.

If no lockfiles are affected, report that and stop — no action needed.

## Step 2: Determine override strategy

Look at the versions of the vulnerable package present in each affected lockfile. Decide on the override approach:

- **Single major version**: If all vulnerable instances share the same major version as the fixed version, use a simple override: `"<package>": ">= <fixed-version>"`.
- **Multiple major versions**: If vulnerable instances span different major versions, use range-scoped overrides following the pattern already used in this repo. For example:
  ```json
  "<package>@>=3 <4": "^3.1.5",
  "<package>@>=4 <5": "^4.0.2"
  ```
  This ensures each major version range gets bumped to the minimum safe version within that range, avoiding unintended major-version jumps.
- **Cross-major fix**: If the fix requires jumping to a new major version (e.g., all v6.x are vulnerable, fix is v7.x), use `"<package>": ">= <fixed-version>"`.

Check the existing `pnpm.overrides` in the target `package.json` — if there's already an override for this package, update it rather than adding a duplicate.

## ⚠️ NEVER use `pnpm update`

**Do NOT run `pnpm update <package>` (or `pnpm update` in any form) at any point in this workflow.** Pnpm's
update command is notoriously bad at keeping its changes contained to the specified package — it will
effectively update *everything* in the lockfile. This produces massive churn in the lockfile, makes PRs
nearly impossible to review effectively, and risks introducing unrelated breakages.

The correct approach is always: edit the override in `package.json`, then run `pnpm install`.

## Step 3: Apply overrides and install

For each affected lockfile, identify its corresponding `package.json` (in the same directory).

**3a. Add the override to `package.json`:**

Read the current `package.json`. If it has a `pnpm.overrides` section, add the new override entry. If it doesn't have one, create the `pnpm` section with `overrides`.

Also add a comment in `pnpm.comments` (or `pnpm.commentsOverrides` — match whichever pattern the file already uses) explaining the override. Follow the existing comment style in the file. Example:
```
"<package> is overridden to <fixed-version> to address <vulnerability-id/description>."
```

**3b. Run pnpm install:**

**Always use absolute paths.** Do not `cd` into a directory without returning to the repo root afterward —
a stale working directory will cause subsequent commands to target the wrong lockfile.

```bash
(cd /absolute/path/to/directory-of-package.json && pnpm install --no-frozen-lockfile)
```

Using a subshell `( )` ensures the working directory resets after the command completes.

## Step 4: Verify the fix

After installation, check the lockfile to confirm the vulnerable versions are gone:

```bash
grep '<package>@' <lockfile>
```

**If all instances are now at the fixed version (or higher):** proceed to Step 5.

**If vulnerable versions still appear:** Investigate. Common causes:

1. **The override syntax is wrong** — double-check the override key and value format.
2. **A nested dependency pins the old version** — look for `dependencies` or `peerDependencies` in the lockfile that force the old version. You may need a more specific override like `"<parent>><package>": "<fixed-version>"`.
3. **Multiple resolution contexts** — pnpm may resolve different versions for different dependency paths. Try a broader override.
4. **The package.json wasn't saved correctly** — re-read it and verify the override is present.

Fix the issue and re-run `pnpm install`. Repeat until the vulnerable version is eliminated.

### Handling ERR_PNPM_TRUST_DOWNGRADE

If `pnpm install` fails with `ERR_PNPM_TRUST_DOWNGRADE`, the workspace has `trustPolicy: no-downgrade` enabled
and pnpm is refusing to accept a package version it considers a downgrade. To resolve this, add the specific
`<package>@<version>` entries that pnpm is complaining about to the `trustPolicyExclude` list in the
`pnpm-workspace.yaml` for that workspace.

**Important:** Multiple versions of the same package must be combined into a single entry using `||` syntax.
Adding more than one entry for the same package will not work correctly. For example:

```yaml
trustPolicyExclude:
  # Correct — multiple versions for the same package in one entry:
  - 'semver@6.3.1 || 5.7.2'
  # Correct — a different package with only one version:
  - 'chokidar@4.0.3'
```

Then re-run `pnpm install`.

### Handling ERR_PNPM_PEER_DEP_ISSUES

If `pnpm install` fails with `ERR_PNPM_PEER_DEP_ISSUES`, ignore it. This is a non-blocking warning about
peer dependency mismatches that is unrelated to the override work. It does not affect the fix.

## Step 5: Test override removal

The goal is to avoid permanent overrides when possible. The dependency graph may already resolve to the fixed version once the lockfile is regenerated.

**5a. Remove the override:**

Remove the override entry (and its comment) from `package.json`.

**5b. Reinstall:**

```bash
(cd /absolute/path/to/directory-of-package.json && pnpm install --no-frozen-lockfile)
```

**5c. Re-check the lockfile:**

```bash
grep '<package>@' <lockfile>
```

## Step 6: Final determination

**If all versions are still safe after removing the override:**
- The override was only needed to regenerate the lockfile. Leave it removed.
- Report: "Override removed — the dependency graph naturally resolves to safe versions."

**If the vulnerable version reappears after removing the override:**
- The override is necessary to keep the dependency safe.
- Re-apply the override and run `pnpm install` again.
- **Identify the root cause:** Investigate the lockfile to determine which packages are pulling in the
  vulnerable version. Usually the culprit is a package that declares an exact version (e.g., `"tar": "6.1.15"`)
  or a range that caps below the fix (e.g., `"tar": "^6.0.0"` when the fix is in v7). Search the lockfile
  for entries whose `dependencies` or `peerDependencies` reference the vulnerable package. Note these packages
  in the override comment so future maintainers know why the override exists and when it can be removed.
- **Update the comment in `package.json`** to include the root-cause packages. For example:
  ```
  "tar: overridden to >=7.5.11 to resolve CVE-2025-XXXXX. Required because archiver@5.3.2 and
   npm-packlist@5.1.3 pin tar to ^6.x."
  ```
- Report: "Override is necessary and has been kept in place. The dependency graph would otherwise resolve to vulnerable version(s)."

## Step 7: Summary

After processing all affected lockfiles, provide a final summary:

```
## CG Override Summary

**Package:** <name>
**Vulnerable versions:** <versions>
**Fixed version:** <fixed-version>

### Results by lockfile:

| Lockfile | Status | Override needed? |
|----------|--------|-----------------|
| ./pnpm-lock.yaml | ✅ Fixed | Yes — kept |
| ./build-tools/pnpm-lock.yaml | ✅ Fixed | No — removed |
| ./server/routerlicious/pnpm-lock.yaml | ⬜ Not affected | — |
| ... | ... | ... |

### Overrides applied:
- `./package.json`: `"<package>": ">= <fixed-version>"`

### Next steps:
- Review the changes to package.json and pnpm-lock.yaml files
- Commit the changes
```
