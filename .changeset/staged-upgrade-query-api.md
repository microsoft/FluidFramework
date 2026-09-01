---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
TreeViewAlpha can now query whether a staged schema upgrade has been applied

A new [`isStagedUpgradeEnabled`](https://fluidframework.com/docs/api/tree/treeviewalpha-interface#isstagedupgradeenabled-methodsignature) method on [`TreeViewAlpha`](https://fluidframework.com/docs/api/tree/treeviewalpha-interface) checks whether a given [`SchemaUpgrade`](https://fluidframework.com/docs/api/tree/schemaupgrade-typealias) token has already been applied to a document's stored schema.

This is useful when gradually rolling out a staged schema upgrade via feature flags — for example, to conditionally include the upgrade token in the view configuration after a flag rollback, or to show UI that depends on the upgraded schema.

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
