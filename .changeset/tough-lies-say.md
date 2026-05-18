---
"@fluidframework/tree": minor
"__section": tree
---
Starting a transaction inside a tree-change event listener now produces a usage error

Calling `runTransaction` or `runTransactionAsync` from inside a `nodeChanged` or `treeChanged` event listener now throws a `UsageError`.
This brings transactions into line with the existing rule that tree mutations from inside a change-event listener are forbidden.

Before this change, starting a transaction from a listener would push a transaction frame onto the running outer transaction's bookkeeping before the inner edit was attempted,
leaving the tree's transaction labels in a corrupted state even when the inner edit itself threw.
The new check rejects the call before any state mutation, so the tree's transaction labels remain consistent.

The error message follows the existing format used by the other listener-time guards:

```
Running a transaction is forbidden during a nodeChanged or treeChanged event
```

After this error is thrown, the affected tree view enters a broken state and subsequent operations on it will throw an `Invalid use of ... after it was put into an invalid state` error.
Discard the view and acquire a fresh one to recover.

#### Migration

If you start a transaction in response to a tree change, defer it out of the listener:

```typescript
// Before — throws at runtime
Tree.on(view.root, "nodeChanged", () => {
	view.runTransaction(() => {
		// ...
	});
});

// After — schedule the transaction outside the listener
Tree.on(view.root, "nodeChanged", () => {
	queueMicrotask(() => {
		view.runTransaction(() => {
			// ...
		});
	});
});
```
