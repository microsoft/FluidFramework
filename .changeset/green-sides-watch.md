---
"@fluidframework/tree": minor
"__section": tree
---
Added `TreeAlpha.context(node)` to provide context-aware APIs for any SharedTree node, plus a new `TreeContextAlpha` surface for transactions and branch checks.

This release introduces a node-scoped context that works for nodes inserted into the tree as well as new nodes that are not yet inserted.
The new `TreeContextAlpha` interface exposes `runTransaction` / `runTransactionAsync` and an `isBranch()` type guard.
`TreeBranchAlpha` now extends `TreeContextAlpha`, so you can keep using branch APIs when available.

### Migration
If you previously used `TreeAlpha.branch(node)` to discover a branch, switch to `TreeAlpha.context(node)` and check `isBranch()`:

```ts
import { TreeAlpha } from "@fluidframework/tree/alpha";

const context = TreeAlpha.context(node);
if (context.isBranch()) {
	// Same branch APIs as before
	context.fork();
}
```

`TreeAlpha.branch(node)` is now deprecated.
Prefer the context API above.

### New transaction entry point
You can now run transactions from a node context, regardless of whether the node is hydrated:

```ts
const context = TreeAlpha.context(node);

// No return value
const result = context.runTransaction(() => {
	node.count += 1;
});

// Return a value by wrapping it in `{ value }`
const resultWithValue = context.runTransaction(() => ({ value: node.count }));
```

For asynchronous work:

```ts
const result = await context.runTransactionAsync(async () => {
	await doWork();
	return { value: node.count };
});
```
