# Changesets

We use a modified version of the [changesets][] workflow to track changes that we want to communicate to customers or partners.

A changeset is a Markdown file with YAML front matter stored in the `.changeset` folder. It carries two key bits of information:

- The packages affected by the change
- A Markdown-formatted description of the change

This is useful because it breaks change tracking into two steps:

1. **Adding a changeset** — done in a PR, by a contributor, while the change is fresh in mind.
2. **Releasing/versioning** — combines all changesets and writes changelogs, which can then be reviewed in aggregate.

## Changeset format

```md
---
"@myproject/cli": minor
"@myproject/core": minor
---

Change all the things

More exposition about the change.
```

> [!NOTE]
> The bump type (`major` | `minor` | `patch`) is included in every changeset, but **within the FluidFramework repo the bump type is determined by the branch the change is merged to.** Practically speaking, this means most changesets are `minor` changes. If you use the tools we provide, this metadata will be filled out for you automatically.

## Custom metadata

We support additional custom metadata via special properties prefixed with double underscores (`__`). **This is not supported by standard changeset tools**, including [@changesets/cli](https://www.npmjs.com/package/@changesets/cli); it is a custom addition used by our own tools.

```md
---
"@myproject/cli": minor
"__section": fix
"__includeInReleaseNotes": false
"__highlight": true
---

Change all the things
```

All custom metadata is optional and is primarily intended to help with release notes generation:

- **`__section`** — the section of the release notes the entry should appear in. See [release note sections](#release-note-sections) below.
- **`__includeInReleaseNotes`** — set to `false` to hide an entry from the release notes entirely.
- **`__highlight`** — set to `true` to highlight an entry within its section, re-ordering it to appear first. Otherwise entries are sorted by commit date.

The TypeScript type for this metadata is `FluidCustomChangesetMetadata` in `build-tools/packages/build-cli/src/library/changesets.ts`.

> [!IMPORTANT]
> Because standard changeset tools don't support custom metadata, our tools such as `flub generate:changelog` strip it before invoking commands like `changeset version`. If not removed, it ends up in changelogs and messes with formatting.

### Release note sections

The sections are configured in [fluidBuild.config.cjs](https://github.com/microsoft/FluidFramework/blob/main/fluidBuild.config.cjs) in the root of the repo. Current sections:

| Section       | Heading                        | Use for                                    |
|---------------|--------------------------------|--------------------------------------------|
| `breaking`    | Breaking Changes               | Breaking API changes (typically major releases / server only) |
| `feature`     | New Features                   | New capabilities and features              |
| `tree`        | SharedTree DDS Changes         | Changes specific to SharedTree             |
| `fix`         | Bug Fixes                      | Bug fixes                                  |
| `deprecation` | Deprecations                   | Newly deprecated APIs                      |
| `legacy`      | Legacy API Changes             | Changes to legacy/compat APIs              |
| `other`       | Other Changes                  | Everything else                            |

> [!NOTE]
> Client releases with breaking _legacy_ changes should use the `legacy` section, not `breaking`. The `breaking` section is reserved for major releases, which practically means server.

> [!NOTE]
> For deprecations, follow the [deprecation process](https://github.com/microsoft/FluidFramework/wiki/API-Deprecation).
> Ensure that both the deprecation changeset and the removal changeset include a link to the GitHub tracking issue, when one exists.


## Changesets that apply to no packages

Sometimes information needs to be in the release notes but doesn't apply to any package (e.g. when deleting a package). To accommodate this, we support changesets that omit package names:

```md
---
"__section": other
---

This changeset will be included in the release notes but not per-package changelogs.
```

> [!TIP]
> Standard changeset tools silently ignore changesets that apply to no packages. This is fine since such changesets are intended for release notes only.

## Adding a changeset to a PR

You can add a changeset manually or by using the `pnpm flub changeset add` command.

### Using the CLI

Run `pnpm flub changeset add --releaseGroup <releaseGroup>` from the root of the release group. You will be prompted to select affected packages. By default the CLI shows packages changed relative to `main`; use `--branch <BRANCH>` to compare with a different branch. The output is fully editable after creation.

### Manually

Add a markdown file to the `.changeset` folder with a descriptive kebab-case name (e.g. `add-batch-operations.md`). Include the YAML frontmatter with affected packages and metadata.

### Empty changeset

Use `pnpm flub changeset add --empty` to create an empty changeset, then fill in the details.

### How do I know what packages to include?

Each package listed in a changeset will get a changelog entry with the changeset's contents. Only include packages where the change is **meaningful to consumers**. You don't need to list every package that was modified. For example, if you deprecate a class in packageA and update packageB to stop using it, only packageA needs the changeset.

## Formatting

- Each changeset needs at least two parts: a summary line (the heading) and a body paragraph.
  The summary can stand alone for simple changes, but a body is recommended.
- The summary line should be succinct and focused on the **customer benefit** rather than the implementation.
- The summary line should not have sentence punctuation (no period at the end).
- Preferred: the summary line should not contain code formatting (backticks).
  Too much code formatting in headings becomes unreadable, and there's no good way to measure "too much," so we prefer to just avoid it.
- Write in present tense ("Add support for...") or present perfect ("Has been updated to...").
  We use present tense because we are describing changes in the current release.
  A useful rule of thumb: mentally prefix the summary with "In this release," and verify it reads naturally.
- Avoid referring to package names in the summary (they appear in the "packages affected" section of release notes).
- Changeset body content may include Markdown headings starting at **level 4** (`####`), since levels 1-3 are used in the release notes structure.
- `@`-prefixed text use should be code formatted (backtick enclosed).
  GitHub will aggressively turn "@foo" into a mention of username `foo`.
- Include links to relevant documentation (e.g. API docs on fluidframework.com) where possible.
- A changeset should never be just a link — always include a summary with links for more detail.
- For features, breaking changes, and deprecations, include a code example showing usage or migration.
  Use `// ...` to elide boilerplate and keep examples focused on the essential change.
- Wrap lines at sentence boundaries for better git diffs and review tooling.

### What NOT to include

- Internal implementation details irrelevant to consumers
- PR numbers (the PR which created the changeset is automatically linked by the changelog generator)
- Internal issue identifiers (for example, `AB#12345`) or links to non-public/internal tracking systems or websites
- Author attribution
- Dates (added automatically during release)
- Changes to test-only or internal-only packages

### Examples

#### Bug fix

```md
---
"@fluidframework/container-runtime": minor
"__section": fix
---

Incorrect error message when disposing a container has been fixed

The error message when attempting to dispose a container that is already disposed now correctly identifies the operation that failed.
```

#### New feature (tree + fluid-framework)

````md
---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": feature
"__highlight": true
---

Add support for schema evolution in SharedTree

SharedTree now supports evolving document schemas over time.
When a document is opened with a newer schema version, the runtime automatically handles migration of existing data to match the new schema.

#### Migration behavior

When schema changes are detected:
- New optional fields are added with default values
- Removed fields are silently ignored during deserialization
- Type changes follow the standard coercion rules

```typescript
// ...
const view = tree.viewWith(new TreeViewConfiguration({ schema: MyUpdatedSchema }));
// ...
```
````

#### Breaking change with migration example

````md
---
"@fluidframework/container-runtime": minor
"@fluidframework/container-definitions": minor
"__section": breaking
---

Deprecated summarizer options have been removed from container runtime

The deprecated `ISummaryOptions` interface has been removed.
Use `ISummaryConfiguration` instead, which provides the same capabilities with a clearer configuration model.

#### Migration

```typescript
// Before
// ...
const options: ISummaryOptions = { maxOps: 100 };
// ...

// After
// ...
const config: ISummaryConfiguration = { maxOps: 100 };
// ...
```
````

## Which PRs require changesets?

Any change that should be communicated to customers or partners should have a changeset. Changes without a changeset are "invisible" to customers. Add a changeset with every communicable change, even if empty — the contents can be updated before release. The presence of the changeset signals that something needs to be communicated.

## More information

- [Official changesets documentation](https://github.com/changesets/changesets)
- [Changesets FAQ](https://github.com/microsoft/FluidFramework/wiki/Changesets-FAQ)
- For questions, contact @tylerbutler

## Updating changelogs from changesets

See [flub generate changelog](../build-tools/packages/build-cli/docs/generate.md#flub-generate-changelog), which is built on top of [@fluid-private/changelog-generator](../build-tools/packages/changelog-generator/README.md).

<!-- LINKS -->
[changesets]: https://github.com/changesets/changesets
