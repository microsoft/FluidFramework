# @fluid-example/migration-tools

This package contains tools for migrating data from one version to another, used by Fluid examples. They are not currently intended for use in production scenarios.

Use of the migration tools imposes several requirements on the container code and application, detailed here.

## Implementing the composite runtime pattern

These tools expect to find certain contents in the `entryPoint` of the container - namely, your data model implementing `IMigratableModel` and an `IMigrationTool`.  These two pieces are separable - neither needs to know about the other in order for them to operate.  As a result, we can compose the two together using the composite runtime pattern.

This package provides a `CompositeEntryPoint`, which takes your entry point "pieces" and can then be used with `loadCompositeRuntime()` in place of `ContainerRuntime.loadRuntime()` to produce a runtime with the desired `entryPoint`.  In the example below, the resulting `entryPoint` will have the shape:

TODO: This isn't correct typing, actually don't know the type of the returned model.  Should use FluidObject maybe?

TODO: Consider using a standalone example rather than the more complicated migration example

```ts
{
	getModel: (container: IContainer) => Promise<InventoryListAppModel>;
	migrationTool: IMigrationTool;
}
```

### Defining the model

```ts
interface IInventoryListAppModel {
	readonly inventoryList: IInventoryList;
}

class InventoryListAppModel implements IInventoryListAppModel, IMigratableModel {
	public constructor(
		public readonly inventoryList: IInventoryList,
		private readonly container: IContainer,
	) {}

	// Rest of app model implementation...
}
```

### Defining the entry point piece

TODO: Code comments

```ts
const modelEntryPointPieceName = "getModel";

const inventoryListId = "default-inventory-list";

async function getDataStoreEntryPoint<T>(
	containerRuntime: IContainerRuntime,
	alias: string,
): Promise<T> {
	const entryPointHandle = (await containerRuntime.getAliasedDataStoreEntryPoint(alias)) as
		| IFluidHandle<T>
		| undefined;

	if (entryPointHandle === undefined) {
		throw new Error(`Default dataStore [${alias}] must exist`);
	}

	return entryPointHandle.get();
}

const createPiece = async (
	runtime: IContainerRuntime,
): Promise<(container: IContainer) => Promise<IInventoryListAppModel>> => {
	return async (container: IContainer) => new InventoryListAppModel(
		await getDataStoreEntryPoint<IInventoryList>(runtime, inventoryListId),
		container,
	);
}

export const modelEntryPointPiece: IEntryPointPiece = {
	name: modelEntryPointPieceName,
	registryEntries: [InventoryListInstantiationFactory.registryEntry],
	onCreate: async (runtime: IContainerRuntime): Promise<void> => {
		const inventoryList = await runtime.createDataStore(
			InventoryListInstantiationFactory.type,
		);
		await inventoryList.trySetAlias(inventoryListId);
	},
	onLoad: async (runtime: IContainerRuntime): Promise<void> => {},
	createPiece,
};
```

### Composing and loading the runtime

```ts
public async instantiateRuntime(
	context: IContainerContext,
	existing: boolean,
): Promise<IRuntime> {
	const compositeEntryPoint = new CompositeEntryPoint();
	compositeEntryPoint.addEntryPointPiece(modelEntryPointPiece);
	compositeEntryPoint.addEntryPointPiece(migrationToolEntryPointPiece);
	return loadCompositeRuntime(context, existing, compositeEntryPoint, this.runtimeOptions);
}
```

### `migrationToolEntryPointPiece`

This package additionally provides a `migrationToolEntryPointPiece` which is an off-the-shelf implementation of the piece to provide the `IMigrationTool`.  With these provided pieces, you're only responsible for implementing the `IMigratableModel` piece with your data model.

### Implementing `IMigratableModel`

Although the basic model loading pattern doesn't impose any requirements on your model design, your model will need to implement `IMigratableModel` if it's going to be migrated using the migration tools.

Broadly, this includes:
1. A `version` string to identify the model version.
1. Methods to export and import data, and to detect if the model supports a given data format
    1. `importData: (initialData: ImportType) => Promise<void>`
	1. `exportData: () => Promise<ExportType>`
	1. `supportsDataFormat: (initialData: unknown) => initialData is ImportType`
1. A `dispose` method to clean up the old container after migrating away from it - most likely calling `IContainer.dispose`.

### `SimpleLoader`

This package provides a `SimpleLoader` which takes the place of the `Loader` class.  This class wraps the `Loader` with a simpler interface that the `Migrator` can use more easily.

TODO: Detail usage of the SimpleLoader

TODO: Can the `Migrator` take a normal `Loader` and wrap it itself to avoid teaching a new concept here?

### Code loader

To migrate between two different code versions, you must also provide a code loader to the `SimpleLoader` that is capable of loading those two respective code versions.  This uses the usual `ICodeDetailsLoader` interface.

## `Migrator`

Finally, to actually execute the migration we provide the `Migrator` class.  This takes the `SimpleLoader`, the initially loaded model, migration tool, and container ID (TODO: can we simplify this handoff), as well as an optional `DataTransformationCallback` (see below).  The migrator provides a collection of APIs to observe the state of the migration, as well as to acquire the new container after migration completes. (TODO: should the migrate() API also live here?)

TODO: Detail usage of the Migrator

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
