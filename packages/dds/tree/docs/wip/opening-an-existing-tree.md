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

## Implementation and verification

Implement `openView` in the [common viewable-tree implementation](../../src/shared-tree/viewableTree.ts) so a SharedTree and an independent tree follow the same rules.
Create one view on the existing checkout and use its [compatibility and upgrade implementation](../../src/shared-tree/schematizingTreeView.ts).
Give ownership of that view to either the ready view or the initializer, never both.
For an incompatible result or an exception during open, dispose the temporary view; do not dispose the caller's tree.
This design requires no new stored format, compatibility algorithm, or event.

Use the [viewable-tree tests](../../src/test/shared-tree/viewableTree.spec.ts) to exercise both kinds of tree:

- Verify each row of the decision table, including an uninitialized tree configured with an optional root and an initialized tree with an empty optional root.
- Initialize with valid content and verify that the returned root contains it without a second open. Dispose the consumed initializer and verify the ready view still works.
- Dispose an unused initializer and verify that the tree remains uninitialized. Test invalid content, repeated initialization, and initialization after disposal.
- Obtain an initializer, apply another client's initialization, then call the stale initializer. Verify that it throws and leaves the other client's content unchanged.
- For an already viewable document with a permitted upgrade, verify that opening does not change the stored schema or emit a schema edit.
- For a required upgrade, verify that the root is usable on return, existing content is intact, and a second open does not write again.
- For an incompatible document, verify that both diagnostic lists remain usable after cleanup and that a different, compatible view can still open the tree.
- Verify that an unexpected exception propagates and does not leave the temporary view open.
- Use two clients to verify that a later schema change notifies the first client without causing a second schema write, and that an explicit reopen reports the new state.
- Add type tests that narrow on `kind` and access the root, initializer method, or diagnostic lists directly. For the note schema, verify that both initialization and root assignment accept a `{ title: string }` object and that reading the root returns a `Note`.
- Verify that only the initializer exposes `initialize`, only the ready view exposes `root`, and neither exposes `upgradeSchema` or `compatibility`.

Document the implemented contract on the declarations with `@alpha` TSDoc, including the shared write, the open-time guarantee, ownership, and supported `@throws` cases.
Regenerate the entry points and API reports rather than editing generated files.
Once the feature ships, add examples to the [creation and loading guide](../../../../../website/docs/data-structures/tree/recommended-init-flow.mdx) that show when to initialize and when to report an unexpectedly empty document.
