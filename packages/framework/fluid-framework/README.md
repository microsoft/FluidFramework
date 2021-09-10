# fluid-framework

The `fluid-framework` package bundles a collection of Fluid Framework client packages for easy use when paired with a corresponding service client package, such as the `@fluidframework/azure-client` package.

## Contents

The `fluid-framework` package currently consists of two main portions:  the `FluidContainer` and a selection of DDS packages.

### FluidContainer

The `FluidContainer` class is the one of the types returned by calls to `createContainer()` and `getContainer()` on the service clients such as `AzureClient`.  It includes functionality to retrieve the Fluid data contained within, as well as to inspect the state of the collaboration session connection.

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.
