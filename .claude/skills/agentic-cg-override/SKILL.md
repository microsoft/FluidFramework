---
name: agentic-cg-override
description: Fix a vulnerable transitive dependency by applying pnpm overrides to affected lockfiles. Use when a CG alert identifies a vulnerable package version that needs to be bumped. Can also fetch and display the current CG alert list from ADO. Provide the package name, vulnerable version(s), and the fixed version.
---

# Vulnerable Dependency Override

This skill remediates a vulnerable transitive dependency across all pnpm lockfiles in the repo.

**Important:** When searching for files or text in this repo, **always exclude `node_modules`**. Use
`-not -path "*/node_modules/*"` with `find`, `--glob '!node_modules'` with `grep`/ripgrep, and avoid
glob patterns like `**/pnpm-workspace.yaml` that will match inside `node_modules`. There is never a
reason to look inside `node_modules` during this workflow.

## Fetching CG alerts

Helper scripts in `.claude/skills/agentic-cg-override/scripts/` can fetch and parse the live CG alert
data from ADO. The scripts use the `az` shim available in codespaces to get a Bearer token, then call
the Component Governance SPA API directly.

### Fetch the raw alert data

```bash
bash .claude/skills/agentic-cg-override/scripts/fetch-cg-alerts.sh [output-dir]
```

Downloads all CG alerts for the `main` branch to `/tmp/cg-alerts/` (or a custom directory). Produces
two files:
- `production.json` — alerts from production pipelines (`pipelinesTrackingFilter=0`)
- `non-production.json` — alerts from non-production/stale pipelines (`pipelinesTrackingFilter=1`)

Each response is large (20-60MB) and contains all alerts including fixed and dismissed ones. Run this
once per session — the scripts below read from the saved files.

### Summarize active alerts

```bash
python3 .claude/skills/agentic-cg-override/scripts/summarize-alerts.py [input-dir]
```

Filters to active (non-dismissed, non-fixed) alerts on `main` and prints two sections:
- **Production alerts** — from the production pipeline data
- **Non-production / stale alerts** — from the non-production pipeline data

Within each section, legal alerts are shown first (these require manual review), then security alerts.

### Get details for a specific package or CVE

```bash
python3 .claude/skills/agentic-cg-override/scripts/alert-details.py <query> [input-dir]
```

Shows full details for alerts matching a package name or CVE ID: severity, recommended action,
advisory links, and which pipelines detected the alert, grouped by production vs non-production.

### API details

The CG alerts API is undocumented. The endpoint used by the SPA is:

```
GET https://governance.dev.azure.com/{org}/{project-id}/_apis/ComponentGovernance/GovernedRepositories/{repo-id}/Branches/{branch}/Alerts?includeHistory=false&includeDevelopmentDependencies=true&pipelinesTrackingFilter={filter}
```

The `pipelinesTrackingFilter` parameter controls which pipeline category is returned:
- `0` — **Production** alerts (`externalTrackingState` = `production` or `productionByPolicy`)
- `1` — **Non-production / stale** alerts (`externalTrackingState` = `nonProduction` or `nonProductionByPolicy`)

The same alert ID can appear in both responses with different `stateDetails` entries.
Production alerts are the primary focus; non-production alerts are lower priority.

For this repo:
- org: `fluidframework`
- project-id: `235294da-091d-4c29-84fc-cdfc3d90890b`
- repo-id: `17385` (CG registration ID)
- Auth: Bearer token from `az account get-access-token`

The response JSON has shape `{ count: number, value: Alert[] }`. Each alert has:
- `id`, `title`, `severity` (critical/high/medium/low), `type` (security/legal)
- `component.displayName`, `component.displayVersion`, `component.type`
- `actionItems` — recommended fix (e.g., "Upgrade X from Y to Z")
- `sources` — advisory info (e.g., `{ GitHubAdvisories: { url, identifier } }`)
- `isDismissed`, `alertState`
- `stateDetails[]` — per-branch/pipeline state; each entry has `alertState` (active/fixed),
  `branchMoniker`, and `snapshotType.buildDisplayType` (pipeline name)

An alert is considered **active on main** when: `isDismissed` is false AND at least one
`stateDetails` entry has `alertState == "active"` and `branchMoniker` contains `"main"`.

### Presenting alerts to the user

When the user asks to see CG alerts, fetch the data and run the summarize script. Present the
results in two top-level groups — **Production** first, then **Non-production / stale** — since
production alerts are the primary focus. Within each group:

1. **Legal alerts first.** These are license compliance issues (`type: legal`) that require human
   judgment — there is nothing an agent can do programmatically to fix them. Present them clearly
   and tell the user they need to handle these manually.

2. **Security alerts second.** These are vulnerable dependency alerts (`type: security`) that can
   be remediated with pnpm overrides using the workflow in this skill. For each alert, include the
   package name, detected versions, the fix version (from `actionItems`), and the CVE/advisory ID.

When the user asks about a specific package or CVE, use the `alert-details.py` script to show full
details including the recommended action and advisory links.

### Triage workflow for OCE / on-call use

When triaging the CG alert backlog from an on-call rotation, the typical flow is:

```bash
# 1. Refresh the alert cache (once per session)
bash .claude/skills/agentic-cg-override/scripts/fetch-cg-alerts.sh

# 2. See the full active list, grouped by type and severity
python3 .claude/skills/agentic-cg-override/scripts/summarize-alerts.py

# 3. Pick the next CVE to work on — filters to fixable security alerts
#    and drops anything already covered by an open [cg-fixer] PR
python3 .claude/skills/agentic-cg-override/scripts/select-next-alerts.py --max 1
```

`select-next-alerts.py` prints a JSON object with the CVE ID, package, vulnerable versions, fix
version, severity, and advisory URL — the exact inputs the override workflow below needs. It
queries open PRs via `gh pr list --search '[cg-fixer] in:title'` to avoid picking a CVE someone
else is already working on, so OCEs rotating through the backlog do not duplicate effort.

Once you have picked a CVE, fall through to the override workflow in the rest of this skill.

### Running outside GitHub codespaces

`fetch-cg-alerts.sh` honors `$ADO_TOKEN` if set, otherwise falls back to the codespaces `az`
shim. If you are running from a regular workstation with `az` logged into the Microsoft tenant:

```bash
export ADO_TOKEN=$(az account get-access-token \
  --resource 499b84ac-1321-427f-aa17-267ca6975798 \
  --query accessToken -o tsv)
bash .claude/skills/agentic-cg-override/scripts/fetch-cg-alerts.sh
```

## Inputs

Before starting the override workflow, confirm you have all three of these from the user:

1. **Package name** — the npm package with the vulnerability (e.g., `tar`)
2. **Vulnerable versions** — the version(s) to eliminate (e.g., `<7.5.11`, or `6.2.0, 6.1.15`, or `all versions before 4.0.0`)
3. **Fixed version** — the minimum safe version to override to (e.g., `^7.5.11`)

If any input is missing or ambiguous, ask the user before proceeding. If the user hasn't provided
these but has named a package or CVE, use the alert-details script to look up the actionItems field
which usually contains the recommended fix version.

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

## Step 7: Sanity check the lockfile diff

**Before writing the summary**, verify that the lockfile diffs are scoped to the target
package and don't carry incidental churn that would bloat the PR or sneak in unrelated
version changes.

For each affected lockfile, diff against the version on `main` and inspect what changed:

```bash
# List the packages whose versions changed, excluding the target.
# Works with lockfile v9 — keys look like "<name>@<version>:"
git diff origin/main -- <lockfile> \
  | grep -E '^[-+][[:space:]]+[^@]+@[0-9]' \
  | sort -u
```

Classify every version change into one of three buckets:

1. **Expected** — the target package moving from the vulnerable version to the fix version
   (and the transitive closure pinned by the fix; e.g. a newer `@types/path-to-regexp`).
2. **Acceptable incidental** — patch/minor bumps of unrelated packages that the lockfile
   regeneration picked up because they were published since the lockfile was last written.
   These are normal and do not need to block the PR.
3. **Suspicious** — any of the following warrants stopping and re-investigating:
   - A **major-version** bump on any package other than the target.
   - A package that disappears from the lockfile that the workspace actually depends on.
   - New top-level packages introduced that were not previously present.
   - A version change on a security-sensitive package (`express`, `minimatch`,
     `serialize-javascript`, auth / crypto packages, etc.) that is not the target of the
     current fix.

Report any suspicious change to the user before continuing. If unsure whether a change is
acceptable, **ask** rather than commit. The agent should not attempt to "clean up" the
lockfile by hand — if the diff is wrong, the fix is to unwind `pnpm install` and retry with
a tighter override scope.

Also cross-check the `package.json` diff — only the target package's override entry and
its matching comment should have changed. If there are unrelated edits (whitespace,
reordering, other entries), revert them: the formatter should have produced a minimal
diff. If the comment block was rewritten to a different style, match the file's existing
pattern.

## Step 8: Summary

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

### Sanity check:
- Lockfile churn scoped to target: <yes / yes + minor incidentals / no — flagged items>
- Suspicious version changes: <none / list them>

### Next steps:
- Review the changes to package.json and pnpm-lock.yaml files
- Commit the changes on a dedicated branch (one PR per CVE)
```
