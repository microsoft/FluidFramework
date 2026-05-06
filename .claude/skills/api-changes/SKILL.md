---
name: api-changes
description: Use when customer-facing API changes were made — i.e., API report .md files differ from main. Guides through release tag assignment, API Council review requirements, breaking change classification, deprecation process, and changeset guidance. Triggered automatically by ci-readiness-check when api-report diffs are detected.
---

<required>
Before doing any work, create one task/todo item per applicable step using your available task tooling (TaskCreate for Claude, TodoWrite for Copilot). Mark each task in_progress when you start it and completed when you finish. This prevents steps from being silently skipped as context grows.
</required>

# API Changes Review

## Step 1: Identify what changed

```bash
git diff $(git merge-base HEAD origin/main)...HEAD -- '**/api-report/**/*.md'
```

Build a summary table and present it to the user:

| Package | Change type | Tag(s) | Breaking? |
|---------|-------------|--------|-----------|

Change types: addition, removal, signature change, tag promotion.

If all changes are `@internal`-only, tell the user there are no customer-facing API changes and stop.

---

## Step 2: Check release tags, documentation, and export reachability

For any new exports, verify each has a release tag and flag any missing ones to the user — API Extractor will fail with `ae-missing-release-tag`. Help the user choose the right tag:

| Tag | When to use |
|-----|-------------|
| `@public` | Stable, production-ready. Full SemVer. Use only when the shape is final. |
| `@beta` | Seeking feedback, path to `@public`. Production OK with caution. |
| `@alpha` | Experimental, early feedback only. Not for production. No stability guarantees. |
| `@internal` | Framework-internal only, not for external consumers. |

When in doubt: `@alpha` — easier to promote than demote. `@legacy` is a paired modifier (`@legacy @public` or `@legacy @alpha`) for FF v1 APIs; don't apply it to new APIs.

For every new customer-facing export (`@public`, `@beta`, `@alpha`) that is intended to be usable by package consumers, verify it is reachable from the package's public entrypoint, not just exported from the adjacent module or folder. Trace and update the export chain through every relevant `index.ts` barrel up to the package root entrypoint (typically `src/index.ts`, or tiered entrypoints such as `src/alpha.ts` / `src/beta.ts` where used). Missing parent-barrel exports are incomplete API changes. API Extractor may not report the intended API at all, and consumers are expected to import from the package's top-level entrypoint rather than reaching into subpaths.

Also check that each new customer-facing export (`@public`, `@beta`, `@alpha`) has TSDoc documentation — at minimum a summary, `@param` tags, and `@returns` if applicable. Flag any missing documentation to the user.

---

## Step 3: Inform the user about API Council review

Tell the user whether their change requires API Council approval:

| Changed surface | Approval required? |
|---|---|
| `@public`, `@legacy @public`, `@beta`, `@legacy @alpha` | Yes — `fluid-cr-api` will be automatically assigned as a required reviewer on the PR |
| `@alpha` only (not `@legacy`) | No — but early engagement with the council is encouraged |
| `@internal` only | No |

Tell the user: council approval is a separate sign-off from the area owner review. To engage the council, they can reach out to the API Council member on their EM team or tag `@FF API` on Teams. Share this link with the user for more details:
https://eng.ms/docs/experiences-devices/opg/office-shared/fluid-framework/fluid-framework-internal/fluid-framework/docs/dev/resources/api-council

---

## Step 4: Assess breaking changes

A breaking change removes or modifies an existing API in a way that causes compile errors for consumers upgrading.

### @public / @legacy+@public

If this is a breaking change to `@public` or `@legacy @public`, tell the user this is likely a mistake — major releases happen very rarely. Breaking `@public` APIs must be coordinated with a major release; the old API must be deprecated at least 3 months prior in a minor release with a clear replacement.

Share these links with the user for the required process:
- API Deprecation wiki: https://github.com/microsoft/FluidFramework/wiki/API-Deprecation
- Client 3.0 Breaking Changes tracking issue: https://github.com/microsoft/FluidFramework/issues/23271

### @beta / @legacy+@alpha

If this is a breaking change to `@beta` or `@legacy @alpha`, tell the user:
- Breaking changes may only land in minor versions that are an increment of 10 (2.10, 2.20, 2.30, …)
- The PR must be staged on a `test/breaks/client/#.#0/` branch and held until the break window opens
- They should check whether partners (e.g. office-bohemia) consume the API directly — if in doubt, assume they do and allow 12 weeks lead time

Share these links with the user:
- Beta | Legacy Breaking Changes tracking issue: https://github.com/microsoft/FluidFramework/issues/25322
- Full process: https://github.com/microsoft/FluidFramework/wiki/Beta-Break-Process

### @alpha only

Tell the user: while `@alpha` has no contractual stability guarantees, there is an informal agreement not to break office-bohemia. If this change could break office-bohemia, it should be staged using the same process as above.

If there is any doubt, recommend the user test against office-bohemia first by running the office-bohemia integration pipeline against their branch. Share these links:
- Office-bohemia integration pipeline: https://dev.azure.com/office/OC/_build?definitionId=29163
- Build - client packages pipeline: https://dev.azure.com/fluidframework/internal/_build?definitionId=12
- Full instructions: https://eng.ms/docs/experiences-devices/opg/office-shared/fluid-framework/fluid-framework-internal/fluid-framework/docs/dev/monitoring/loop-integration-pipeline/index

Also tell the user: if they skip this check and the change does break office-bohemia, the daily integration pipeline will catch it and FF OCE will revert the PR or contact them to do so ASAP.

---

## Step 5: Deprecation checklist

If any API is being deprecated, check that the following are in place and flag anything missing to the user:

- [ ] `@deprecated` TSDoc comment includes: version deprecated, version of removal, replacement, and a link to the tracking issue:
  ```typescript
  /**
   * @deprecated 2.x.y. Removed in 3.0.0. Use {@link replacementApi} instead.
   * See {@link https://github.com/microsoft/FluidFramework/issues/ABCD} for context.
   */
  ```
- [ ] GitHub issue filed using the "Deprecated API" template as a sub-issue of the appropriate tracking issue
- [ ] In-codebase uses removed (test-only uses may remain with an explanatory comment)
- [ ] Changeset present (see Step 6)

Share this link with the user for full deprecation guidance: https://github.com/microsoft/FluidFramework/wiki/API-Deprecation

---

## Step 6: Changeset

All customer-facing API changes require a changeset — additions, modifications, deprecations, tag promotions, removals.

Check whether one exists: `git status --porcelain -- .changeset/`

If none exists, create one on behalf of the user from the repo root:

```bash
pnpm flub changeset add --empty
```

This drops a randomly-named file in `.changeset/`. Edit it with content based on what changed. YAML front matter lists affected packages (only those meaningful to consumers) with bump type `minor`, plus `"__section"` to route to the right release notes section: `feature` (new APIs), `deprecation`, `breaking` (major / server only; use `legacy` for legacy API breaks), `tree` (changes to SharedTree/`@fluidframework/tree` APIs), `fix`, or `other`.

Summary line rules (from `.changeset/README.md`): succinct, no terminal punctuation, no backtick formatting, present tense. Prefix test: mentally prepend "In this release," to verify it reads naturally. Body may include a code example for features, deprecations, and breaking changes.

After drafting the changeset, show the content to the user and confirm it looks right before moving on.

---

## Step 7: Summary

Present the user with a clear summary:
1. API changes found (table from Step 1)
2. Any missing release tags or documentation
3. Whether API Council review is required
4. Any breaking change warnings and the process the user needs to follow
5. Any deprecation issues
6. Changeset status

End with a clear go/no-go: "Your changes look good to merge" or "Please resolve these issues before merging: …"
