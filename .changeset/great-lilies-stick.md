---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Fix assert when inserting the same node multiple times

When inserting the same node multiple times in a single array insertion, a `UsageError` is now thrown instead of an assert `0xa2b`.

For example, this now throws a `UsageError` with message `A "ArrayNodeTest.Item" node was provided more than once in a single insertion. A node may not be in more than one place in the tree.`:

```TypeScript
array.insertAtEnd(item, item);
```
