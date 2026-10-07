---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
SharedTree commit settlement events and no-change constraints are available in beta and legacy

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

You can also use `NoChangeConstraint` through the beta transaction APIs to require that the document has not changed before a transaction is applied.
`TransactionConstraintBeta` includes this constraint, which you can supply in `RunTransactionParamsBeta.preconditions`.
These APIs are available through both `/beta` and `/legacy`.

```typescript
betaView.runTransaction(
	() => {
		// Make edits.
	},
	{ preconditions: [{ type: "noChange" }] },
);
```

You can separately constrain a later revert by returning `preconditionsOnRevert: [{ type: "noChange" }]` from the transaction callback.
This option is available on `TransactionCallbackStatusBeta` and requires that the document has not changed since the transaction before applying its revert.
