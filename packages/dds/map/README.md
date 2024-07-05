# @fluidframework/map

<!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library's public APIs, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

If using any of Fluid Framework's unstable APIs (for example, its `beta` APIs), we recommend using a more constrained version range, such as `~`.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_IMPORT_INSTRUCTIONS:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Importing from this package

This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.
For more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

To access the `public` ([SemVer](https://semver.org/)) APIs, import via `@fluidframework/map` like normal.

To access the `legacy` APIs, import via `@fluidframework/map/legacy`.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## SharedMap

The SharedMap distributed data structure can be used to store key-value pairs. It provides the same API for setting and
retrieving values that JavaScript developers are accustomed to with the
[Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) built-in object.

### Creation

To create a `SharedMap`, call the static create method:

```typescript
const myMap = SharedMap.create(this.runtime, id);
```

### Usage

Unlike the JavaScript `Map`, a `SharedMap`'s keys must be strings. The value must only be plain JS objects or handles (e.g. to another DDS or Fluid objects).

In collaborative scenarios, the value is settled with a policy of _last write wins_.

### Eventing

`SharedMap` is an `EventEmitter`, and will emit events when other clients make modifications. You should register for these events and respond appropriately as the data is modified. `valueChanged` will be emitted in response to a `set` or `delete`, and provide the key and previous value that was stored at that key. `clear` will be emitted in response to a `clear`.

## SharedDirectory and IDirectory

A `SharedDirectory` is a map-like DDS that additionally supports storing key/value pairs within a tree of subdirectories. This subdirectory tree can be used to give hierarchical structure to stored key/value pairs rather than storing them on a flat map. Both the `SharedDirectory` and any subdirectories are `IDirectories`.

### Creation

To create a `SharedDirectory`, call the static create method:

```typescript
const myDirectory = SharedDirectory.create(this.runtime, id);
```

### Usage

The map operations on an `IDirectory` refer to the key/value pairs stored in that `IDirectory`, and function just like `SharedMap` including the same extra functionality and restrictions on keys and values. To operate on the subdirectory structure, use the corresponding subdirectory methods.

#### `getWorkingDirectory()`

To "navigate" the subdirectory structure, `IDirectory` provides a `getWorkingDirectory` method which takes a relative path and returns the `IDirectory` located at that path if it exists.

#### Eventing

`valueChanged` events additionally provide the absolute path to the subdirectory storing the value that changed.

`dispose` events are fired on sub directory which is deleted. Any access to this sub directory will throw an error once it is disposed.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_PACKAGE_README:scripts=FALSE&installation=FALSE&importInstructions=FALSE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## API Documentation

API documentation for **@fluidframework/map** is available at <https://fluidframework.com/docs/apis/map>.

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
