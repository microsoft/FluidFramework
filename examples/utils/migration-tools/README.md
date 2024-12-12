# @fluid-example/migration-tools

This package contains tools for migrating data from one version to another, used by Fluid examples. They are not currently intended for use in production scenarios.

Use of the migration tools imposes several requirements on the container code and application, detailed here.

## Implementing `IMigratableModel`

Your data model must implement `IMigratableModel` to be migrated using the migration tools.

This includes:
1. A `version` string to identify the model version.
1. Methods to export and import data, and to detect if the model supports a given data format:
	1. `importData: (initialData: ImportType) => Promise<void>`
	1. `exportData: () => Promise<ExportType>`
	1. `supportsDataFormat: (initialData: unknown) => initialData is ImportType`
1. A `dispose` method to clean up the container - most likely calling `IContainer.dispose`.

## Implementing the composite runtime pattern

See documentation for the composite runtime pattern [here](./src/compositeRuntime/README.md).

The migration tools expect to find an `IMigratableModel` by accessing and calling a `getModel()` function provided on the `entryPoint`.  They also expect to find an `IMigrationTool` by accessing a `migrationTool` member of the `entryPoint`.  These requirements are most easily satisfied by using the composite runtime pattern.

`getModel()` is a function that takes an `IContainer` to aid in producing the `IMigratableModel`.  This is because the contract of `IMigratableModel` likely requires functionality from `IContainer` (especially `IContainer.dispose()`).

### Defining the entry point piece

```ts
const rootDatastoreAlias = "my-root-datastore";

export const getModelEntryPointPiece: IEntryPointPiece = {
	name: "getModel",
	registryEntries: [MyRootDatastoreFactory.registryEntry],
	onCreate: async (runtime: IContainerRuntime): Promise<void> => {
		const rootDatastore = await runtime.createDataStore(MyRootDatastoreFactory.type);
		await rootDatastore.trySetAlias(rootDatastoreAlias);
	},
	onLoad: async (runtime: IContainerRuntime): Promise<void> => {},
	createPiece: async (runtime: IContainerRuntime): Promise<(container: IContainer) => Promise<FluidObject>> => {
		const entryPointHandle = await containerRuntime.getAliasedDataStoreEntryPoint(rootDatastoreAlias);

		if (entryPointHandle === undefined) {
			throw new Error(`Default dataStore [${rootDatastoreAlias}] must exist`);
		}

		// Entry points are typed as FluidObject and must be cast.  Here we know it's a MyRootDatastore since
		// we created it just above.  Type validation can be added here if desired.
		const rootDatastore = entryPointHandle.get() as Promise<MyRootDatastore>;
		// MigratableAppModel (defined by the container code author) must implement IMigratableModel.
		// Note that we're returning a function of type (container: IContainer) => Promise<FluidObject>,
		// where the FluidObject is expected to be an IMigratableModel.
		return async (container: IContainer) => new MigratableAppModel(rootDatastore, container);
	},
};
```

```ts
// In the IRuntimeFactory
public async instantiateRuntime(
	context: IContainerContext,
	existing: boolean,
): Promise<IRuntime> {
	const compositeEntryPoint = new CompositeEntryPoint();
	compositeEntryPoint.addEntryPointPiece(getModelEntryPointPiece);
	// migrationToolEntryPointPiece is provided by the migration-tools package
	compositeEntryPoint.addEntryPointPiece(migrationToolEntryPointPiece);
	return loadCompositeRuntime(context, existing, compositeEntryPoint, this.runtimeOptions);
}
```

### `migrationToolEntryPointPiece`

This package additionally provides a `migrationToolEntryPointPiece` which is an off-the-shelf implementation of the piece to provide the `IMigrationTool`.  With these provided pieces, you're only responsible for implementing the `IMigratableModel` piece with your data model.

## `Migrator`

Finally, to actually execute the migration we provide the `Migrator` class.  This takes a `SimpleLoader` (see below), the initially loaded model, migration tool, and container ID (TODO: can we simplify this handoff), as well as an optional `DataTransformationCallback` (see below).  The migrator provides a collection of APIs to observe the state of the migration, as well as to acquire the new container after migration completes. (TODO: should the migrate() API also live here?)

TODO: Detail usage of the Migrator

### `SimpleLoader`

See documentation for `SimpleLoader` [here](./src/simpleLoader/README.md).  `SimpleLoader` is used in place of a `Loader` and is used by the `Migrator`.

### Code loader

To migrate between two different code versions, you must also provide a code loader to the `SimpleLoader` that is capable of loading those two respective code versions.  This uses the usual `ICodeDetailsLoader` interface.

### `DataTransformationCallback`

If your old and new code share an import/export format, you don't need a `DataTransformationCallback`.  But if the import/export format has changed between versions, you can provide this callback to the `Migrator` and it will be called with the old exported data.  This callback is responsible for transforming the data to the new format and returning the transformed data.

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
