# fluid-framework

The `fluid-framework` package bundles a collection of Fluid Framework client packages for easy use when paired with a corresponding service client package (ex. `@fluidframework/azure-client` & `@fluidframework/tinylicious-client`).

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

## Contents

The `fluid-framework` package consists primarily of two portions: the `IFluidContainer` and a selection of distributed data structures (DDSes).

### IFluidContainer

The **[IFluidContainer][]** interface is the one of the types returned by calls to `createContainer()` and `getContainer()` on the service clients such as `AzureClient`. It includes functionality to retrieve the Fluid data contained within, as well as to inspect the state of the collaboration session connection.

### DDS packages

You'll use one or more DDS data structures in your container to model your collaborative data. The `fluid-framework` package comes with three data structures that cover a broad range of scenarios:

1. **[SharedMap][]**, a map-like data structure for storing key/value pair data
2. **[SharedDirectory][]**, a map-like data structure with ability to organize keys into subdirectories
3. **[SharedString][]**, a data structure for string data

## Tutorial

Check out the Hello World tutorial using the `fluid-framework` package [here](https://fluidframework.com/docs/start/tutorial/).

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

<!-- Links -->

[ifluidcontainer]: https://fluidframework.com/docs/apis/fluid-static/ifluidcontainer/
[sharedmap]: https://fluidframework.com/docs/apis/map/sharedmap/
[shareddirectory]: https://fluidframework.com/docs/apis/map/shareddirectory/
[sharedstring]: https://fluidframework.com/docs/apis/sequence/sharedstring/
