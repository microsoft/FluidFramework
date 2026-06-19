---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Enable staged schema upgrades at runtime

SharedTree now supports enabling selected staged schema upgrades when initializing a document or upgrading its stored schema.
This lets applications deploy code that understands a schema change before enabling that change in documents,
making it easier to separate code rollout from feature rollout.

### API

Pass an application-owned `upgrades` property bag to the alpha [`TreeViewAlpha.initialize`](https://fluidframework.com/docs/api/tree/treeviewalpha-interface#initialize-methodsignature) or [`TreeViewAlpha.upgradeSchema`](https://fluidframework.com/docs/api/tree/treeviewalpha-interface#upgradeschema-methodsignature) APIs to include the corresponding staged schema upgrades in the generated stored schema.
The property names are chosen by the application, which makes them convenient to wire to feature flags or other rollout controls.

The `upgrades` property bag is a regular object whose keys are application-defined names and whose values are `SchemaUpgrade` objects obtained from schema factory APIs such as [`SchemaFactoryBeta.staged`](https://fluidframework.com/docs/api/tree/schemastaticsbeta-interface#staged-propertysignature) or [`SchemaFactoryAlpha.stagedOptional`](https://fluidframework.com/docs/api/tree/schemafactoryalpha-class#stagedoptional-property):

```typescript
const stagedType = SchemaFactoryBeta.staged(NewNodeSchema);
const schemaUpgrade = stagedType.metadata.stagedSchemaUpgrade;
assert(schemaUpgrade !== undefined);

const upgrades = {
	// This name is chosen by the application. It maps to the SchemaUpgrade
	// obtained from the staged schema factory API above.
	upgradeName: schemaUpgrade,
};
```

When `upgrades` is omitted or empty, staged schema upgrades remain disabled.
The document's stored schema continues to allow only the schema that has already been enabled, so clients can understand the staged schema in code but cannot write data that depends on it yet.

### Production

For production rollout, applications can use feature flags to control when staged schema upgrades are enabled.
Previously, enabling the staged schema in stored schema required a code change that removed the staged schema wrapper from the schema definition.
With this API, applications can keep the staged schema in code and use the `upgrades` property bag to decide at runtime which documents should enable it.
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

const upgrades = enableChecklistItems
	? {
			// The property name is application-owned, so it can match the feature flag.
			enableChecklistItems: checklistItemSchemaUpgrade,
		}
	: undefined;

const view = asAlpha(tree.viewWith(new TreeViewConfiguration({ schema: AppSchema })));

if (view.compatibility.canInitialize) {
	// New documents include the checklist schema only while the rollout is enabled.
	view.initialize(initialContent, upgrades);
} else if (view.compatibility.canUpgrade) {
	// Existing documents opt into the checklist schema when the rollout is enabled.
	view.upgradeSchema(upgrades);
}
```

### Testing

The same API also makes staged schema upgrades easier to test before production rollout.
Tests and validation tools can create or upgrade documents with a specific set of staged upgrades enabled, then verify that older and newer application versions behave correctly with the resulting stored schema.
This gives applications a direct way to exercise future document shapes without permanently enabling those upgrades for all new documents.

For example, a compatibility test can start with an existing document, verify that the staged shape is not writable yet, then explicitly enable the staged schema upgrade and validate the upgraded document shape:

```typescript
const currentView = currentAppTree.viewWith(
	new TreeViewConfiguration({ schema: CurrentAppSchema }),
);
currentView.initialize(existingTaskDocument);
await ensureSynchronized();

const nextView = asAlpha(
	nextAppTree.viewWith(new TreeViewConfiguration({ schema: AppSchemaWithStagedChecklist })),
);

// The next app version can read the document, but the checklist shape is still
// disabled in stored schema and cannot be written yet.
assert.throws(() => addChecklistItem(nextView.root, { text: "Review rollout" }));

// Tests opt in directly instead of depending on a production feature flag, then
// verify the document behaves the same way it will after the production rollout.
nextView.upgradeSchema({
	enableChecklistItems: checklistItemSchemaUpgrade,
});
await ensureSynchronized();

// Older clients that do not understand the upgraded stored schema are now
// incompatible, while the next app version can use the staged shape.
assert.equal(currentView.compatibility.canView, false);
addChecklistItem(nextView.root, { text: "Review rollout" });
await validateChecklistScenario(nextView);
```
