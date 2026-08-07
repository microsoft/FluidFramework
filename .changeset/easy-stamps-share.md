---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
Settled change notification

`LocalChangeMetadata` now exposes an `events: Listenable<LocalCommitEvents>` property that fires a `"settled"` event once a commit has been ordered by the sequencing service.

Once a commit is sequenced, the following guarantees hold:
1. The changes carried by the commit have been persisted and other peers are able to see them.
2. There can be no more concurrent changes sequenced before this commit, which means this commit has reached its settled form.

The `"settled"` event provides details about the outcome of applying this settled form.
This can be used by an application to determine whether any constraints associated with the commits were violated.

This event can be used by applications to inform the end user that their changes have been saved (`CommitOutcome.FullyApplied`) or rejected (`CommitOutcome.FullyDropped` and `CommitOutcome.NewContentOnly`).
It can also be used to queue up a new attempt at making the rejected changes. Note however that new edits must be made outside of the event callback.

Example:

```typescript
// Use `asAlpha` API to access the settled event API
const view = asAlpha(tree.viewWith(config));

// Function to clear all contents of the tree, with a precondition that no changes have occurred.
const clearAllContents = () => {
	view.runTransaction(
		() => {
			// Remove all contents at the root
			view.root.removeRange();
		},
		{ preconditions: [{ type: "noChange" }] },
	);
};

// Register the logic for notifying the user of the outcome and allow them to retry
 view.events.on("changed", (metadata) => {
	if (metadata.isLocal) {
		metadata.events.on("settled", (outcome) => {
			if (outcome === CommitOutcome.FullyApplied) {
				alert("Clear operation succeeded.");
			} else {
				const shouldTryAgain = confirm(
					"The contents have changed. Do you still want to clear everything?",
				);
				if (shouldTryAgain) {
					// It is invalid to make edits during the event callback, so we schedule the retry to occur asynchronously.
					setTimeout(clearAllContents);
				} else {
					alert("Clear operation aborted.");
				}
			}
		});
	}
});

// First attempt to clear all contents.
// This will synchronously trigger the changed "event" and register the listener for the settled event.
clearAllContents();
```
