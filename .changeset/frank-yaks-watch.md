---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Preserve enabled staged schema upgrades by default

[`TreeView.upgradeSchema()`](https://fluidframework.com/docs/api/tree/treeview-interface#upgradeschema-method) now includes staged schema upgrades that are already enabled in the document, even when the view's staged upgrade policy does not select them.
This prevents a schema upgrade from accidentally attempting to narrow stored schema enabled by another client.

Set [`includeAlreadyEnabledUpgrades`](https://fluidframework.com/docs/api/tree/stagedschemaupgradepolicy-interface#includealreadyenabledupgrades-property) to `false` when creating the staged upgrade policy to require upgrades to be selected explicitly:

```typescript
const config = new TreeViewConfigurationAlpha({
	schema: AppSchema,
	stagedUpgradePolicy: {
		includeAlreadyEnabledUpgrades: false,
		...StagedSchemaUpgradePolicy.enabledStagedUpgrades(myUpgrade),
	},
});
```
