# Schema compatibility snapshot error diagnostics

Status: proposed.
This document describes a change to consumer-facing error messages; it does not change schema compatibility rules.

## Context and goals

When you call `snapshotSchemaCompatibility`, the checker compares your current application schema with historical schema snapshots.
It requires the current schema to support upgrading every historical document schema.
Within the collaboration window, it also requires historical views to support documents created with the current schema.
Today, failures identify the affected versions, but do not explain which schema constraints prevent viewing or upgrading.

[microsoft/FluidFramework#28721](https://github.com/microsoft/FluidFramework/pull/28721) added separate viewing and upgrade results with structured incompatibilities and human-readable reasons.
The snapshot checker already receives these results through `getCompatibility`.
This proposal uses those diagnostics to explain each failed check in the thrown error.

The goals are to:

- Identify the failed operation and the versions involved.
- Include all reasons supplied for that operation, including affected schema locations.
- Preserve the relationship between a rejected upgrade and its nested viewing incompatibilities.
- Keep error output deterministic and readable in test failures and continuous integration logs.
- Preserve existing validation, snapshot updates, and error context.

This work does not introduce a new public API, error class, option, snapshot format, or dependency.
It does not fix existing snapshot limitations for staged-optional fields or configured staged-upgrade policies.
It also does not inspect document content, identify application intent, or prescribe migrations.

## Existing implementation

The relevant code is:

- [`snapshotCompatibilityChecker.ts`](../../src/simple-tree/api/snapshotCompatibilityChecker.ts): computes directional results, collects failure messages, and constructs the final error in `errorWithContext`.
- [`tree.ts`](../../src/simple-tree/api/tree.ts): defines `CompatibilityResult`, `SchemaViewIncompatibility`, and `SchemaUpgradeIncompatibility`.
- [`schemaCompatibilityTester.ts`](../../src/simple-tree/api/schemaCompatibilityTester.ts): creates the structured diagnostics and their `reason` strings.
- [`snapshotCompatibilityChecker.spec.ts`](../../src/test/simple-tree/api/snapshotCompatibilityChecker.spec.ts): tests the consumer-facing snapshot workflow and exact error messages.
- [`schemaCompatibilityTester.spec.ts`](../../src/test/simple-tree/api/schemaCompatibilityTester.spec.ts): tests the individual diagnostic variants.

A failed `CompatibilityResult` has `isCompatible: false` and a nonempty `incompatibilities` array.
A successful result has no `incompatibilities` property.
The checker must narrow on `isCompatible` before reading the array; checking the older boolean aliases alone does not provide this type narrowing.

Each incompatibility has a `reason` intended for human-readable logging and debugging.
Its wording is not stable API.
The formatter should reuse that text rather than reproduce the diagnostic engine's rules or build a second description from structured fields.

## Proposed behavior

### Select diagnostics for the failed operation

Keep the two existing directional checks and attach the corresponding incompatibility list:

| Existing requirement | Result to test | Details to append when it fails |
| --- | --- | --- |
| The current schema can upgrade a historical document | `currentViewOfSnapshotDocument.upgrade.isCompatible` | `currentViewOfSnapshotDocument.upgrade.incompatibilities` |
| A historical view within the collaboration window can view a current document | `snapshotViewOfCurrentDocument.view.isCompatible` | `snapshotViewOfCurrentDocument.view.incompatibilities` |

Use the discriminated results in place of `canUpgrade` and `canView` at these two checks.
They represent the same decisions, so this is not a change to the acceptance criteria.

The distinction between viewing and upgrading remains important:

- If the current view cannot view a historical document but can upgrade it, that historical document passes the backward-compatibility check.
  Do not report its pre-upgrade viewing incompatibilities as a failure.
- If an in-window historical view cannot view the current document, report that failure even if its own upgrade operation is allowed.
  Requiring historical clients to upgrade is not a substitute for the existing collaboration requirement.
- If the current view can view a historical document but cannot upgrade it, retain the existing failure and include the upgrade reasons.
- If the current view can neither view nor upgrade a historical document, report the upgrade reasons.
  Do not also append an independent list of pre-upgrade viewing reasons: the failed requirement is upgrading, and its diagnostics explain why that operation is blocked.
  If the rejected candidate would still be unreadable, its upgrade result already contains the relevant viewing reasons.
- If both directional checks fail, report both version-level failures with their own details.
- Historical schemas outside the collaboration window remain subject to the upgrade requirement, but not the historical-view requirement.

### Message layout

Retain the existing first-level failure sentences and the context added by `errorWithContext`.
Add nested bullets immediately below each compatibility failure:

```text
Schema compatibility check failed:
 - <existing version-level failure sentence>
   - <reason>
   - <reason>
     - <nested reason>
Snapshots in: "<snapshot directory>"
Snapshots exist for versions: [
	"<version>",
	"<version>"
].
```

The first-level bullet has one leading space, as it does today.
Each diagnostic level adds two spaces.
Do not wrap reason text at a fixed column; allow the terminal or editor to wrap long lines.
If a reason contains multiple lines, indent its continuation lines to the text column of that bullet.

Use `reason` as the diagnostic text without adding mismatch codes, JSON dumps, or duplicate location labels.
The existing reasons already describe the relevant field or node and the failed constraint.
Structured fields remain available from the compatibility APIs for programmatic handling.

### Nested upgrade failures

`SchemaUpgradeIncompatibility` includes `viewIncompatibleAfterUpgrade`.
This means the proposed stored schema meets the stored-schema upgrade rules, but the view still cannot read or write documents using that proposal.
No upgrade has taken place.

Print this entry's `reason`, then print its `incompatibilities` one level deeper.
These children describe the proposed schema, not the document's original stored schema.
Do not flatten them into unrelated failures or omit them after printing the parent reason.

All other current incompatibility variants are leaves and need only their `reason`.
The only variant-specific formatting logic should be recognizing `viewIncompatibleAfterUpgrade` and rendering its children.

### Ordering and completeness

Preserve the checker's current iteration order, including its selected version comparer and synthetic entry for a collaboration minimum between snapshots.
Preserve the order of diagnostics returned by the compatibility engine.
Do not sort human-readable reasons, deduplicate across versions, or truncate lists.
This keeps every failure associated with its comparison and avoids hiding distinct constraints.

For a given comparison, an upgrade failure remains before a historical-view failure, matching the existing loop.
Snapshot freshness and version-validation messages retain their current positions and receive no fabricated schema diagnostics.

### Preserve error and update semantics

Keep the thrown value as a plain `Error`.
Keep the existing heading, snapshot directory, list of snapshot versions, and contextual notes.
Only compatibility failure entries gain diagnostic children.

In particular:

- In `"assert"` mode, a stale-snapshot message can appear alongside compatibility failures.
  Attach details only to those compatibility failures.
- In `"update"` mode, retain the current behavior of writing a permitted snapshot update before reporting compatibility failures.
  Do not change which comparison results are replaced after that write.
- Preserve early validation errors, custom snapshot filenames, custom version comparison, and version-policy flags.
- Preserve the current snapshot-version context even when an update has written another file; refreshing that context is outside this proposal.

Message text remains diagnostic output, not a supported machine-readable contract.
Consumers that parse the old full error string will observe a change.
The implementation should document the richer output without promising stable wording.

## Sample errors

The following are proposed outputs, not the output of the current checker.
The complete examples assume snapshots for `1.0.0` and `2.0.0` already exist and the latest matches the current schema, so no freshness message is needed.
Paths are illustrative.
Reason text follows the current diagnostic engine, but can change when that engine's wording changes.

### Historical view cannot view the current document

Version `1.0.0` permits only a numeric root.
Version `2.0.0` permits a numeric or string root, while the collaboration minimum remains `1.0.0`.
The current schema can upgrade historical documents, but the historical view cannot handle strings in current documents.

```text
Schema compatibility check failed:
 - Historical version "1.0.0" cannot view documents from "2.0.0": these versions are expected to be able to collaborate due to the selected `minVersionForCollaboration` "1.0.0".
   - Cannot view the root field: the stored schema allows node types ["com.fluidframework.leaf.string"], which the view does not allow.
Snapshots in: "/app/schema-snapshots"
Snapshots exist for versions: [
	"1.0.0",
	"2.0.0"
].
```

### Current schema cannot upgrade because the candidate still prevents viewing

Version `1.0.0` permits a numeric or string root.
Version `2.0.0` removes string support and sets the collaboration minimum to `2.0.0`.
The upgrade candidate retains historical string support to preserve allowed content, but the current view cannot handle it.
Dropping historical clients from the collaboration window does not remove the requirement to support their documents.

```text
Schema compatibility check failed:
 - Current version "2.0.0" cannot upgrade documents from "1.0.0".
   - Cannot upgrade: the resulting stored schema would still prevent the view from reading or writing the document.
     - Cannot view the root field: the stored schema allows node types ["com.fluidframework.leaf.string"], which the view does not allow.
Snapshots in: "/app/schema-snapshots"
Snapshots exist for versions: [
	"1.0.0",
	"2.0.0"
].
```

### Current schema cannot upgrade because a stored-schema rule rejects the proposal

Version `1.0.0` defines `example.Container` as a map.
Version `2.0.0` reuses that identifier for an object and sets the collaboration minimum to `2.0.0`.
The error contains the direct upgrade reason, without a post-upgrade viewing wrapper:

```text
Schema compatibility check failed:
 - Current version "2.0.0" cannot upgrade documents from "1.0.0".
   - Cannot upgrade node type "example.Container": changing the stored node representation from Map to Object is not permitted.
Snapshots in: "/app/schema-snapshots"
Snapshots exist for versions: [
	"1.0.0",
	"2.0.0"
].
```

### Current schema adds a required field whose requirement cannot be satisfied

Version `1.0.0` defines an empty `example.Task` object and has no numeric node definition.
Version `2.0.0` adds a required numeric `priority` field and sets the collaboration minimum to `2.0.0`.
The diagnostic explains the schema requirement; it does not claim that actual document values were inspected:

```text
Schema compatibility check failed:
 - Current version "2.0.0" cannot upgrade documents from "1.0.0".
   - Cannot upgrade node type "example.Task": required field "priority" has no child type that can be constructed using the existing stored definitions (allowed types: ["com.fluidframework.leaf.number"]).
Snapshots in: "/app/schema-snapshots"
Snapshots exist for versions: [
	"1.0.0",
	"2.0.0"
].
```

### Both directional checks fail

Use the numeric-or-string to numeric-only change from the second example, but retain `1.0.0` as the collaboration minimum.
The current view rejects preserved string support in the candidate.
Separately, the historical view expects a document schema that permits writing strings, while the current document schema does not.

```text
Schema compatibility check failed:
 - Current version "2.0.0" cannot upgrade documents from "1.0.0".
   - Cannot upgrade: the resulting stored schema would still prevent the view from reading or writing the document.
     - Cannot view the root field: the stored schema allows node types ["com.fluidframework.leaf.string"], which the view does not allow.
 - Historical version "1.0.0" cannot view documents from "2.0.0": these versions are expected to be able to collaborate due to the selected `minVersionForCollaboration` "1.0.0".
   - Cannot view the root field: the view allows node types ["com.fluidframework.leaf.string"], which the stored schema does not allow.
Snapshots in: "/app/schema-snapshots"
Snapshots exist for versions: [
	"1.0.0",
	"2.0.0"
].
```

### Multiple blockers within one comparison

Every reported blocker remains a separate child.
For example, if a historical view rejects string support in two current object fields, its failure can contain the following excerpt.
The normal snapshot context follows it.

```text
 - Historical version "1.0.0" cannot view documents from "2.0.0": these versions are expected to be able to collaborate due to the selected `minVersionForCollaboration` "1.0.0".
   - Cannot view field "priority" of node type "example.Task": the stored schema allows node types ["com.fluidframework.leaf.string"], which the view does not allow.
   - Cannot view field "estimate" of node type "example.Task": the stored schema allows node types ["com.fluidframework.leaf.string"], which the view does not allow.
```

### Freshness failure alongside compatibility details

If the current version's snapshot is stale in `"assert"` mode, preserve that existing failure before the compatibility failure.
For example, changing the `2.0.0` snapshot's numeric-or-string schema to numeric-only without updating the snapshot can produce this excerpt:

```text
 - Snapshot for current version "2.0.0" is out of date: schema has changed since latest existing snapshot version "2.0.0". If this is expected, snapshotSchemaCompatibility can be rerun in "update" mode to update or create the snapshot.
 - Current version "2.0.0" cannot upgrade documents from "2.0.0".
   - Cannot upgrade: the resulting stored schema would still prevent the view from reading or writing the document.
     - Cannot view the root field: the stored schema allows node types ["com.fluidframework.leaf.string"], which the view does not allow.
```

There can also be failures against older snapshots.
This excerpt illustrates the same-version failure only; the heading, other failures, and normal snapshot context are omitted.

### Other diagnostic variants

The same layout handles every current variant without new wording in the snapshot checker.
The following are representative reason lines, not complete errors or claims that every variant can be constructed through consumer schema factories.
Some variants require lower-level stored-schema fixtures.
In particular, changing a field from `SchemaFactory.string` to `SchemaFactory.number` changes allowed node types; it is not a leaf `valueSchema` change under a shared identifier.

| Operation | `mismatch` | Representative reason |
| --- | --- | --- |
| View | `allowedTypes` | `Cannot view the root field: the view allows node types ["com.fluidframework.leaf.string"], which the stored schema does not allow; the stored schema allows node types ["com.fluidframework.leaf.number"], which the view does not allow.` |
| View | `fieldKind` | `Cannot view the root field: the view permits zero or one child, but the stored schema permits exactly one child.` |
| View | `valueSchema` | `Cannot view node type "example.Leaf": the view expects number values, but the stored schema allows string values.` |
| View | `nodeKind` | `Cannot view node type "example.Container": the stored node structure does not match the view's Object definition (stored representation: Map).` |
| Upgrade | `allowedTypes` | `Cannot upgrade the root field: the proposed schema removes allowed node types ["com.fluidframework.leaf.string"].` |
| Upgrade | `fieldKind` | `Cannot upgrade the root field: changing from exactly one child to exactly one identifier string is not permitted by the schema upgrade rules.` |
| Upgrade | `valueSchema` | `Cannot upgrade node type "example.Leaf": changing leaf values from string values to number values is not permitted.` |
| Upgrade | `nodeKind` | `Cannot upgrade node type "example.Container": changing the stored node representation from Map to Object is not permitted.` |
| Upgrade | `missingNodeSchema` | `Cannot upgrade node type "example.Legacy": its stored definition is missing from the proposed schema.` |
| Upgrade | `nodeSchemaCannotBeSatisfied` | `Cannot upgrade node type "example.Task": required field "priority" allows no child types.` |
| Upgrade | `viewIncompatibleAfterUpgrade` | `Cannot upgrade: the resulting stored schema would still prevent the view from reading or writing the document.` |

For `nodeSchemaCannotBeSatisfied`, retain the engine's full reason for each constraint.
Besides the required-field cases above, a reason can explain that a proposed map requires an entry for every possible key and cannot be satisfied by a finite tree.
For `viewIncompatibleAfterUpgrade`, always follow the parent reason with its viewing children.

Locations can be the root field, an object's stored field key, or map entries.
For example, a map-entry reason can read:

```text
Cannot view map entries of node type "example.Lookup": the stored schema allows node types ["com.fluidframework.leaf.string"], which the view does not allow.
```

Use these existing location descriptions as supplied.
Do not reinterpret an empty stored field key as a root location or invent a document-instance path.

## Implementation outline

1. Add a private formatting helper in `snapshotCompatibilityChecker.ts`.
   It takes the existing failure sentence and a readonly list of viewing or upgrade incompatibilities, and returns a multiline failure entry.
   It appends each `reason` and renders children only for `viewIncompatibleAfterUpgrade`.
   It does not construct an `Error`, inspect schema data, or invoke compatibility checking.
2. At the two directional checks, narrow the corresponding `view` or `upgrade` result on `isCompatible`.
   On failure, pass that result's incompatibilities to the helper and collect the returned entry.
3. Keep the final bullet-prefixing step and `errorWithContext` unchanged.
   Account for that outer prefix when choosing indentation inside the helper.
4. Update the function's documentation to explain that compatibility failures include operation-specific reasons.
   Replace the current broad statement that the checker does not explain the underlying changes, while retaining the warning that message wording can change.
5. Extend the existing tests and add an implementation changeset for the consumer-facing diagnostic improvement, following repository changeset guidance.
   No API report changes should be required because the public API shape is unchanged.

Read incompatibility arrays only in the failed branches where they will be displayed.
Upgrade diagnostics can be computed lazily, so do not serialize successful or unrelated results as a formatting shortcut.
Do not add catches or fallback messages that hide unexpected diagnostic failures.

The reasons can contain application-defined schema identifiers and stored field keys.
This proposal adds those details to the requested local error message, but adds no logging, telemetry, document values, or automatic schema dumps.

## Validation and acceptance criteria

Extend `snapshotCompatibilityChecker.spec.ts` with end-to-end assertions for:

- Historical-view failure with its viewing reasons.
- Current-upgrade failure with a direct stored-schema reason.
- Current-upgrade failure with `viewIncompatibleAfterUpgrade` and its nested reasons.
- Multiple blockers and both directional failures without lost or misattributed details.
- A current view that cannot view but can upgrade, which must continue to pass.
- A historical view that cannot view but can upgrade, which must continue to fail inside the collaboration window.
- A historical schema outside the collaboration window, which must still fail if the current schema cannot upgrade it.
- Successful checks, which must remain successful without constructing failure details.
- Snapshot freshness errors combined with diagnostics in `"assert"` mode.
- Snapshot writes followed by the same compatibility rejection in `"update"` mode.
- Existing custom version comparison, filename formats, strict version flags, and collaboration-minimum rounding behavior.
- Unchanged non-compatibility errors and unchanged snapshot context.

Use exact-message assertions for the hierarchy, indentation, version attribution, and context.
Keep reason wording consistent with the diagnostic engine's fixtures; a wording change in that engine can require corresponding expectation updates here.
Reuse the lower-level diagnostic tests for the meaning of individual mismatch variants rather than duplicate their compatibility rules in the formatter tests.
Do not add public exports solely to test the private formatter.

After building the package and its tests, run the focused suites from `packages/dds/tree`:

```bash
pnpm exec mocha --spec lib/test/mochaHooks.js --spec lib/test/simple-tree/api/snapshotCompatibilityChecker.spec.js --spec lib/test/simple-tree/api/schemaCompatibilityTester.spec.js
```

Explicitly include the package's root hooks when selecting individual test files.
The hooks clean up shared test resources.
Run the existing package lint and type-check tasks for the implementation change as well.

The change is complete when each failed directional requirement includes the appropriate reasons, nested failures retain their hierarchy, and all existing pass/fail decisions and snapshot side effects remain unchanged.
