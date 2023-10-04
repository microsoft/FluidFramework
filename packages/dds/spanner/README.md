# @fluid-experimental/spanner

The `Spanner` Distributed Data Structure (DDS) which can load and switch from one `SharedObject` DDS to another.

<!-- AUTO-GENERATED-CONTENT:START (README_INSTALLATION_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluid-experimental/spanner
```

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

Note that when depending on a library version of the form `2.0.0-internal.x.y.z`, called the Fluid internal version scheme,
you must use a `>= <` dependency range (such as `>=2.0.0-internal.x.y.z <2.0.0-internal.w.0.0` where `w` is `x+1`).
Standard `^` and `~` ranges will not work as expected.
See the [@fluid-tools/version-tools](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/version-tools/README.md)
package for more information including tools to convert between version schemes.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_API_DOCS_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

## API Documentation

API documentation for **@fluid-experimental/spanner** is **subject to change**

### Registry setup

If the old `SharedObject` is `SharedCell` and the new `SharedObject` is `SharedMap` the factory will look something like
this:

```typescript
const spannerFactory = new SpannerFactory<SharedCell, SharedMap>(
	SharedCell.getFactory(),
	SharedMap.getFactory(),
	// May want to add type here
	// May want to add the populateNewSharedObject function here
);

new DataObjectFactory(
	"YourDataObjectPackagePath",
	YourDataObjectClass,
	[spannerFactory],
	{},
);
```

### Creation of the channel

Creation and storing of the Channel should work like all other channels. Except the type should be the `SharedObject` Type.

```typescript
const spanner = this.runtime.createChannel(
	"spanner",
	SharedCell.getFactory().type,
) as Spanner<TOld, TNew>;

// Storing the handle to make the channel attached
this.root.set("spanner", spanner.handle);
return spanner;
```

### Getting the SharedObject

Loading of the channel should work like all other channels. Getting the underlying `SharedObject` is as simple as `spanner.target`.

This code should be the same when retrieving the underlying `SharedObject` after the hot swap.

```typescript
const handle = this.root.get("spanner");
// assert check for defined value
const spanner: Spanner<SharedCell, SharedMap> = await handle.get();
// Feel free to do a check for spanner.attributes to make sure you can safely cast.
const sharedCell: SharedCell = spanner.target as SharedCell; // Casting may be necessary here.
```

### Injecting the migration code

Implement your populateNewSharedObject function - this is subject to change as it is hacky

```typescript
const spanner: Spanner<SharedCell, SharedMap>;
// old cell is your old data structure with data
// newMap is your new empty data structure to transfer the data to
spanner.populateNewSharedObject = (oldCell: SharedCell, newMap: SharedMap) => {
	// Example migration, this is where you write your custom migration code
	map.set("some key", cell.get());
};
```

### Hot swapping

After the setup you can hot swap all SharedObjects by firing a migrate/barrier op. Maybe we'll call this `HotSwap` or `Swap`

```typescript
spanner.submitMigrateOp();
```

TBD - There will need to be a need to emit an event

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_CONTRIBUTION_GUIDELINES_SECTION:includeHeading=TRUE) -->

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

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_HELP_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Help

Not finding what you're looking for in this README? Check out our [GitHub
Wiki](https://github.com/microsoft/FluidFramework/wiki) or [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an
issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand
Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
