# @fluidframework/datastore

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

# Fluid Handle

A Fluid handle is a handle to a Fluid object like a `DataStore` or a `SharedObject` (DDS). It can be used to represent the object in the system and has the capability to get the underlying object by calling `get()` on it.

The two major interfaces required to implement a Fluid handle are `IFluidHandle` and `IFluidHandleContext` defined in [fluidHandle.ts](src/fluidHandle.ts).

## IFluidHandle

`IFluidHandle` has only one method `get` that is used to retrieve the underlying object it represents. It also extends `IFluidHandleContext`.

## IFluidHandleContext

`IFluidHandleContext` describes a routing context (another `IFluidHandleContext`) that has a path to this `IFluidHandleContext`. When creating a Data Store Handle the route context should be the `FluidDataStoreRuntime` which knows how to reach the `FluidDataStore`. Similarly, the `FluidDataStoreRuntime's` route context should be the `ContainerRuntime` which knows how to reach it.

For more details on Fluid Handles, check this [doc](../../../content/docs/advanced/handles.md).

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
