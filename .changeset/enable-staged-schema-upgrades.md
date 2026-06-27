---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Enable select staged schema upgrades at runtime via view configuration

SharedTree now supports enabling selected staged schema upgrades when initializing a document or upgrading its stored schema.
This lets applications deploy code that understands a schema change before enabling that change in documents,
making it easier to separate code rollout from feature rollout.

### API

Select the schema upgrades to enable during view creation by passing an `enabledUpgrades` list in the config object used with [`ITreeAlpha.viewWith`](https://fluidframework.com/docs/api/tree/viewabletree-interface#viewwith-methodsignature).

The `enabledUpgrades` list contains `SchemaUpgrade` objects obtained from schema factory APIs such as [`SchemaFactoryBeta.staged`](https://fluidframework.com/docs/api/tree/schemastaticsbeta-interface#staged-propertysignature) or [`SchemaFactoryAlpha.stagedOptional`](https://fluidframework.com/docs/api/tree/schemafactoryalpha-class#stagedoptional-property):

```typescript
const stagedType = SchemaFactoryBeta.staged(NewNodeSchema);
const schemaUpgrade = stagedType.metadata.stagedSchemaUpgrade;
assert(schemaUpgrade !== undefined);

const enabledUpgrades = [schemaUpgrade];

const alphaTree = asAlpha(tree);
const view = alphaTree.viewWith(
	new TreeViewConfigurationAlpha({
		schema: AppSchema,
		enabledUpgrades,
	}),
);
```

When configured `enabledUpgrades` is omitted or empty, staged schema upgrades remain disabled.
The document's stored schema continues to allow only the schema that has already been enabled, so clients can understand the staged schema in code but cannot write data that depends on it yet.

Advanced callers can also provide `storedSchemaGenerationOptions` directly in `TreeViewConfigurationAlpha` to control staged inclusion with custom policy functions.
`enabledUpgrades` and `storedSchemaGenerationOptions` are mutually exclusive and cannot both be provided.

For example, advanced applications can provide custom policy functions to decide which staged upgrades to include based on their own criteria:

```typescript
const stagedType = SchemaFactoryBeta.staged(NewNodeSchema);
const schemaUpgrade = stagedType.metadata.stagedSchemaUpgrade;
assert(schemaUpgrade !== undefined);

const enabledFeatures = new Set<SchemaUpgrade>([schemaUpgrade]);

const view = tree.viewWith(
	new TreeViewConfigurationAlpha({
		schema: AppSchema,
		storedSchemaGenerationOptions: {
			includeStaged: (upgrade) => enabledFeatures.has(upgrade),
			includeStagedOptional: (upgrade) => enabledFeatures.has(upgrade),
		},
	}),
);
```

This approach is useful for scenarios such as:
- Fine-grained rollout control based on feature sets rather than individual feature flags
- A/B testing different schema configurations
- Integration test suites that want to exercise specific schema states

#### Pre-built Policy Options

For convenience, two pre-built policy options are provided:

**Restrictive** (default behavior):

```typescript
import {
	restrictiveStoredSchemaGenerationOptions,
	TreeViewConfigurationAlpha,
} from "@fluidframework/tree";

const view = tree.viewWith(
	new TreeViewConfigurationAlpha({
		schema: AppSchema,
		storedSchemaGenerationOptions: restrictiveStoredSchemaGenerationOptions,
	}),
);
```

The restrictive option excludes all staged schema upgrades, producing the most conservative stored schema.

**Permissive** (for testing):

```typescript
import {
	permissiveStoredSchemaGenerationOptions,
	TreeViewConfigurationAlpha,
} from "@fluidframework/tree";

// Test scenario: upgrade documents with all staged features enabled
const testView = tree.viewWith(
	new TreeViewConfigurationAlpha({
		schema: AppSchemaWithAllStagedFeatures,
		storedSchemaGenerationOptions: permissiveStoredSchemaGenerationOptions,
	}),
);

testView.upgradeSchema();

// Now verify that the application handles the upgraded schema correctly
validateAllFeatures(testView.root);
```

The permissive option includes all staged schema upgrades, allowing applications to test future document shapes.
It is useful in test and validation scenarios where you want to create or upgrade documents with all possible staged features enabled, verifying that the application handles these future schemas correctly.

### Production

For production rollout, applications can use feature flags to control when staged schema upgrades are enabled.
Previously, enabling the staged schema in stored schema required a code change that removed the staged schema wrapper from the schema definition.
With this API, applications can keep the staged schema in code and use construction-time view configuration to decide at runtime which documents should enable it.
For example, an application that is adding checklist items to a task document can deploy clients that understand the new checklist schema first, then enable the stored-schema upgrade only for documents where the feature flag is enabled:

```typescript
const sf = new SchemaFactoryBeta("example-app");

class ChecklistItem extends sf.object("ChecklistItem", {
	text: sf.string,
}) {}

const stagedChecklistItem = SchemaFactoryBeta.staged(ChecklistItem);
const checklistItemSchemaUpgrade = stagedChecklistItem.metadata.stagedSchemaUpgrade;
assert(checklistItemSchemaUpgrade !== undefined);

class AppSchema extends sf.object("AppSchema", {
	// `taskItem` is an existing property that already allowed plain text.
	// The staged type is added to this same property and enabled at rollout time.
	taskItem: sf.optional([sf.string, stagedChecklistItem]),
}) {}

const enableChecklistItems = featureFlags.enableChecklistItems;

const enabledUpgrades = enableChecklistItems
	? [checklistItemSchemaUpgrade]
	: undefined;

const alphaTree = asAlpha(tree);
const view = alphaTree.viewWith(
	new TreeViewConfigurationAlpha({
		schema: AppSchema,
		enabledUpgrades,
	}),
);

if (view.compatibility.canInitialize) {
	// New documents include the checklist schema only while the rollout is enabled.
	view.initialize(initialContent);
} else {
	if (view.compatibility.canUpgrade) {
		view.upgradeSchema();
	}
}
```

Once a staged schema upgrade has been enabled in a document's stored schema, that change is permanent for that document.
If `upgradeSchema` is later called from a view configured without a previously enabled upgrade token (including when a client loads an already-upgraded document without configuring that token), the call throws a `UsageError`.
The stored schema already contains the upgraded members and the new target would narrow it, which is not permitted.

In practice this means that when a staged schema upgrade is enabled via a feature flag, subsequent `upgradeSchema` calls must use views configured with that token for as long as any document may have already been upgraded.
Once all documents have been upgraded, the staged schema wrapper can be removed entirely, at which point the token is no longer needed.

This also means partial rollback is currently difficult in practice: callers usually cannot target only documents that have not already been upgraded, so disabling the flag after some upgrades have happened can still lead to `UsageError` if `upgradeSchema` is called from views configured without previously enabled tokens.

### Testing

The same API also makes staged schema upgrades easier to test before production rollout.
Tests and validation tools can create or upgrade documents with a specific set of staged upgrades enabled in view construction options, then verify that older and newer application versions behave correctly with the resulting stored schema.
This gives applications a direct way to exercise future document shapes without permanently enabling those upgrades for all new documents.

For example, a compatibility test can start with an existing document, verify that the staged shape is not writable yet, then explicitly enable the staged schema upgrade and validate the upgraded document shape:

```typescript
const currentView = currentAppTree.viewWith(
	new TreeViewConfiguration({ schema: CurrentAppSchema }),
);
currentView.initialize(existingTaskDocument);
await ensureSynchronized();

const nextView = asAlpha(nextAppTree).viewWith(
	new TreeViewConfigurationAlpha({
		schema: AppSchemaWithStagedChecklist,
		enabledUpgrades: [checklistItemSchemaUpgrade],
	}),
);

// The next app version can read the document, but the checklist shape is still
// disabled in stored schema and cannot be written yet.
assert.throws(() => addChecklistItem(nextView.root, { text: "Review rollout" }));

nextView.upgradeSchema();
await ensureSynchronized();

// Older clients that do not understand the upgraded stored schema are now
// incompatible, while the next app version can use the staged shape.
assert.equal(currentView.compatibility.canView, false);
addChecklistItem(nextView.root, { text: "Review rollout" });
await validateChecklistScenario(nextView);
```
