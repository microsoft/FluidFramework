# Open or initialize a SharedTree with a view schema

**Status: Proposed alpha feature.** The names and examples below describe a design, not a released API.

When you load a Fluid container, you can retrieve its SharedTree without knowing whether your application can edit the document.
The document has a *stored schema*, which describes the data it permits.
Your application supplies a *view schema*, which describes the data it expects to read and write.
Today, [`viewWith`](../../src/simple-tree/api/tree.ts) returns a view even when these schemas are incompatible and access to `root` would throw.
You must check compatibility and decide whether to upgrade before you can use the root.

This proposal adds `openView`, which tells you what you can do with the tree now.
For an initialized tree, it returns a ready view, applying a permitted schema upgrade only if it needs one to provide access.
For an uninitialized tree, it returns an initializer instead of choosing initial content for you.
If the document supports neither viewing nor upgrading, you get a compatibility error instead of a view.
Use `viewWith` if you need to inspect compatibility without writing to the document or obtain consent before an upgrade.
Neither the behavior nor the type of `viewWith` changes.

## Caller experience

Both examples use the same note schema and a configured Fluid client named `client`.
The container schema identifies the SharedTree; the view configuration describes the note stored in it.

```typescript
import { SchemaFactory, SharedTree, TreeViewConfiguration } from "fluid-framework";
import { asAlpha } from "@fluidframework/tree/alpha";

const schemaFactory = new SchemaFactory("notes");
class Note extends schemaFactory.object("Note", { title: schemaFactory.string }) {}
const config = new TreeViewConfiguration({ schema: Note });
const containerSchema = { initialObjects: { tree: SharedTree } } as const;
```

### Create a new document

Create a detached container and open its tree.
You expect an initializer because no client has set the document's schema or content yet.
Initialize the note **before** attaching the container so other clients can only load an initialized document.

```typescript
async function createNote(title: string): Promise<string> {
	const { container } = await client.createContainer(containerSchema, "2.0.0");
	try {
		const result = asAlpha(container.initialObjects.tree).openView(config);
		switch (result.kind) {
			case "uninitialized": {
				const view = result.initialize({ title });
				try {
					return await container.attach();
				} finally {
					view.dispose();
				}
			}
			case "ready":
				result.dispose();
				throw new Error("Expected a new note, but the tree is already initialized.");
			case "incompatible":
				throw new Error("Cannot create the note with this schema.", { cause: result });
		}
	} finally {
		container.dispose();
	}
}
```

### Load an existing document

Pass the identifier returned by `createNote` to `getContainer`, then open the tree with the same view configuration.
The `"ready"` case gives you the existing note, including when opening required a schema upgrade.
Neither of the other cases should create or replace content on the load path.

```typescript
async function loadNote(documentId: string) {
	const { container } = await client.getContainer(documentId, containerSchema, "2.0.0");
	try {
		const result = asAlpha(container.initialObjects.tree).openView(config);
		switch (result.kind) {
			case "ready":
				return { container, view: result };
			case "uninitialized":
				result.dispose();
				throw new Error("The saved note has not been initialized.");
			case "incompatible":
				throw new Error("This version of the app cannot open the note.", { cause: result });
		}
	} catch (error) {
		container.dispose();
		throw error;
	}
}
```

On success, the caller can read or edit `view.root.title` immediately.
The caller owns the returned view and container and disposes both when it closes the note.

## What opening a view does

Check the following conditions in order, using the same compatibility rules and staged upgrade policy as `viewWith`:

| First matching condition | Result | Effect on the document |
| --- | --- | --- |
| `canInitialize` is `true`. | Return the initializer with `kind: "uninitialized"`. | None. Only an explicit call to `initialize(content)` sets the schema and content. |
| `canView` is `true`. | Return the view with `kind: "ready"`. | None, even if `canUpgrade` is also `true`. |
| `canUpgrade` is `true`. | Apply the upgrade, then return the view with `kind: "ready"`. | Write the stored schema through the existing upgrade operation. |
| None of the above. | Return the diagnostics with `kind: "incompatible"`. | None. |

Check `canInitialize` first because an optional root can permit an upgrade on an uninitialized tree.
An initialized tree with an empty optional root is different: it has a stored schema and can open successfully with `view.root === undefined`.
Do not test for initialization by reading the root.

The upgrade is a shared edit, not a change to the local view alone.
For example, if a field permits only numbers and the new view also permits strings, the app may need an upgrade before it can write a string.
After the upgrade, a number-only client might no longer be able to use the document, even while the field still contains a number.
Opening opts into that write; it does not authorize a data migration or force an upgrade that SharedTree would otherwise reject.
If the app needs to coordinate this change across versions, follow the [schema evolution guidance](../../../../../website/docs/data-structures/tree/schema-evolution/index.mdx).

## Proposed types and errors

Add the following method to [`ViewableTreeAlpha`](../../src/simple-tree/api/tree.ts), so callers can discover it alongside `viewWith`:

```typescript
openView<TRoot extends ImplicitFieldSchema>(
	config: TreeViewConfiguration<TRoot>,
): OpenTreeViewResult<TRoot>;
```

Export four types from `@fluidframework/tree/alpha`: the result union and one type for each outcome.
The read-only `kind` property identifies the outcome on the object itself.
After checking it, you can use `result.root`, call `result.initialize(content)`, or inspect `result.viewIncompatibilities` and `result.upgradeIncompatibilities`.

| Proposed type | Shape or contract |
| --- | --- |
| `OpenTreeViewResult<TRoot>` | `ReadyTreeView<TRoot> \| UninitializedTreeResult<TRoot> \| IncompatibleTreeResult`. |
| `ReadyTreeView<TRoot>` | `kind: "ready"` and the public `TreeView<TRoot>` members for root access, schema, events, and disposal. No `initialize`, `upgradeSchema`, or `compatibility`. |
| `UninitializedTreeResult<TRoot>` | `kind: "uninitialized"`, the existing [`IDisposable`](../../../../common/core-interfaces/src/disposable.ts) contract, and `initialize(content: InsertableTreeFieldFromImplicitField<TRoot>): ReadyTreeView<TRoot>`. No root or upgrade controls. |
| `IncompatibleTreeResult` | `kind: "incompatible"` and two read-only properties: `viewIncompatibilities: readonly SchemaViewIncompatibility[]` and `upgradeIncompatibilities: readonly SchemaUpgradeIncompatibility[]`. Both lists are nonempty. No live handle. |

Preserve the separate [`TreeView` root accessors](../../src/simple-tree/api/tree.ts) rather than deriving the ready view with `Omit`: the getter returns `TreeFieldFromImplicitField<TRoot>`, but the setter accepts `InsertableTreeFieldFromImplicitField<TRoot>`.
For example, you can assign `{ title: "Draft" }` to the note root and read back a typed `Note`.
The initializer accepts that same insertable type and returns the ready view instead of the `void` returned by `TreeView.initialize`.

For an incompatible result, reuse the [existing diagnostic entry types](../../src/simple-tree/api/tree.ts) and capture both lists before releasing the view.
The existing `CompatibilityResult` describes whether a single operation is permitted; it does not distinguish a ready view from an initializer or explain both failures together.
Callers can then inspect which fields or types prevent access without parsing an error message or keeping the tree open.
Only a schema mismatch that prevents both viewing and upgrading produces an `"incompatible"` result.
Invalid usage, invalid initial content, and unexpected failures still throw; do not translate them into schema mismatches.

## Initializer and view lifetimes

An initializer is not a reservation.
`initialize(content)` rechecks that the tree is still uninitialized, then uses the existing initialization operation to set its stored schema and content together.
If this client has already observed another initialization, the call throws a `UsageError` rather than overwriting content or returning a view as though it used your input.
This local check cannot prevent two clients from initializing concurrently before either observes the other's change.
Initializing before attachment avoids that race.

If you do not intend to initialize, dispose the initializer.
Calling `initialize` consumes the initializer: on success the returned view owns the underlying view; on failure the initializer releases it and propagates the error.
Calling `initialize` on a consumed or disposed initializer throws.
Disposing a consumed initializer must not dispose the ready view.

The root is ready when `openView` returns `"ready"` or when `initialize` returns its view.
Another client can later change the stored schema and invalidate the root.
The returned view retains the existing `schemaChanged` notification, followed by `rootChanged`; neither event triggers an automatic upgrade.
If you keep a view open, stop using the old root on `schemaChanged`.
Schedule a new open after the notification returns, dispose the old view, and handle the new result before you resume editing.
This keeps the decision to write the shared schema at an explicit call site.

## Implementation

Implement `openView` in the [common viewable-tree implementation](../../src/shared-tree/viewableTree.ts) so a SharedTree and an independent tree follow the same rules.
Create one view on the existing checkout and use its [compatibility and upgrade implementation](../../src/shared-tree/schematizingTreeView.ts).
Give ownership of that view to either the ready view or the initializer, never both.
For an incompatible result or an exception during open, dispose the temporary view; do not dispose the caller's tree.
This design requires no new stored format, compatibility algorithm, or event.

Document the implemented contract on the declarations with `@alpha` TSDoc, including the shared write, the open-time guarantee, ownership, and supported `@throws` cases.
Regenerate the entry points and API reports rather than editing generated files.
Once the feature ships, add examples to the [creation and loading guide](../../../../../website/docs/data-structures/tree/recommended-init-flow.mdx) that show when to initialize and when to report an unexpectedly empty document.

## Test requirements

The following requirements define when the feature is ready to ship.
Give each distinct runtime scenario its own named Mocha `it` block and fresh setup so it can run and fail independently.
Use nested `describe` blocks when a shared context makes related tests easier to read.
For example, under `describe("openView")`, group O4a and O4b in `describe("when the document is already viewable")`, with a separate `it` for each upgrade condition.
When cases share setup, use a helper or generate one `it` per input; do not loop over the inputs inside one test.
Keep assertions together when they establish one outcome, such as returning a ready view *without writing*.
Run the single-tree behavior tests against both a SharedTree and an independent tree, as in the [viewable-tree tests](../../src/test/shared-tree/viewableTree.spec.ts).
Use connected SharedTree clients for requirements that depend on delivery of a shared edit.

### Opening a tree

Each test must check both the returned `kind` and the effect on the document.
For a no-write case, check that the stored schema and content remain unchanged **and** that opening submits no edit.
Comparing the root alone would not detect an unwanted schema upgrade.

| Requirement | Starting state and action | Required result |
| --- | --- | --- |
| O1a. Uninitialized required root | Open a new tree with a required root. | Return `"uninitialized"` without writing. |
| O1b. Uninitialized optional root | Open a new tree with an optional root. | Return `"uninitialized"` without installing a schema, even though the root permits empty content. |
| O2. Empty initialized tree | Initialize an optional root with `undefined`, dispose the view, and reopen it. | Return `"ready"` with `root === undefined`. Do not initialize again or write a schema edit. |
| O3a. Matching schema | Open a document with a matching schema. | Return `"ready"` without writing. |
| O3b. Undeclared optional field | Open a document with a populated optional field that the view tolerates but does not declare. | Return `"ready"` without writing. Preserve the field and its value. |
| O4a. Upgrade permitted but unnecessary | Open a viewable document where an explicit upgrade would change the stored schema. | Return `"ready"` without applying the available change. |
| O4b. Upgrade not permitted | Open a viewable document where `canUpgrade` is false. | Return `"ready"` without writing. |
| O5a. Upgrade required | Store the number `5` under a number-only root. Open with a view that permits numbers and strings. | Return `"ready"` with `root === 5`. The same view must now accept a string write. |
| O5b. Reopen after an upgrade | Open a document that needed O5a's upgrade, dispose the ready view, and reopen with the same configuration. | The second open must return `"ready"` without writing another schema edit. |
| O6. Incompatible document | Store `5` under a root that permits numbers and strings. Open with a number-only view. | Return `"incompatible"` without throwing or writing, even though the current value is a number. The result must describe the schema mismatch, not the current value. |
| O7a. Enable a staged change | Open a document that needs an upgrade with the staged change enabled. | Match the stored schema and content produced by an explicit upgrade with the same policy. |
| O7b. Leave a staged change disabled | Open a document that needs an unrelated upgrade with the staged change disabled. | Match the explicit upgrade under the disabled policy; do not enable the staged change. |
| O7c. Retain an enabled change | Open a document that already permits the staged change but needs an unrelated upgrade. Disable that change in the view's policy. | Preserve the previously enabled change and existing content when applying the required upgrade. |

### Initialization and ownership

- **I1a. Successful initialization.** Calling `initialize({ title: "Draft" })` must return a `"ready"` view with `root.title === "Draft"` that can be edited without a second open.
- **I1b. Repeated initialization.** After successful initialization, the initializer must report `disposed` and reject a second call to `initialize`.
- **I1c. Ownership transfer.** Disposing the consumed initializer must leave the returned view usable.
- **I2a. Abandoned initialization.** Disposing an unused initializer must leave the document uninitialized. A fresh open must return a usable initializer.
- **I2b. Initialization after disposal.** Calling `initialize` on an initializer disposed before use must throw without writing.
- **I3a. Invalid initial content.** With schema validation enabled, content that the root schema rejects must cause `initialize` to throw rather than return an incompatible result.
- **I3b. Cleanup after invalid input.** After initialization fails validation, a fresh open must allow valid initialization without requiring the caller to release the failed initializer.
- **I4. Ready-view disposal.** Disposing a ready view must release the view, not the tree. A new open must return a usable view of the same content.

### Diagnostics and other failures

- **F1. Diagnostic details.** For O6, both `viewIncompatibilities` and `upgradeIncompatibilities` must be nonempty and match the corresponding structured diagnostics from `viewWith` on the same starting schema. Check the mismatch and its location, not the wording of a message.
- **F2. Diagnostic lifetime.** After an incompatible open, immediately open the tree with a compatible configuration and change its stored schema. Both lists on the original result must still describe the failed open, even if the caller first reads them after the change. No caller disposal of the incompatible result is required.
- **F3. Unexpected failure.** Cause the upgrade operation to throw a known exception after the temporary view is created. `openView` must propagate that exception and release the temporary view. It must not return `"incompatible"` or dispose the caller's tree.

### Collaboration and existing callers

- **C1. Create, attach, and load.** Initialize a detached tree, attach its container, and load it by identifier from another client. The loading client must receive `"ready"` with the creator's content and must not submit an initialization or upgrade edit.
- **C2. Stale initializer.** Obtain an initializer on client A, initialize on client B, then deliver B's change to A before A calls `initialize`. A's call must throw a `UsageError`, release its initializer, and submit no edit. Reopening on A must show B's content. This case tests an *observed* change, not a guarantee against simultaneous initialization.
- **C3a. Remote invalidation.** Start A with a ready number-only view and deliver B's upgrade from O5a. A must receive `schemaChanged` before `rootChanged` and lose access to its old root without submitting a schema edit.
- **C3b. Reopen with the old schema.** After receiving B's upgrade and disposing the invalidated view, A must get `"incompatible"` when it reopens with its number-only configuration.
- **C3c. Reopen with the new schema.** After receiving B's upgrade and disposing the invalidated view, A must get `"ready"` without another write when it reopens with B's configuration.
- **C4. Existing `viewWith` callers.** On the same upgradeable starting document as O5a, `viewWith` must still return a view with `canView === false` and `canUpgrade === true`. It must not write until the caller explicitly invokes `upgradeSchema()`.
- **C5. Older runtime with a compatible view.** After the new client upgrades a shared document, load it with a supported earlier runtime using `viewWith`, a compatible view schema, and a storage format both runtimes support. The older client must be able to read the existing value and synchronize an edit with the new client. Use real runtimes for this test: [schema snapshots](../../../../../website/docs/data-structures/tree/schema-evolution/index.mdx) compare declarations using only the currently installed runtime.

### TypeScript and release surface

Use focused compile-time tests for each result variant, accessor, and entry point below.
For example, a test for the type of a root read must not depend on a test for assignment to the root.

- **T1. Result narrowing.** An exhaustive `switch` on `kind` must type-check without a cast. Only `"ready"` exposes `root`, `schema`, and view events; only `"uninitialized"` exposes `initialize`; only `"incompatible"` exposes the two diagnostic lists. Both live handles must support disposal. Neither may expose `compatibility` or `upgradeSchema` through its declared type.
- **T2. Root and input types.** With the note configuration, both `initialize({ title: "Draft" })` and `view.root = { title: "Draft" }` must compile. A read of `view.root` must have type `Note`, not the insertable object type. A numeric `title` must fail to type-check in both write positions.
- **T3. Alpha boundary.** The four named types must be importable from `@fluidframework/tree/alpha`. The method must be callable through `asAlpha(tree)` but must not appear on the stable tree interface. Existing stable `viewWith` calls must retain their return type.
