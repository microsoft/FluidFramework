# Changeset Writing Guidelines

See [.changeset/README.md](../../../.changeset/README.md) for the full changeset documentation
including format, custom metadata, sections, and formatting rules.

This file contains additional examples to guide changeset writing.

## Examples

### Bug fix

```markdown
---
"@fluidframework/container-runtime": minor
"__section": fix
---

Incorrect error message when disposing a container has been fixed

The error message when attempting to dispose a container that is already disposed now correctly identifies the operation that failed.
```

### New feature (tree + fluid-framework)

````markdown
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

### Breaking change with migration example

````markdown
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

## What NOT to Include

- Internal implementation details irrelevant to consumers
- PR numbers or issue references (added automatically by the changelog generator)
- Author attribution
- Dates (added automatically during release)
- Changes to test-only or internal-only packages
