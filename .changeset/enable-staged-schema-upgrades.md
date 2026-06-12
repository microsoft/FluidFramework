---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---

Enable staged schema upgrades at runtime

SharedTree now supports enabling selected staged schema upgrades when initializing a document or upgrading its stored schema.
This lets applications deploy code that understands a schema change before enabling that change in documents, making it easier to separate code rollout from feature rollout.

Pass an application-owned `upgrades` property bag to `TreeView.initialize` or `TreeView.upgradeSchema` to include the corresponding staged schema upgrades in the generated stored schema.
The property names are chosen by the application, which makes them convenient to wire to feature flags or other rollout controls.

The same API also makes staged schema upgrades easier to test before production rollout.
Tests and validation tools can create or upgrade documents with a specific set of staged upgrades enabled, then verify that older and newer application versions behave correctly against the resulting stored schema.
This gives applications a direct way to exercise future document shapes without permanently enabling those upgrades for all new documents.

```typescript
const enableFooUpgrade = featureFlags.enableFooUpgrade;
const upgrades = enableFooUpgrade ? { enableFooUpgrade: fooSchemaUpgrade } : undefined;

const view = tree.viewWith(new TreeViewConfiguration({ schema: AppSchema }));

if (view.compatibility.canInitialize) {
	view.initialize(initialContent, upgrades);
} else if (view.compatibility.canUpgrade) {
	view.upgradeSchema(upgrades);
}
```

When `upgrades` is omitted or empty, staged schema upgrades remain disabled and SharedTree preserves its existing restrictive stored-schema behavior.
This means applications can turn the rollout control off for new documents while documents that were already upgraded continue to use their stored schema.

For example, if `fooSchemaUpgrade` enables a staged type, callers can opt documents into that type only while the rollout flag is enabled:

```typescript
const upgrades = enableFooUpgrade ? { enableFooUpgrade: fooSchemaUpgrade } : undefined;

view.upgradeSchema(upgrades);

// Once the schema op is sequenced, this document's stored schema includes the
// staged upgrade and clients with compatible code can use the upgraded shape.
```
