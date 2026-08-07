---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
TreeViewAlpha can now query whether a staged schema upgrade has been applied

A new [`isStagedUpgradeEnabled`](https://fluidframework.com/docs/api/tree/treeviewalpha-interface#isstagedupgradeenabled-methodsignature) method on [`TreeViewAlpha`](https://fluidframework.com/docs/api/tree/treeviewalpha-interface) checks whether a given `SchemaUpgrade` token has already been applied to a document's stored schema.

```typescript
const view = tree.viewWith(
	new TreeViewConfigurationAlpha({
		schema: mySchema,
		stagedUpgradePolicy: featureFlag.isEnabled
			? StagedSchemaUpgradePolicy.enabledStagedUpgrades(myUpgrade)
			: StagedSchemaUpgradePolicy.restrictive,
	}),
);

// Show a "create poll" button only if the document supports the new poll schema
if (view.isStagedUpgradeEnabled(myUpgrade)) {
	showCreatePollButton();
}
```
