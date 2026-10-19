---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Keep read connections until the first edit when upgrading schema

The alpha `TreeViewAlpha.upgradeSchemaOnNextEdit()` API upgrades the local view without immediately submitting a schema operation.
The view continues to receive remote edits.
The upgrade is submitted when the view makes its next edit, so opening an older document does not by itself require a write connection.
This does not change read-only permissions.

```typescript
const view = tree.viewWith(new TreeViewConfiguration({ schema: AppSchema }));
const alphaView = asAlpha(view);
if (alphaView.compatibility.canUpgrade) {
	alphaView.upgradeSchemaOnNextEdit();
}
```

Disposing the view before its next edit discards the pending upgrade.
An aborted transaction does not submit it.
The existing `upgradeSchema()` API continues to submit upgrades immediately.
