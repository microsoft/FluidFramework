# fluid-framework

The `fluid-framework` package bundles a collection of Fluid Framework client packages for easy use when paired with a corresponding service client package (ex. `@fluidframework/azure-client` & `@fluidframework/tinylicious-client`).

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

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.

<!-- Links -->

[ifluidcontainer]: https://fluidframework.com/docs/apis/fluid-static/ifluidcontainer/
[sharedmap]: https://fluidframework.com/docs/apis/map/sharedmap/
[shareddirectory]: https://fluidframework.com/docs/apis/map/shareddirectory/
[sharedstring]: https://fluidframework.com/docs/apis/sequence/sharedstring/
