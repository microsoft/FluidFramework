# @fluid-example/migration-tools

This package contains tools for migrating data from one version to another, used by Fluid examples. They are not currently intended for use in production scenarios.

Use of the migration tools imposes several requirements on the container code and application, detailed here.

## Implementing the model loading pattern

These tools rely on the model loading pattern.  This pattern allows you to define whatever API surface you would like to expose from the Fluid container for your app to use.  This could be as simple as exposing a root data store for your app to access, or could contain much more advanced functionality if you desire.

This model object is instantiated by your container code during container load.  To simplify this, we provide `instantiateMigratableRuntime` which should be used in place of `ContainerRuntime.loadRuntime`.  In addition to the familiar parameters, this helper function takes a `CreateModelCallback` - you should write this function to instantiate your model.  The callback will provide an `IContainerRuntime` and `IContainer` to use in this instantiation.

TODO: Example of the callback

### Implementing `IMigratableModel`

Although the basic model loading pattern doesn't impose any requirements on your model design, your model will need to implement `IMigratableModel` if it's going to be migrated using the migration tools.

Broadly, this includes:
1. A `version` string to identify the model version.
1. Methods to export and import data, and to detect if the model supports a given data format
    1. `importData: (initialData: ImportType) => Promise<void>`
	1. `exportData: () => Promise<ExportType>`
	1. `supportsDataFormat: (initialData: unknown) => initialData is ImportType`
1. A `dispose` method to clean up the old container after migrating away from it - most likely mapping to `IContainer.dispose`.

### `MigratableModelLoader`

This package provides a `MigratableModelLoader` which takes the place of the `Loader` class.  For this to work you must be using `instantiateMigratableRuntime` in your container code, and your model must implement `IMigratableModel`.

TODO: Detail usage of the MigratableModelLoader

### Code loader

To migrate between two different code versions, you must also provide a code loader to the `MigratableModelLoader` that is capable of loading those two respective code versions.  This uses the usual `ICodeDetailsLoader` interface.

## `Migrator`

Finally, to actually execute the migration we provide the `Migrator` class.  This takes the `MigratableModelLoader`, the initially loaded model, migration tool, and container ID (TODO: can we simplify this handoff), as well as an optional `DataTransformationCallback` (see below).  The migrator provides a collection of APIs to observe the state of the migration, as well as to acquire the new container after migration completes. (TODO: should the migrate() API also live here?)

TODO: Detail usage of the Migrator

### `DataTransformationCallback`

If your old and new code share an import/export format, you don't need a `DataTransformationCallback`.  If not, you can provide this callback to the `Migrator`, and it will be called with the old exported data.  This callback is responsible for transforming the data to the new format and returning the transformed data.

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
