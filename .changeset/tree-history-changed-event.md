---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Track branch history changes with an alpha event

The alpha `historyChanged` event reports reasons, added and removed entry counts, and history lengths before and after each update.
Applications can refresh their history display when edits, merges, rebases, rewinds, or trimming change the available history.
An update includes nested trimming, even when the total commit count stays unchanged.
Local acknowledgements do not count pending commits twice.
The event describes this client's available history, not confirmation that a summary has persisted it.

```typescript
const alphaView = asAlpha(view);
alphaView.events.on("historyChanged", (update) => {
	for (const change of update.changes) {
		console.log(change.reason, change.addedCount, change.removedCount);
	}
});
```
