---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Read commit metadata directly from change events

The alpha `changed` event now includes a `commits` array containing the history metadata for each newly applied commit, in application order.
This works for both local and remote changes without walking the branch history.
Each entry includes the commit's revision, flattened `custom` metadata, and nested `customTree` metadata.
Commits already present on the branch are excluded, including commits rebased or deduplicated while applying remote changes.

```typescript
const view = asAlpha(tree.viewWith(config));
view.events.on("changed", ({ commits }) => {
	for (const commit of commits) {
		console.log(commit.revision, commit.custom, commit.customTree);
	}
});
```
