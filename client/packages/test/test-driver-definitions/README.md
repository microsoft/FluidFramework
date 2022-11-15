# @fluidframework/test-driver-definitions

Definitions for test drivers. Test should only take a dependency on these definitions, and not the implementations provided in the `@fluidframework/test-drivers` package. At runtime the environment should provide an implementation for the global getFluidTestDriver driver function, which tests can then use to access the implementation.
