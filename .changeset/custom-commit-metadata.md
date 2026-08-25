---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
New alpha API for attaching custom metadata to commits

Applications can now attach arbitrary, JSON-serializable metadata to the commit produced by a transaction, replicate it to collaborating clients, and persist it in the document.

Supply the metadata via the new `customMetadata` field on [`RunTransactionParamsAlpha`](https://fluidframework.com/docs/api/fluid-framework/runtransactionparamsalpha-interface):

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

- The metadata shares the lifetime of the commit it is attached to. Once that commit is trimmed from the trunk, the metadata goes with it — including through any `TreeBranchCommitMetadata` obtained earlier, which then reads `undefined`. Under the `retainHistory` option on `SharedTreeOptions` it is the lifetime of the document.
- The value is `undefined` for commits that were not annotated, and for commits created before an application began writing metadata, so every read path must handle `undefined`.
- When transactions are nested, `custom` combines every level, and where two of them use the same property the outermost wins. Metadata from a nested transaction that is rolled back does not contribute, and leaves no node in `customTree`.
- The value is snapshotted when the transaction starts, so it is unaffected by later mutation of the object passed in, and it is normalized as `JSON.stringify` would (notably `NaN` and the infinities become `null`, matching how SharedTree treats such values elsewhere). An error is thrown for a value that cannot be represented as a JSON object at all, such as one containing a cycle.
- If a transaction produces no commit — because its body made no changes, or because it was rolled back — its metadata is discarded without error.
- The metadata travels on every annotated op and occupies space in the summary for as long as its commit survives, so it should be kept small.

A commit produced by reverting a `Revertible` previously could not be annotated, because reverts were not permitted during a transaction at all. That restriction is now relaxed: a revert may be performed inside a transaction provided it is that transaction's only change, which lets the revert be given its own metadata rather than inheriting the reverted commit's. Attempting any other change in such a transaction — before or after the revert, including a second revert — throws an error. The resulting commit is still reported as an undo or redo, so it remains redoable.

Persisting the metadata requires new op and summary format versions (`MessageFormatVersion.v7` and `EditManagerFormatVersion.v7`), which are written only when `minVersionForCollab` is set to 3.0.0 or later. Until then, metadata supplied by the application is kept in memory for the local session but is neither replicated nor persisted.

Adopting this therefore requires a staged rollout, and the compatibility floor is effectively a one-way change:

1. **Deploy readers first.** Ship 3.0-capable code to every client, application, summarizer, and offline/reconnect path that can open the same documents, while leaving the compatibility floor below 3.0 so they keep writing the previous format.
2. **Wait for saturation** using version telemetry rather than deployment status, and drain older sessions.
3. **Raise the container runtime's `oldestSupportedClient` to `3.0.0`** consistently across every path that creates or loads the container. Note that raising only `configuredSharedTree`'s `minVersionForCollab` would let SharedTree write v7 without the container making the corresponding declaration.

Points worth understanding before step 3:

- Raising the floor makes **every** subsequent op and summary v7, whether or not any commit carries metadata. The compatibility transition begins immediately, not on first use of the feature.
- A client older than v7 fails cleanly when it reaches v7 data, with an unsupported-version error rather than data corruption. This is a reactive failure: such a client may load an older summary successfully and only fail later.
- Downgrading is lossy. A 3.0 client configured to write the older format can still read metadata but will strip it when encoding, so rolling the floor back erases custom metadata from re-encoded commits. Keep a v7-capable deployment available; rolling every binary back to 2.x after v7 data exists can strand documents.
