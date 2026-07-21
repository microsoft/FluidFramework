---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Enable select staged schema upgrades at runtime via view configuration

SharedTree now supports enabling selected staged schema upgrades when initializing or upgrading a document's stored schema.
This lets applications deploy code that understands a schema change before enabling that change in documents.
It separates code rollout from feature rollout.

#### API

Pass `stagedUpgradePolicy` in the configuration object to
[`ITreeAlpha.viewWith`](https://fluidframework.com/docs/api/tree/viewabletree-interface#viewwith-methodsignature)
to select which schema upgrades to enable at runtime.

Use `StagedSchemaUpgradePolicy.enabledStagedUpgrades(...)` with `SchemaUpgrade` objects from
[`SchemaFactoryBeta.staged`](https://fluidframework.com/docs/api/tree/schemastaticsbeta-interface#staged-propertysignature)
or [`SchemaFactoryAlpha.stagedOptional`](https://fluidframework.com/docs/api/tree/schemafactoryalpha-class#stagedoptional-property):

The following example defines a staged type, extracts its `SchemaUpgrade` token, and passes it to the view configuration so the staged type is enabled when the schema is upgraded:

```typescript
const sf = new SchemaFactoryBeta("my-app");

class ChecklistItem extends sf.object("ChecklistItem", { text: sf.string }) {}

// `staged` wraps the type so it can be enabled at runtime.
const stagedChecklist = SchemaFactoryBeta.staged(ChecklistItem);
// The SchemaUpgrade token identifies this staged type.
const checklistUpgrade = stagedChecklist.metadata.stagedSchemaUpgrade;

class AppSchema extends sf.object("AppSchema", {
	items: sf.array([sf.string, stagedChecklist]),
}) {}

const view = tree.viewWith(
	new TreeViewConfigurationAlpha({
		schema: AppSchema,
		stagedUpgradePolicy:
			StagedSchemaUpgradePolicy.enabledStagedUpgrades(checklistUpgrade),
	}),
);
```

When `stagedUpgradePolicy` is omitted or `undefined`, the default is
`StagedSchemaUpgradePolicy.restrictive`.
This excludes all staged schema upgrades, producing the most conservative stored schema.

Advanced callers can provide a custom `StagedSchemaUpgradePolicy` object:

```typescript
const enabledFeatures = new Set<SchemaUpgrade>([checklistUpgrade]);

const view = tree.viewWith(
	new TreeViewConfigurationAlpha({
		schema: AppSchema,
		stagedUpgradePolicy: {
			includeStaged: (upgrade) => enabledFeatures.has(upgrade),
			includeStagedOptional: (upgrade) => enabledFeatures.has(upgrade),
		},
	}),
);
```

This is useful for fine-grained rollout control or integration tests.

#### Pre-built Policies

The `StagedSchemaUpgradePolicy` namespace provides convenient pre-built policies:

- **`restrictive`** (default): excludes all staged upgrades.
- **`permissive`**: includes all staged upgrades. Useful in tests.
- **`enabledStagedUpgrades(...)`**: includes only the specified upgrades.

#### Production

Applications can use feature flags to control when staged schema upgrades are enabled.
Previously, enabling a staged schema required a code change that removed the staged wrapper.
With this API, the staged wrapper stays in code while `stagedUpgradePolicy` decides at runtime which documents enable it.

For example, an application adding checklist items can deploy clients that understand the new schema first,
then enable the stored-schema upgrade only where a feature flag is active:

```typescript
const sf = new SchemaFactoryBeta("example-app");

class ChecklistItem extends sf.object("ChecklistItem", {
	text: sf.string,
}) {}

const stagedChecklistItem = SchemaFactoryBeta.staged(ChecklistItem);
const checklistItemSchemaUpgrade = stagedChecklistItem.metadata.stagedSchemaUpgrade;

class AppSchema extends sf.object("AppSchema", {
	// `taskItem` allows plain text today; the staged type is added for future rollout.
	taskItem: sf.optional([sf.string, stagedChecklistItem]),
}) {}

const enableChecklistItems = featureFlags.enableChecklistItems;

const view = tree.viewWith(
	new TreeViewConfigurationAlpha({
		schema: AppSchema,
		stagedUpgradePolicy: enableChecklistItems
			? StagedSchemaUpgradePolicy.enabledStagedUpgrades(
					checklistItemSchemaUpgrade,
				)
			: undefined,
	}),
);

if (view.compatibility.canInitialize) {
	// New documents include the checklist schema only while the rollout is enabled.
	view.initialize(initialContent);
} else if (view.compatibility.canUpgrade) {
	// Writes the staged type into the stored schema for this document.
	view.upgradeSchema();
}
```

Once a staged schema upgrade has been written to a document's stored schema, that change is permanent.
If `upgradeSchema` is later called from a view that does not include the previously enabled token,
it throws a `UsageError` because the new target would narrow the stored schema.

In practice, keep the upgrade token configured for as long as any document may have been upgraded.
Once the staged wrapper is removed from the code, the token is no longer needed.

#### Testing

Tests can verify that the current application version handles documents with staged types enabled.
Without such testing, it is hard to confirm that staging prepared the application—not just the schema—for the new types.

```typescript
const currentView = currentAppTree.viewWith(
	new TreeViewConfiguration({ schema: CurrentAppSchema }),
);
currentView.initialize(existingTaskDocument);
await ensureSynchronized();

const nextView = asAlpha(nextAppTree).viewWith(
	new TreeViewConfigurationAlpha({
		schema: AppSchemaWithStagedChecklist,
		stagedUpgradePolicy:
			StagedSchemaUpgradePolicy.enabledStagedUpgrades(
				checklistItemSchemaUpgrade,
			),
	}),
);

// The next version can read the document, but the checklist shape is not yet
// in stored schema and cannot be written.
assert.throws(() => addChecklistItem(nextView.root, { text: "Review rollout" }));

nextView.upgradeSchema();
await ensureSynchronized();

// Older clients are now incompatible; the next version can use the staged shape.
assert.equal(currentView.compatibility.canView, false);
addChecklistItem(nextView.root, { text: "Review rollout" });
await validateChecklistScenario(nextView);
```
