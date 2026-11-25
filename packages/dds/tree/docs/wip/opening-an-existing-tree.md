# Open or initialize a SharedTree with a view schema

**Status: Implemented as an alpha feature.** This document records the design and its acceptance requirements.

When you load a Fluid container, you can retrieve its SharedTree without knowing whether your application can edit the document.
The document has a *stored schema*, which describes the data it permits.
Your application supplies a *view schema*, which describes the data it expects to read and write.
Today, [`viewWith`](../../src/simple-tree/api/tree.ts) returns a view even when these schemas are incompatible and access to `root` would throw.
You must check compatibility and decide whether to upgrade before you can use the root.

Use `TreeViewAlpha.initializeNew` for creation or `TreeViewAlpha.openExisting` for loading.
The creation helper takes initial content and returns an editable view.
The loading helper applies a permitted schema upgrade only if needed for access; if it can neither view nor upgrade the document, it returns diagnostics.
Use `viewWith` if you need to inspect compatibility without writing to the document or obtain consent before an upgrade.
Neither the behavior nor the type of `viewWith` changes.

## Caller experience

Both examples use the same note schema and a configured Fluid client named `client`.
The container schema identifies the SharedTree; the view configuration describes the note stored in it.
Whether you create or load a note, you get a `NoteDocument` with the open container and the editable view.

```typescript
import { SchemaFactory, SharedTree, TreeViewConfiguration, type IFluidContainer } from "fluid-framework";
import { TreeViewAlpha } from "@fluidframework/tree/alpha";

const schemaFactory = new SchemaFactory("notes");
class Note extends schemaFactory.object("Note", { title: schemaFactory.string }) {}
const treeViewConfig = new TreeViewConfiguration({ schema: Note });
const containerSchema = { initialObjects: { tree: SharedTree } } as const;

interface NoteDocument {
	readonly container: IFluidContainer<typeof containerSchema>;
	readonly view: TreeViewAlpha<typeof Note>;
}
```

### Create a new document

Initialize the note with its first title **before** attaching the container, so other clients can only load an initialized document.
`TreeViewAlpha.initializeNew` returns the editable view directly. It throws a usage error if the tree is already initialized or the initial content does not match the schema.

```typescript
async function createNote(title: string): Promise<NoteDocument> {
	const { container } = await client.createContainer(containerSchema, "2.0.0");
	try {
		const view = TreeViewAlpha.initializeNew(container.initialObjects.tree, treeViewConfig, { title });
		try {
			await container.attach();
		} catch (error) {
			view.dispose();
			throw error;
		}
		return { container, view };
	} catch (error) {
		container.dispose();
		throw error;
	}
}
```

### Load an existing document

Pass the saved document ID to `loadNote`.
It loads the container by ID, then opens the tree with the same view configuration.
`canView` tells you whether the existing note is ready to use, including after a required schema upgrade.
An incompatible schema returns diagnostics; an unexpectedly uninitialized tree throws a usage error. Neither case creates or replaces content.

```typescript
async function loadNote(documentId: string): Promise<NoteDocument> {
	const { container } = await client.getContainer(documentId, containerSchema, "2.0.0");
	try {
		const result = TreeViewAlpha.openExisting(container.initialObjects.tree, treeViewConfig);
		if (!result.canView) {
			throw new Error("This version of the app cannot open the note.", { cause: result.incompatibilities });
		}
		return { container, view: result.view };
	} catch (error) {
		container.dispose();
		throw error;
	}
}
```

On success, the caller can read or edit `view.root.title` immediately.
The caller owns the returned view and container and disposes both when it closes the note.

## What opening a view does

`TreeViewAlpha.openExisting` opens a view with `viewWith` and checks the following conditions in order:

| First matching condition | Result | Effect on the document |
| --- | --- | --- |
| `canInitialize` is `true`. | Throw a usage error and release the view. | None. Loading never initializes a document. |
| `canView` is `true`. | Return `{ canView: true, view }`. | None, even if `canUpgrade` is also `true`. |
| `canUpgrade` is `true`. | Apply the upgrade, then return `{ canView: true, view }`. | Write the stored schema through the existing upgrade operation. |
| None of the above. | Return `{ canView: false, incompatibilities }` and release the view. | None. |

Check `canInitialize` first because an optional root can permit an upgrade on an uninitialized tree.
An initialized tree with an empty optional root is different: it has a stored schema and can open successfully with `view.root === undefined`.
Do not test for initialization by reading the root.

The upgrade is a shared edit, not a change to the local view alone.
For example, if a field permits only numbers and the new view also permits strings, the app may need an upgrade before it can write a string.
After the upgrade, a number-only client might no longer be able to use the document, even while the field still contains a number.
Opening opts into that write; it does not authorize a data migration or force an upgrade that SharedTree would otherwise reject.
If the app needs to coordinate this change across versions, follow the [schema evolution guidance](../../../../../website/docs/data-structures/tree/schema-evolution/index.mdx).

## Types and errors

Both methods take an `ITree` and a `TreeViewConfiguration<TRoot>`. Pass the tree from the container directly.
`TreeViewAlpha.initializeNew` also requires the initial content, typed as `InsertableTreeFieldFromImplicitField<TRoot>`, and returns `TreeViewAlpha<TRoot>`.
It does not attempt an upgrade on an initialized tree, even if the configuration would permit one.
If the content does not match the schema, the tree remains available for another initialization attempt.

`TreeViewAlpha.openExisting` returns `ViewExistingResult<TRoot>`.
With `canView: true`, you own `result.view`; with `canView: false`, `result.incompatibilities` explains both blockers and there is nothing to dispose.
Calling it on an uninitialized tree is a usage error, not a compatibility result.

| Type | Shape or contract |
| --- | --- |
| `ViewExistingResult<TRoot>` | `ViewExistingSuccess<TRoot> \| ViewExistingFailure`. |
| `ViewExistingSuccess<TRoot>` | `canView: true` and `readonly view: TreeViewAlpha<TRoot>`. The caller owns `view`. |
| `ViewExistingFailure` | `canView: false` and `readonly incompatibilities: ViewTreeIncompatibilities`. No live handle. |
| `ViewTreeIncompatibilities` | Two read-only lists: `view` contains the `SchemaViewIncompatibility` entries and `upgrade` contains the `SchemaUpgradeIncompatibility` entries. Both lists are nonempty. |

Both paths give the caller the actual [`TreeViewAlpha`](../../src/simple-tree/api/tree.ts), not a narrowed interface.
On a successful load, use `result.view`. On creation, use the view returned by `TreeViewAlpha.initializeNew` directly.
The existing root accessors and view-level helpers work unchanged: for example, you can assign `{ title: "Draft" }` to the root, read back a typed `Note`, or pass the view to `Tree.runTransaction`.
The view still exposes `compatibility` and `upgradeSchema`, but callers do not need either to begin editing.

For an incompatible result, reuse the [existing diagnostic entry types](../../src/simple-tree/api/tree.ts) and capture both lists before releasing the view.
Each existing `CompatibilityResult` describes a single operation; the loading helper collects the reasons for both failures.
Callers can then inspect which fields or types prevent access without parsing an error message or keeping the tree open.
Only a schema mismatch that prevents both viewing and upgrading produces a `canView: false` result.
Invalid usage, invalid initial content, and unexpected failures still throw; do not translate them into schema mismatches.

## View lifetime

`TreeViewAlpha.initializeNew` rechecks that the tree is still uninitialized after preparing the caller's content, then sets its stored schema and content together.
If this client has already observed another initialization, the call throws a `UsageError` rather than overwriting content or returning a view as though it used your input.
This local check cannot prevent two clients from initializing concurrently before either observes the other's change.
Initializing before attachment avoids that race.

The root is ready when `TreeViewAlpha.openExisting` succeeds or `TreeViewAlpha.initializeNew` returns.
Another client can later change the stored schema and invalidate the root.
The returned view retains the existing `schemaChanged` notification, followed by `rootChanged`; neither event triggers an automatic upgrade.
If you keep a view open, stop using the old root on `schemaChanged`.
Schedule a new open after the notification returns, dispose the old view, and handle the new result before you resume editing.
This keeps the decision to write the shared schema at an explicit call site.

## Implementation

The [helpers](../../src/simple-tree/api/treeViewAlpha.ts) each create one view with `viewWith` and reuse its [schema implementation](../../src/shared-tree/schematizingTreeView.ts).
Only `TreeViewAlpha.openExisting` can upgrade an existing document. On success, each helper gives ownership of its view to the caller.
For an incompatible result or an exception during open, dispose the temporary view; do not dispose the caller's tree.
This design requires no new stored format, compatibility algorithm, or event.

Document the implemented contract on the declarations with `@alpha` TSDoc, including the shared write, the open-time guarantee, ownership, and supported `@throws` cases.
Regenerate the entry points and API reports rather than editing generated files.
The [creation and loading guide](../../../../../website/docs/data-structures/tree/recommended-init-flow.mdx) shows when to initialize and when to report an unexpectedly uninitialized document.

## Test requirements

The following requirements define when the feature is ready to ship.
Give each distinct runtime scenario its own named Mocha `it` block and fresh setup so it can run and fail independently.
Use nested `describe` blocks when a shared context makes related tests easier to read.
For example, group O4a and O4b in `describe("when the document is already viewable")`, with a separate `it` for each upgrade condition.
When cases share setup, use a helper or generate one `it` per input; do not loop over the inputs inside one test.
Keep assertions together when they establish one outcome, such as returning a ready view *without writing*.
Run the single-tree behavior tests against an `ITree` obtained from a SharedTree provider.
Use connected SharedTree clients for requirements that depend on delivery of a shared edit.

### Opening a tree

Each test must check both the outcome and the effect on the document.
For a no-write case, check that the stored schema and content remain unchanged **and** that opening submits no edit.
Comparing the root alone would not detect an unwanted schema upgrade.

| Requirement | Starting state and action | Required result |
| --- | --- | --- |
| O1a. Uninitialized required root | Open a new tree with a required root. | Throw a usage error without writing. |
| O1b. Uninitialized optional root | Open a new tree with an optional root. | Throw a usage error without installing a schema, even though the root permits empty content. |
| O2. Empty initialized tree | Initialize an optional root with `undefined`, dispose the view, and reopen it. | Return `canView: true` with `view.root === undefined`. Do not initialize again or write a schema edit. |
| O3a. Matching schema | Open a document with a matching schema. | Return `canView: true` without writing. |
| O3b. Undeclared optional field | Open a document with a populated optional field that the view tolerates but does not declare. | Return `canView: true` without writing. Preserve the field and its value. |
| O4a. Upgrade permitted but unnecessary | Open a viewable document where an explicit upgrade would change the stored schema. | Return `canView: true` without applying the available change. |
| O4b. Upgrade not permitted | Open a viewable document where `canUpgrade` is false. | Return `canView: true` without writing. |
| O5a. Upgrade required | Store the number `5` under a number-only root. Open with a view that permits numbers and strings. | Return `canView: true` with `view.root === 5`. The same view must now accept a string write. |
| O5b. Reopen after an upgrade | Open a document that needed O5a's upgrade, dispose the ready view, and reopen with the same configuration. | The second open must return `canView: true` without writing another schema edit. |
| O6. Incompatible document | Store `5` under a root that permits numbers and strings. Open with a number-only view. | Return `canView: false` without throwing or writing, even though the current value is a number. The result must describe the schema mismatch, not the current value. |
| O7a. Enable a staged change | Open a document that needs an upgrade with the staged change enabled. | Match the stored schema and content produced by an explicit upgrade with the same policy. |
| O7b. Leave a staged change disabled | Open a document that needs an unrelated upgrade with the staged change disabled. | Match the explicit upgrade under the disabled policy; do not enable the staged change. |
| O7c. Retain an enabled change | Open a document that already permits the staged change but needs an unrelated upgrade. Disable that change in the view's policy. | Preserve the previously enabled change and existing content when applying the required upgrade. |

### Initialization and ownership

- **I1. Successful initialization.** Calling `TreeViewAlpha.initializeNew` with `{ title: "Draft" }` must return a `TreeViewAlpha` with `root.title === "Draft"` that can be edited without a second open.
- **I2. Repeated initialization.** On an initialized tree, `TreeViewAlpha.initializeNew` must throw without writing, even if loading with that configuration could apply an upgrade.
- **I3a. Invalid initial content.** Content that the root schema rejects must cause `TreeViewAlpha.initializeNew` to throw a usage error.
- **I3b. Cleanup after invalid input.** After validation fails, another call with valid input must succeed without requiring any cleanup by the caller.
- **I4. Ready-view disposal.** Disposing a ready view must release the view, not the tree. A new open must return a usable view of the same content.

### Diagnostics and other failures

- **F1. Diagnostic details.** For O6, `result.incompatibilities` must contain only the `view` and `upgrade` lists. Both must be nonempty and match the corresponding structured diagnostics from `viewWith` on the same starting schema. Check the mismatch and its location, not the wording of a message.
- **F2. Diagnostic lifetime.** After an incompatible open, immediately open the tree with a compatible configuration and change its stored schema. Both lists on the original result must still describe the failed open, even if the caller first reads them after the change. No caller disposal of the incompatible result is required.
- **F3. Unexpected failure.** Cause the upgrade operation to throw a known exception after the temporary view is created. `TreeViewAlpha.openExisting` must propagate that exception and release the temporary view. It must not return `canView: false` or dispose the caller's tree.

### Collaboration and existing callers

- **C1. Create, attach, and load.** Initialize a detached tree, attach its container, and load it by identifier from another client. The loading client must receive `canView: true` with the creator's content and must not submit an initialization or upgrade edit.
- **C2. Remote initialization.** Initialize on client B, then deliver B's change to A before A tries to initialize. A's call must throw a `UsageError`, release its temporary view, and submit no edit. Reopening on A must show B's content. This case tests an *observed* change, not a guarantee against simultaneous initialization.
- **C3a. Remote invalidation.** Start A with a ready number-only view and deliver B's upgrade from O5a. A must receive `schemaChanged` before `rootChanged` and lose access to its old root without submitting a schema edit.
- **C3b. Reopen with the old schema.** After receiving B's upgrade and disposing the invalidated view, A must get `canView: false` when it reopens with its number-only configuration.
- **C3c. Reopen with the new schema.** After receiving B's upgrade and disposing the invalidated view, A must get `canView: true` without another write when it reopens with B's configuration.
- **C4. Existing `viewWith` callers.** On the same upgradeable starting document as O5a, `viewWith` must still return a view with `canView === false` and `canUpgrade === true`. It must not write until the caller explicitly invokes `upgradeSchema()`.
- **C5. Older runtime with a compatible view.** After the new client upgrades a shared document, load it with a supported earlier runtime using `viewWith`, a compatible view schema, and a storage format both runtimes support. The older client must be able to read the existing value and synchronize an edit with the new client. Use real runtimes for this test: [schema snapshots](../../../../../website/docs/data-structures/tree/schema-evolution/index.mdx) compare declarations using only the currently installed runtime.

### TypeScript and release surface

Use focused compile-time tests for each result variant, accessor, and entry point below.
For example, a test for the type of a root read must not depend on a test for assignment to the root.

- **T1. Result narrowing.** A check on `canView` must narrow the result without a cast. Only success carries a view, and only failure exposes diagnostics. Initialization must return the same full view type as a successful load.
- **T2. Root and input types.** With the note configuration, passing `{ title: "Draft" }` to `TreeViewAlpha.initializeNew` and assigning it to `view.root` must compile. Reading `view.root` must yield a `Note`. A numeric `title` must fail to type-check in both write positions.
- **T3. Alpha boundary.** The helpers and their result and diagnostic types must be importable from `@fluidframework/tree/alpha`. Both accept a stable `ITree` directly; existing `viewWith` calls retain their return type.
