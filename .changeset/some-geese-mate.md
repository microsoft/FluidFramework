---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Add IndependentTree API

New `IndependentTreeAlpha` and `IndependentTreeBeta` APIs provide similar utility to the existing alpha [`IndependentView`](https://fluidframework.com/docs/api/tree#independentview-function) API, except providing access to the [`ViewableTree`](https://fluidframework.com/docs/api/fluid-framework/viewabletree-interface).

This allows for multiple views (in sequence, not concurrently) to be created to test things like schema upgrades and incompatible view schema much more easily (see example below).
For `IndependentTreeAlpha`, this also provides access to `exportVerbose` and `exportSimpleSchema` from [`ITreeAlpha`](https://fluidframework.com/docs/api/tree/itreealpha-interface).

An example of how to use `createIndependentTreeBeta` to create multiple views to test a schema upgrade:
```typescript
const tree = createIndependentTreeBeta();

const stagedConfig = new TreeViewConfiguration({
	schema: SchemaFactoryAlpha.types([
		SchemaFactory.number,
		SchemaFactoryAlpha.staged(SchemaFactory.string),
	]),
});
const afterConfig = new TreeViewConfigurationAlpha({
	schema: [SchemaFactory.number, SchemaFactory.string],
});

// Initialize tree
{
	const view = tree.viewWith(stagedConfig);
	view.initialize(1);
	view.dispose();
}

// Do schema upgrade
{
	const view = tree.viewWith(afterConfig);
	view.upgradeSchema();
	view.root = "A";
	view.dispose();
}

// Can still view tree with staged schema
{
	const view = tree.viewWith(stagedConfig);
	assert.equal(view.root, "A");
	view.dispose();
}
```
