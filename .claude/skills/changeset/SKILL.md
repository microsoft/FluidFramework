---
name: changeset
description: >
  Use when the user asks to create, edit, or document a changeset or changelog entry.
  Triggers on: "changeset", "changelog", or editing `.changeset/*.md` files. Also trigger
  after completing code changes that should be documented, and before committing changes
  to `*.api.md` files (API report changes typically need an accompanying changeset).
---

# Changeset Skill

Create and edit changesets for the Fluid Framework monorepo. Changesets track changes
for changelogs and release notes. They live in `.changeset/` as markdown files with
YAML frontmatter.

## Changeset File Format

```markdown
---
"@fluidframework/package-name": minor
---

Short summary of the change

Optional longer description with details. Use Markdown formatting.
Subheadings start at level 4 (####).
```

### Multi-package changeset

```markdown
---
"@fluidframework/merge-tree": minor
"@fluidframework/sequence": minor
"__section": fix
---

Fix merge conflict resolution when segments overlap

The merge-tree and sequence packages now handle overlapping segment ranges correctly during concurrent edits.
```

### With release notes metadata

```markdown
---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": feature
"__highlight": true
---

Add support for optional field defaults in SharedTree schemas

Schema definitions now support specifying default values for optional fields.
When a document is opened and an optional field is missing, the default value is used automatically.
```

## File Naming

Use a short, descriptive kebab-case filename based on the change (e.g. `add-batch-operations.md`,
`fix-dispose-error-message.md`, `remove-deprecated-root2.md`).

Place the file in the `.changeset/` directory at the repo root.

## Version Bump Type

In this repo, the bump type is determined by the target branch, so use `minor` as the
default for all changesets. If you're unsure whether a different bump type is appropriate,
ask the user.

## Release Notes Metadata

Optional `__`-prefixed keys in the same frontmatter block:

| Key                        | Type    | Default  | Description                                    |
|----------------------------|---------|----------|------------------------------------------------|
| `__section`                | string  | _unknown | Release notes section (see sections below)     |
| `__highlight`              | boolean | false    | Feature at top of its section in release notes  |
| `__includeInReleaseNotes`  | boolean | true     | Set false to exclude from release notes         |

### Available Sections

Sections are configured in `fluidBuild.config.cjs` (search for `sections`).
See [.changeset/README.md](../../.changeset/README.md#release-note-sections) for the
current list with descriptions. Common values: `feature`, `fix`, `breaking`,
`deprecation`, `tree`, `legacy`, `other`.

## Package Selection

Include only packages where the change is **meaningful to consumers**. Do not list every
modified file's package. Ask: "Would a user of this package care about this change?"

### Common Package Scopes

- `@fluidframework/*` — Main public packages
- `@fluid-experimental/*` — Experimental packages
- `fluid-framework` — The umbrella package (reexports most of `@fluidframework/tree`, `@fluidframework/map`
and `@fluidframework/fluid-static`)

### `fluid-framework` Reexports

The `fluid-framework` package reexports most of `@fluidframework/tree`'s public API.
When a change affects tree's public API surface, almost always include **both** packages
in the changeset. This is one of the most common mistakes — forgetting to list
`fluid-framework` alongside `@fluidframework/tree`.

Other packages are re-exported by `fluid-framework` as well, including `@fluidframework/map`
and `@fluidframework/fluid-static`. If the change affects the public API of any re-exported
package, include both the original package and `fluid-framework` in the changeset.

### Exclude from changesets

- Any package marked `"private": true` in its `package.json` (any scope, including `@fluid-private/*`)
- Packages in the `@fluid-example/*`, `@fluid-internal/*`, and `@fluid-test/*` scopes

### Changeset Without Packages

For changes not tied to specific packages (e.g. repo-wide tooling):

```markdown
---
"__section": other
---

Description of the change
```

## Writing Guidelines

See [.changeset/README.md](../../.changeset/README.md) for detailed formatting rules and
[references/writing-guidelines.md](references/writing-guidelines.md) for examples.

Summary line (first line after frontmatter):
- One concise sentence, no trailing period
- Present tense ("Add support for...") or present perfect ("Has been updated to...")
- No package names (they appear in metadata)
- No code formatting (backticks)
- Mentally prefix with "In this release" to verify readability

Body content:
- Optional but recommended
- Wrap lines at sentence boundaries for better git diffs
- For features, breaking changes, and deprecations, include a **code example** showing
  usage or migration. Use `// ...` to elide boilerplate and focus on the essential change.
- Include links to relevant API docs on fluidframework.com where possible

## Workflow

1. Determine which packages are affected and the appropriate bump type
2. Choose a release notes section if applicable
3. Choose a descriptive kebab-case filename
4. Write the changeset file with proper frontmatter and description
5. If unsure about packages or bump type, ask the user

## Editing Existing Changesets

Read the changeset file, modify as needed, and write it back. Changeset filenames are
meaningless and should not be changed. The content (packages, bump types, description)
can be freely edited.
