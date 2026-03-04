# Changeset Writing Guidelines

Detailed guidelines for writing changeset content. These rules ensure consistent,
high-quality changelogs and release notes.

## Summary Line

- First paragraph after frontmatter (single line)
- Concise description of the change focused on **customer benefit**
- No trailing period
- No code formatting (backticks) in the summary
- No package names (they appear in the YAML metadata)
- Mentally prefix with "In this release" to verify it reads naturally

Good:
```
Add support for batch operations in SharedTree
```

Bad:
```
Updated `@fluidframework/tree` package to support batch operations.
```

## Body Content

- Follows the summary after a blank line
- Use full Markdown formatting
- Subheadings start at **level 4** (`####`) since higher levels are used by the changelog structure
- Use present tense ("Add", "Remove", "Update") or present perfect ("Has been updated")
- Include links to documentation when relevant
- Never use only a link; always include a brief summary alongside it

## Tense and Voice

- Present tense: "Add support for..." / "Remove deprecated API..."
- Present perfect: "The `foo` method has been updated to..."
- Avoid past tense ("Added", "Removed") and future tense ("Will add")

## Examples

### Simple bug fix

```markdown
---
"@fluidframework/tree": patch
---

Fix incorrect error message when inserting into a detached tree

The error message when attempting to insert a node into a detached tree now correctly
identifies the operation that failed.
```

### New feature with highlight

```markdown
---
"@fluidframework/tree": minor
"__section": feature
"__highlight": true
---

Add support for schema evolution in SharedTree

SharedTree now supports evolving document schemas over time. When a document is opened
with a newer schema version, the runtime automatically handles migration of existing
data to match the new schema.

#### Migration behavior

When schema changes are detected:
- New optional fields are added with default values
- Removed fields are silently ignored during deserialization
- Type changes follow the standard coercion rules
```

### Breaking change

````markdown
---
"@fluidframework/tree": major
"__section": breaking
---

Remove deprecated `TreeView.root2` property

The `root2` property on `TreeView` has been removed. Use `root` instead, which now
provides the same functionality that `root2` previously offered.

#### Migration

Replace all usages of `.root2` with `.root`:

```typescript
// Before
const value = treeView.root2;

// After
const value = treeView.root;
```
````

### Deprecation

```markdown
---
"@fluidframework/tree": minor
"__section": deprecation
---

Deprecate `SchemaFactory.optional` in favor of `SchemaFactory.optionalNode`

`SchemaFactory.optional` is now deprecated. Use `SchemaFactory.optionalNode` instead,
which has the same behavior but a clearer name that distinguishes it from optional
fields in object schemas.
```

### Multi-package change

```markdown
---
"@fluidframework/container-runtime": minor
"@fluidframework/container-definitions": minor
"__section": feature
---

Add container-level metadata storage API

A new API for storing metadata at the container level is now available. This enables
scenarios like storing document titles, author information, or custom application state
that is not tied to a specific DDS.
```

## What NOT to Include

- Internal implementation details irrelevant to consumers
- PR numbers or issue references (these are added automatically by the changelog generator)
- Author attribution
- Dates (added automatically during release)
- Changes to test-only or internal-only packages
