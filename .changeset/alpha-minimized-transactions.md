---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
Transaction minimization support

`minimize` post-processor is now available for pre-production (`@alpha`) usage.

`minimize` post-processor scrubs changes made within a transaction to the minimal changes required to represent the same document observable result without minimization.
Use is recommended in any situation where sensitive information might otherwise be exposed by "hidden" changes.
Such as accidentally pasting a password while editing text and then deleting it.
With those sets of edits run under a minimized transaction the password text would be expunged at the conclusion of the transaction and never written to document history.

Example use:
```typescript
import { minimize } from "@fluidframework/tree/alpha";

async function minimizeEdits(branch: TreeBranchAlpha)
{
	await branch.runTransactionAsync(
		async () => { ...make edits... },
		{ postProcessor: minimize },
	);
}
```
