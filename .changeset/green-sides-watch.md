---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Added new TreeAlpha.context(node) API

This release introduces a node-scoped context that works for both hydrated and [unhydrated](https://fluidframework.com/docs/api/fluid-framework/unhydrated-typealias) [TreeNodes](https://fluidframework.com/docs/api/fluid-framework/treenode-class).
The new `TreeContextAlpha` interface exposes `runTransaction` / `runTransactionAsync` methods and an `isBranch()` type guard.
`TreeBranchAlpha` now extends `TreeContextAlpha`, so you can keep using branch APIs when available.

#### Migration

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

#### New transaction entry point

You can now run transactions from a node context, regardless of whether the node is hydrated:

```ts
// A synchronous transaction without a return value
const context = TreeAlpha.context(node);
context.runTransaction(() => {
	node.count += 1;
});
```

```ts
// An asynchronous transaction with a return value
const context = TreeAlpha.context(node);
const result = await context.runTransactionAsync(async () => {
	await doWork(node);
	return { value: node.foo };
});
```
