---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
New alpha API for attaching custom metadata to commits

Applications can now attach arbitrary, JSON-serializable metadata to the commit produced by a transaction, replicate it to collaborating clients, and persist it in the document.

Supply the metadata via the new `customMetadata` field on `RunTransactionParamsAlpha`:

```typescript
view.runTransaction(
	() => {
		view.root.insertAtEnd("new item");
	},
	{ customMetadata: { author: "alice", intent: "add-item" } },
);
```

Read it back while walking the branch's [history](https://fluidframework.com/docs/api/fluid-framework/treebranchhistory-interface), via the new `custom` property on `TreeBranchCommitMetadata`:

```typescript
for (
	let commit = view.branchHistory.getHead();
	commit !== undefined;
	commit = commit.getParent()
) {
	const metadata = commit.custom;
}
```

Because a commit may be produced by nested transactions, each of which may supply metadata, `custom` is the flattened combination of them all. The structural view is available as `commit.customTree`, a `CustomMetadataTree` mirroring the transaction nesting — the same relationship `labels.tree` has to a change's label set.

Notes on behavior:

- The metadata shares the lifetime of the commit it is attached to. Once that commit is trimmed from the trunk, the metadata goes with it — including through any `TreeBranchCommitMetadata` obtained earlier, which then reads `undefined`. Under the default trunk eviction policy that lifetime is the width of the collaboration window; under the `retainHistory` option on `SharedTreeOptions` it is the lifetime of the document.
- The value is `undefined` for commits that were not annotated, and for commits created before an application began writing metadata, so every read path must handle `undefined`.
- When transactions are nested, `custom` combines every level, and where two of them use the same property the outermost wins. Metadata from a nested transaction that is rolled back does not contribute, and leaves no node in `customTree`.
- The value is snapshotted when the transaction starts, so it is unaffected by later mutation of the object passed in, and it is normalized as `JSON.stringify` would (notably `NaN` and the infinities become `null`, matching how SharedTree treats such values elsewhere). A `UsageError` is thrown for a value that cannot be represented as a JSON object at all, such as one containing a cycle.
- If a transaction produces no commit — because its body made no changes, or because it was rolled back — its metadata is discarded without error.
- The metadata travels on every annotated op and occupies space in the summary for as long as its commit survives, so it should be kept small.

A commit produced by reverting a `Revertible` previously could not be annotated, because reverts were not permitted during a transaction at all. That restriction is now relaxed: a revert may be performed inside a transaction provided it is that transaction's only change, which lets the revert be given its own metadata rather than inheriting the reverted commit's. Attempting any other change in such a transaction — before or after the revert, including a second revert — throws a `UsageError`. The resulting commit is still reported as an undo or redo, so it remains redoable.

Persisting the metadata requires new op and summary format versions (`MessageFormatVersion.v7` and `EditManagerFormatVersion.v7`), which are written only when `minVersionForCollab` is set to 3.0.0 or later. Until then, metadata supplied by the application is kept in memory for the local session but is neither replicated nor persisted. This ensures a document only ever contains metadata when every client that can open it understands and preserves it.
