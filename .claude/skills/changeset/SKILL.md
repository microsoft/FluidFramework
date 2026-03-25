---
name: changeset
description: Create changeset files for the FluidFramework repo. Use this skill whenever the user asks to add, create, or write a changeset, or mentions "changeset" in the context of documenting a code change. Also trigger when the user says things like "document this change", "add a changelog entry", "what changed on this branch", or asks about changesets for a PR. Even if the user just says "changeset" with no other context, use this skill.
---

# Creating Changesets

Changesets are Markdown files with YAML frontmatter that track changes for release notes and changelogs.
They live in the `.changeset/` directory and carry two things: which packages are affected and a description of the change.

Your job is to analyze the current branch, figure out what changed, and write a well-crafted changeset file.

## Step 1: Understand the change

Run `git diff main...HEAD` to see what changed on this branch.
Also run `git log main..HEAD --oneline` to see commit messages for additional context.

Read the diff carefully. Identify:
- Which packages were modified (look at file paths under `packages/`, `experimental/`, etc.)
- What kind of change it is (feature, bug fix, breaking change, deprecation, tree-specific, etc.)
- What a **consumer** of the package would care about (not internal implementation details)

If the diff is large or unclear, ask the user what the change does rather than guessing.

## Step 2: Determine affected packages

Only list packages where the change is **meaningful to consumers**.
You don't need to list every package that was touched — only the ones where a changelog entry makes sense.

For example, if you deprecate a class in `@fluidframework/tree` and update `@fluidframework/container-runtime` to stop using it, only `@fluidframework/tree` needs the changeset.

**Important re-export rule**: The `fluid-framework` package re-exports from several packages including `@fluidframework/tree`, `@fluidframework/container-definitions`, `@fluidframework/container-loader`, and others.
If a change affects the public API of a package that `fluid-framework` re-exports, include **both** the source package and `fluid-framework` in the changeset.
The most common case is `@fluidframework/tree` changes — these almost always need both:

```yaml
"fluid-framework": minor
"@fluidframework/tree": minor
```

To check if a package is re-exported by `fluid-framework`, look at `packages/framework/fluid-framework/src/index.ts`.

## Step 3: Choose the right section

Pick the `__section` value based on what the change is:

| Section       | Use for                                                        |
|---------------|----------------------------------------------------------------|
| `feature`     | New capabilities and features                                  |
| `tree`        | Changes specific to SharedTree DDS                             |
| `fix`         | Bug fixes                                                      |
| `breaking`    | Breaking API changes (typically major releases or server only) |
| `deprecation` | Newly deprecated APIs                                          |
| `legacy`      | Changes to legacy/compat APIs                                  |
| `other`       | Everything else                                                |

Client releases with breaking *legacy* changes use `legacy`, not `breaking`.
The `breaking` section is reserved for major releases (practically: server).

If the change is a significant highlight (important new feature, major breaking change), set `__highlight: true` so it appears first in release notes.

## Step 4: Write the changeset file

### File name
Use a descriptive kebab-case name based on the change (e.g., `add-splice-to-array-nodes.md`, `fix-container-dispose-error.md`).

### Bump type
Almost always `minor`. The actual bump type is determined by the branch, not the changeset. Use `minor` unless you have a specific reason not to.

### Format

```md
---
"package-name": minor
"__section": <section>
---

Summary line here

Body paragraph with more details about the change.
```

### Writing guidelines

These are important — they directly affect how professional and readable the release notes are.

**Summary line (first paragraph after frontmatter):**
- One sentence, focused on the customer benefit rather than the implementation
- Present tense: "Add support for..." or present perfect: "Has been updated to..."
- A useful test: mentally prefix with "In this release," and check it reads naturally
- No period at the end
- No backticks or code formatting (headings with lots of backticks become unreadable)
- Don't mention package names (they appear in the "packages affected" section automatically)
- For removals: use present perfect tense — "The deprecated `X` API has been removed"
- For fixes: use present perfect tense — "Incorrect behavior when X has been fixed"

**Body:**
- Be thorough — the body is the consumer's primary source of information about this change.
  Call out specific methods, types, or behaviors affected.
  Explain the practical benefit or impact, not just what changed.
  A consumer reading this should understand what they need to do and why the change matters to them.
- Wrap lines at sentence boundaries (better git diffs and review tooling)
- Use level 4+ headings only (`####`) since levels 1-3 are used in release notes structure
- For features, breaking changes, and deprecations: include a code example showing usage or migration
- Use `// ...` to elide boilerplate in code examples — keep them focused on the essential change
- Include links to relevant API docs on fluidframework.com where possible.
  For example, link to the API page for a new method or class being introduced.
  This helps consumers find the full reference documentation.
- For deprecations, say "future release" (not "future major release") since some APIs may be removed in minor releases
- Never include: PR numbers, issue references, author attribution, dates, internal implementation details

**What NOT to include in a changeset:**
- Changes to test-only or internal-only packages
- Internal implementation details irrelevant to consumers
- A changeset that is just a link with no summary

### Examples

#### Bug fix

```md
---
"@fluidframework/container-runtime": minor
"__section": fix
---

Incorrect error messages when calling methods on a disposed container runtime have been fixed

Error messages thrown when calling `summarize`, `submitSignal`, or `submitBatchMessage` on a disposed container runtime now include the method name and container ID.
This makes it easier to diagnose which container and operation triggered the error in environments with multiple containers.
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

#### Breaking change with migration

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

#### Tree-specific change

````md
---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---

Add splice method to TreeArrayNodeAlpha

A `splice` method is now available on `TreeArrayNodeAlpha` that supports removing and inserting items in a single operation, aligning with JavaScript's [Array.splice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/splice) API.
Returns the removed items as an array.
Supports negative `start` indices (wraps from end) and an optional `deleteCount` (omitting removes everything from `start` onward).

The alpha API is accessible via `asAlpha` on existing `TreeArrayNode` instances, or by using `SchemaFactoryAlpha`.

#### Usage

```typescript
import { SchemaFactoryAlpha } from "@fluidframework/tree";

const sf = new SchemaFactoryAlpha("example");
const Inventory = sf.arrayAlpha("Inventory", sf.string);
const inventory = new Inventory(["Apples", "Bananas", "Pears"]);

// Remove 2 items starting at index 0, insert new items in their place
const removed = inventory.splice(0, 2, "Oranges", "Grapes");
// removed: ["Apples", "Bananas"]
// inventory: ["Oranges", "Grapes", "Pears"]
```
````

## Step 5: Write the file

Save the changeset to `.changeset/<descriptive-name>.md`.

After writing, run `cat -n .changeset/<filename>.md` to show the user the result.
Ask if they want any changes before considering the task complete.

## Edge cases

**No packages affected**: Sometimes a changeset applies to no packages (e.g., deleting a package). Omit package names and just include `__section`:

```md
---
"__section": other
---

Description of the change that doesn't apply to a specific package.
```

**Multiple unrelated changes**: Create separate changeset files, one per logical change.

**User provides specific instructions**: If the user tells you what packages or section to use, defer to them. Your analysis of the diff is a starting point, not the final word.
