---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
New alpha API for attaching persisted metadata to commits

Applications can now attach arbitrary, JSON-serializable metadata to the commit produced by a transaction, replicate it to collaborating clients, and persist it in the document.

Supply the metadata via the new `persistedMetadata` field on `RunTransactionParamsAlpha`:

```typescript
view.runTransaction(
	() => {
		view.root.insertAtEnd("new item");
	},
	{ persistedMetadata: { author: "alice", intent: "add-item" } },
);
```

Read it back while walking the branch's [history](https://fluidframework.com/docs/api/fluid-framework/treebranchhistory-interface), via the new `persistedMetadata` property on `TreeBranchCommitMetadata`:

```typescript
for (
	let commit = view.branchHistory.getHead();
	commit !== undefined;
	commit = commit.getParent()
) {
	const metadata = commit.persistedMetadata;
}
```

Notes on behavior:

- The metadata shares the lifetime of the commit it is attached to. Once that commit is trimmed from the trunk, the metadata goes with it. Under the default trunk eviction policy that is the width of the collaboration window; under the `retainHistory` option on `SharedTreeOptions` it is the lifetime of the document.
- The value is `undefined` for commits that were not annotated, and for commits created before an application began writing metadata, so every read path must handle `undefined`.
- If a transaction produces no commit — because its body made no changes, or because it was rolled back — its metadata is discarded without error.
- When transactions are nested, only the outermost transaction's metadata is used, mirroring how `label` behaves.
- The metadata travels on every annotated op and occupies space in the summary for as long as its commit survives, so it should be kept small.

Persisting the metadata requires new op and summary format versions (`MessageFormatVersion.v7` and `EditManagerFormatVersion.v7`), which are written only when `minVersionForCollab` is set to 3.0.0 or later. Until then, metadata supplied by the application is kept in memory for the local session but is neither replicated nor persisted. This ensures a document only ever contains metadata when every client that can open it understands and preserves it.
