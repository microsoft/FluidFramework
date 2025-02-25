# @fluid-example/migration-tools

This package contains tools for migrating data from one version to another, used by Fluid examples. They are not currently intended for use in production scenarios.

## `IMigrator`

Migration is performed by using the `IMigrator`.  The `IMigrator` can be inspected to discover the state of migration (`migrationState`), provides events to listen to as the state transitions, and has the method to kick off a migration (`proposeVersion()`).

```ts
if (migrator.migrationState === "collaborating") {
	migrator.proposeVersion("2.0");
}
```

To ensure no data is lost when moving between containers, you should stop making edits after the `"stopping"` event is raised.  After this point, it's no longer guaranteed that changes will be included in the migration.

```ts
migrator.events.on("stopping", () => {
	// ...disable input in your UI
});
```

Once the `"migrated"` event is raised, you can inspect the `migrationResult` property to find the result of the migration.  If the container author used the `makeSeparateContainerMigrationCallback()` helper, this will contain the container ID of the new, migrated container.

```ts
migrator.events.on("migrated", () => {
	console.log(`The new container ID is: ${migrator.migrationResult}`);
});
```

## Requirements for use

Accessing and using the `IMigrator` imposes several requirements on the container code and application, detailed in the following sections.

### Implementing the composite runtime pattern as the container code author

See documentation for the composite runtime pattern [here](./src/compositeRuntime/README.md).

The migrator is provided via the composite runtime pattern using the provided `makeMigratorEntryPointPiece()`.  When using this tool,
the host will be able to access the `IMigrator` by calling `getMigrator()` on the container entryPoint (`container.getEntryPoint()`).

#### Defining an example model entry point piece

```ts
const rootDatastoreAlias = "my-root-datastore";

export const getModelEntryPointPiece: IEntryPointPiece = {
	name: "model", // This is the name that the host will find the root datastore under in the entrypoint
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

#### Using `makeMigratorEntryPointPiece()`

```ts
// Entry points are typed as FluidObject and must be cast.  Here we know it's a MyRootDatastore since
// we (the container code author) created it just above.  Type validation can be added here if desired.
const getModelFromContainer = async <ModelType>(container: IContainer): Promise<ModelType> => {
	const entryPoint = (await container.getEntryPoint()) as {
		model: ModelType; // Note "model" matches up with the name we defined on the entry point piece above.
	};

	return entryPoint.model;
};

const exportDataCallback = async (container: IContainer): Promise<unknown> => {
	const rootDatastore = await getModelFromContainer<MyRootDatastore>(container);
	// This assumes that we've implemented an exportData() method on MyRootDatastore.
	return rootDatastore.exportData();
};

// In the IRuntimeFactory
public async instantiateRuntime(
	context: IContainerContext,
	existing: boolean,
): Promise<IRuntime> {
	const compositeEntryPoint = new CompositeEntryPoint();
	compositeEntryPoint.addEntryPointPiece(getModelEntryPointPiece);
	// makeMigratorEntryPointPiece is provided by the migration-tools package
	const migratorEntryPointPiece = makeMigratorEntryPointPiece(exportDataCallback);
	compositeEntryPoint.addEntryPointPiece(migratorEntryPointPiece);
	return loadCompositeRuntime(context, existing, compositeEntryPoint, this.runtimeOptions);
}
```

### Calling `getMigrator()` as the host

The host must provide certain functionality to the migrator (as callback functions) that the container code author doesn't have access to or knowledge
about.  In particular, these portions require access to the loader layer, and also knowledge about the future container code
that is being migrated to.

The migration-tools package makes helper functions available to simplify creation of these callback functions in basic scenarios.  Calling `getMigrator()` then returns an `IMigrator`.

```ts
// makeCreateDetachedContainerCallback is provided by the migration-tools package
const createDetachedCallback = makeCreateDetachedContainerCallback(
	loader,
	createTinyliciousCreateNewRequest,
);

const importDataCallback: ImportDataCallback = async (
	destinationContainer: IContainer,
	exportedData: unknown,
) => {
	const destinationModel = await getModelFromContainer<MyRootDatastore2>(destinationContainer);
	// Note that if the data needs to be transformed from the old export format to some new import format,
	// this is where it could be done.
	// This assumes that we've implemented an importData() method on MyRootDatastore2.
	await destinationModel.importData(exportedData);
};

// makeSeparateContainerMigrationCallback is provided by the migration-tools package
const migrationCallback = makeSeparateContainerMigrationCallback(
	createDetachedCallback,
	importDataCallback,
);

const { getMigrator } = (await container.getEntryPoint()) as IMigratorEntryPoint;
const migrator: IMigrator = await getMigrator(
	async () => loader.resolve({ url: id }),
	migrationCallback,
);
```

### Providing a code loader as the host

To migrate between two different code versions, the host must also provide a code loader that is capable of loading those two respective code versions.  There is nothing new here, but if you've been statically loading your code (i.e. via `StaticCodeLoader`) you'll need to start performing real code loading.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
