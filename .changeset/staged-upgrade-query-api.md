---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
TreeViewAlpha can now query whether a staged schema upgrade has been applied

A new [`isStagedUpgradeEnabled`](https://fluidframework.com/docs/api/tree/treeviewalpha-interface#isstagedupgradeenabled-methodsignature) method on [`TreeViewAlpha`](https://fluidframework.com/docs/api/tree/treeviewalpha-interface) checks whether a given `SchemaUpgrade` token has already been applied to a document's stored schema.

Additionally, [`initialize`](https://fluidframework.com/docs/api/tree/treeviewalpha-interface#initialize-methodsignature) and [`upgradeSchema`](https://fluidframework.com/docs/api/tree/treeviewalpha-interface#upgradeschema-methodsignature) now automatically preserve already-enabled upgrades.
The effective upgrade policy is the union of the configured `stagedUpgradePolicy` and any upgrades already present in the stored schema, preventing accidental regression of previously applied upgrades.

```typescript
const view = tree.viewWith(
	new TreeViewConfigurationAlpha({
		schema: mySchema,
		stagedUpgradePolicy: featureFlag.isEnabled
			? StagedSchemaUpgradePolicy.enabledStagedUpgrades(myUpgrade)
			: StagedSchemaUpgradePolicy.restrictive,
	}),
);

// Check if the upgrade was already applied to this document
if (view.isStagedUpgradeEnabled(myUpgrade)) {
	// ...
}
```
