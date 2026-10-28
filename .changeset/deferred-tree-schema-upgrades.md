---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Read upgraded SharedTree views without immediately publishing a schema change

The alpha `TreeViewConfigurationAlpha` now accepts `schemaUpgradeMode: "deferred"`.
The default remains `"immediate"`.

In deferred mode, call `upgradeSchema()` explicitly to enable local access.
Reading or exporting the view does not publish the upgrade.
The next committed application change publishes any still-needed schema upgrade before its data change.
Constraint-only and net-zero changes count as changes; empty transactions and transactions containing only upgrade requests do not trigger publication.
Initialization remains immediate.

An aborted transaction rolls back upgrades requested inside that transaction, but retains upgrades applied before it began.
Separate schema and data commits preserve native data-only undo.
Explicit mixed schema/data transactions retain their existing undo restrictions.
Closing a view cancels unused preparation, not application edits already submitted.

If publication is rejected, SharedTree retries retained edits once when safe, without rerunning application callbacks.
If recovery is unsafe or the retry is rejected, the tree becomes unusable and propagates an error rather than silently dropping edits.
Branch history continues to expose physical attempts and their actual revision IDs.

```typescript
const view = tree.viewWith(
	new TreeViewConfigurationAlpha({
		schema: MySchema,
		schemaUpgradeMode: "deferred",
	}),
);

if (view.compatibility.canUpgrade) {
	view.upgradeSchema();
}

if (view.compatibility.canView) {
	// This read does not publish the upgrade.
	const root = view.root;
}
```
