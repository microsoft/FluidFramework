---
name: changeset
description: >
  Create and edit changesets (changelog entries) for the Fluid Framework monorepo.
  Changesets are markdown files with YAML frontmatter that track package changes for
  changelogs and release notes. Use when the user asks to create a changeset, add a
  changelog entry, document a code change for release, or edit an existing changeset.
  Also use when the user mentions "changeset", "changelog entry", or asks what changed
  in a PR that needs documentation. Triggers on: "add changeset", "create changeset",
  "write changeset", "changelog", "changeset", or after completing a code change that
  should be documented.
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
"@fluidframework/sequence": patch
---

Summary affecting multiple packages
```

### With release notes metadata (optional second frontmatter block)

```markdown
---
"@fluidframework/tree": minor
---
---
"__section": feature
"__highlight": true
---

Short summary

Detailed description of the feature.
```

## File Naming

Generate a random `{adjective}-{noun}-{verb}.md` filename (lowercase, hyphen-separated).
Examples: `brave-lions-roar.md`, `quiet-birds-sing.md`, `tall-dogs-jump.md`

Place the file in the `.changeset/` directory at the repo root.

## Version Bump Types

| Type    | When to use                                            |
|---------|--------------------------------------------------------|
| `major` | Breaking changes to public API                         |
| `minor` | New features, non-breaking API additions (most common) |
| `patch` | Bug fixes, internal changes                            |

Most changesets use `minor`. The bump type is generally determined by the branch.

## Release Notes Metadata

Optional second frontmatter block with `__`-prefixed keys:

| Key                        | Type    | Default  | Description                                    |
|----------------------------|---------|----------|------------------------------------------------|
| `__section`                | string  | _unknown | Release notes section (see sections below)     |
| `__highlight`              | boolean | false    | Feature at top of its section in release notes  |
| `__includeInReleaseNotes`  | boolean | true     | Set false to exclude from release notes         |

### Available Sections

| Section       | Heading                        | Use for                                    |
|---------------|--------------------------------|--------------------------------------------|
| `breaking`    | Breaking Changes               | Breaking API changes                       |
| `feature`     | New Features                   | New capabilities and features              |
| `tree`        | SharedTree DDS Changes         | Changes specific to SharedTree             |
| `fix`         | Bug Fixes                      | Bug fixes                                  |
| `deprecation` | Deprecations                   | Newly deprecated APIs                      |
| `legacy`      | Legacy API Changes             | Changes to legacy/compat APIs              |
| `other`       | Other Changes                  | Everything else                            |

## Package Selection

Include only packages where the change is **meaningful to consumers**. Do not list every
modified file's package. Ask: "Would a user of this package care about this change?"

### Common Package Scopes

- `@fluidframework/*` - Main public packages
- `@fluid-experimental/*` - Experimental packages
- `fluid-framework` - The umbrella package

Exclude from changesets: `@fluid-example/*`, `@fluid-internal/*`, `@fluid-test/*`, `@fluid-private/*`

### Changeset Without Packages

For changes not tied to specific packages (e.g. repo-wide tooling):

```markdown
---
__section: other
---

Description of the change
```

## Writing Guidelines

See [references/writing-guidelines.md](references/writing-guidelines.md) for detailed
content and formatting guidelines.

Key rules:
- First line after frontmatter is the **summary** (one concise sentence, no period)
- Write in present tense ("Add support for...") or present perfect ("Has been updated to...")
- Mentally prefix with "In this release" to verify readability
- No package names in the summary (they appear in metadata)
- No code formatting in headings
- Minimum: summary line + blank line + body paragraph

## Workflow

1. Determine which packages are affected and the appropriate bump type
2. Choose a release notes section if applicable
3. Generate a random filename
4. Write the changeset file with proper frontmatter and description
5. If unsure about packages or bump type, ask the user

## Editing Existing Changesets

Read the changeset file, modify as needed, and write it back. Changeset filenames are
meaningless and should not be changed. The content (packages, bump types, description)
can be freely edited.
