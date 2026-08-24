---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Persisted commit metadata

Applications can now attach an arbitrary JSON-serializable value to the commit produced by a transaction. The value is replicated to all collaborating clients and persisted in the document alongside the commit, and can be read back by revision.

```typescript
view.runTransaction(
	() => {
		view.root.insertAtEnd("B");
	},
	{ persistedMetadata: { author: "alice", reason: "checkpoint" } },
);

view.events.on("changed", (data) => {
	if (data.isLocal) {
		const metadata = view.getPersistedCommitMetadata(data.revision);
	}
});
```

The metadata shares the lifetime of the commit it is attached to: once that commit is trimmed from the trunk, its metadata goes with it. Reads therefore return `undefined` for commits that were never annotated, that predate this feature, or whose metadata has been evicted.

Metadata is only written to the document when `minVersionForCollab` is at least `3.0.0`, which introduces new op and summary format versions. With an older configured value the metadata stays in memory on the client that created it and is not persisted or replicated, so a document can never contain metadata that a collaborating client would fail to preserve.

Because the metadata travels on every annotated op and occupies space in the summary for as long as its commit survives, it should be kept small.

`LocalChangeMetadata` (provided by the `changed` event) now also exposes the `revision` of the commit the change produced, which is what correlates a change with its persisted metadata.
