---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Independent trees can limit their undo history

The new alpha option `maxRevertibles` of [`createIndependentTreeAlpha`](https://fluidframework.com/docs/api/fluid-framework#createindependenttreealpha-function) and [`createIndependentTreeViewAlpha`](https://fluidframework.com/docs/api/fluid-framework#createindependenttreeviewalpha-function) limits how many revertibles for the tree's commits are valid at once.
When a revertible is obtained beyond the limit, the oldest valid one is disposed; reverting it afterwards throws a `UsageError`.
Reverting a revertible does not count toward the limit, so undo and redo never dispose other revertibles.

With the option set, the tree also keeps only the history that its valid revertibles need, as a `SharedTree` does with `retainHistory`.
Without it, an independent tree keeps every commit since it was created, along with the content each commit removed.
An application that loads a document in many steps and only takes revertibles for user edits keeps the commits of the loading steps for as long as the tree exists.
`Number.POSITIVE_INFINITY` discards the history no revertible needs without limiting the number of revertibles.

```typescript
const tree = createIndependentTreeAlpha({ maxRevertibles: 20 });
const view = tree.viewWith(config);
view.events.on("changed", (metadata, getRevertible) => {
	// Commits without a revertible (here, loading steps) do not hold history back.
	if (getRevertible !== undefined && !metadata.labels.has("load")) {
		undoStack.push(getRevertible());
	}
});
```

In a document of 200 sections, each loaded by its own commit and then edited once, the 10th, 50th and 200th consecutive undo take 7, 14 and 61 ms without a bound, since each undo is rebased over every later commit.
With `maxRevertibles: 20`, no undo takes more than 14 ms, and the heap retained after the edits falls from 53.7 to 37.6 MB.
