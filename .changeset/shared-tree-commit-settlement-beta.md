---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
SharedTree commit settlement events are available in beta and legacy

You can now observe whether a local SharedTree commit is applied or dropped after the sequencing service orders it without using alpha APIs.
`CommitOutcome` and `LocalCommitEvents` are available from the `/beta` and `/legacy` entry points of `@fluidframework/tree` and `fluid-framework`.
The `changed` event is available on `TreeViewBeta` and `UntypedTreeView`, with `ChangeMetadataBeta` and `TreeBranchEventsBeta` describing its beta API.

```typescript
import { asBeta, CommitOutcome } from "fluid-framework/beta";

// ...
const betaView = asBeta(view);
const unsubscribe = betaView.events.on("changed", (metadata) => {
	if (metadata.isLocal) {
		metadata.events.on("settled", (outcome) => {
			if (outcome === CommitOutcome.FullyApplied) {
				console.log("Changes saved.");
			} else {
				console.log("Changes rejected.");
			}
		});
	}
});
```

Register the `changed` listener before making the edit or running the transaction.
Do not edit the tree synchronously from a settlement callback; schedule any retry asynchronously.
