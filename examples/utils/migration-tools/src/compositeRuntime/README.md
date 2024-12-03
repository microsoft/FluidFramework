## The composite runtime pattern

Fluid containers provide an `entryPoint`, which is how apps access the contents of the container.  This `entryPoint` is specified by the author of the "container code", also known as the "container runtime factory" or `IRuntimeFactory`.

Traditionally the container code author creates a single root datastore, and accessing the container `entryPoint` simply returns that datastore.  However, the `entryPoint` can actually be any arbitrary object (it is typed as a `FluidObject`).

The composite runtime pattern explores returning an object that is composed of multiple members, each independent from one another.  This facilitates mixin patterns, such as adding a data migration tool to a container without impacting the root datastore.

This package provides a `CompositeEntryPoint`, which collects entry point "pieces" that are defined by the container code author (`IEntryPointPiece`).  `CompositeEntryPoint` can subsequently be used with `loadCompositeRuntime()` in place of `ContainerRuntime.loadRuntime()` to produce a runtime with the desired `entryPoint`.

Each `IEntryPointPiece` consists of:

* `name`: The name that the entry point piece will be given in the resulting composite entryPoint.
* `registryEntries`: The registry entries that should be added to the container runtime.
* `onCreate`: Actions to be taken upon container creation, e.g. creating and aliasing a datastore.
* `onLoad`: Actions to be taken upon every container load.
* `createPiece`: A function to produce the entry point piece object that the app developer will access.

### Defining the entry point piece

```ts
const rootDatastoreAlias = "my-root-datastore";

export const rootDatastoreEntryPointPiece: IEntryPointPiece = {
	name: "rootDatastore",
	registryEntries: [MyRootDatastoreFactory.registryEntry],
	onCreate: async (runtime: IContainerRuntime): Promise<void> => {
		const rootDatastore = await runtime.createDataStore(MyRootDatastoreFactory.type);
		await rootDatastore.trySetAlias(rootDatastoreAlias);
	},
	onLoad: async (runtime: IContainerRuntime): Promise<void> => {},
	createPiece: async (runtime: IContainerRuntime): Promise<FluidObject> => {
		const entryPointHandle = await containerRuntime.getAliasedDataStoreEntryPoint(rootDatastoreAlias);

		if (entryPointHandle === undefined) {
			throw new Error(`Default dataStore [${rootDatastoreAlias}] must exist`);
		}

		return entryPointHandle.get();
	},
};
```

### Composing and loading the runtime

```ts
// In the IRuntimeFactory
public async instantiateRuntime(
	context: IContainerContext,
	existing: boolean,
): Promise<IRuntime> {
	const compositeEntryPoint = new CompositeEntryPoint();
	compositeEntryPoint.addEntryPointPiece(rootDatastoreEntryPointPiece);
	// migrationToolEntryPointPiece is provided by the migration-tools package
	compositeEntryPoint.addEntryPointPiece(migrationToolEntryPointPiece);
	return loadCompositeRuntime(context, existing, compositeEntryPoint, this.runtimeOptions);
}
```

### Accessing the composite entryPoint from the app

```ts
// Entry points are typed as FluidObject and must be cast.  Type validation can be added here if desired.
const { rootDatastore, migrationTool } = (await container.getEntryPoint()) as {
	rootDatastore: MyRootDatastore;
	migrationTool: IMigrationTool;
};
```
