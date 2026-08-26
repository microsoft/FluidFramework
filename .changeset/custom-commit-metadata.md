---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
New alpha API for attaching custom metadata to commits

Applications can now attach arbitrary, JSON-serializable metadata to the commit produced by a transaction, replicate it to collaborating clients, and persist it in the document.

Supply it via the new `customMetadata` field on [`RunTransactionParamsAlpha`](https://fluidframework.com/docs/api/fluid-framework/runtransactionparamsalpha-interface):

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

Because a commit may be produced by nested transactions, each of which may supply metadata, `custom` is the flattened combination of them all, with the outermost transaction winning on conflicting properties.
The structural view is available as `commit.customTree`, a `CustomMetadataTree` mirroring the transaction nesting — the same relationship `labels.tree` has to a change's label set.

Notes on behavior:

- `custom` is `undefined` for commits that were not annotated, so every read path must handle `undefined`.
- The metadata shares the lifetime of the commit it is attached to, so it is dropped when that commit is trimmed from the trunk. Under the `retainHistory` option on `SharedTreeOptions` it is the lifetime of the document.
- The value is snapshotted when the transaction starts, so it is unaffected by later mutation of the object passed in, and it is normalized as `JSON.stringify` would. An error is thrown for a value that cannot be represented as a JSON object at all, such as one containing a cycle.
- If a transaction produces no commit — because its body made no changes, or because it was rolled back — its metadata is discarded.
- The metadata travels on every annotated op and occupies summary space for as long as its commit survives, so it should be kept small.

A commit produced by reverting a `Revertible`, or by `revertTo`, can be annotated in the same way, via a new options argument:

```typescript
revertible.revert({ customMetadata: { author: "alice", intent: "undo-add" } });
```

Persisting the metadata requires new op and summary format versions, which are written only when the container runtime's `oldestSupportedClient` is set to `3.0.0` or later; until then, metadata is kept in memory for the local session but is neither replicated nor persisted.
Raising that floor makes every subsequent op and summary use the new versions, whether or not any commit carries metadata, so deploy 3.0-capable code everywhere first.
Lowering it again is lossy: a client configured to write the older format can still read metadata but strips it when encoding.
