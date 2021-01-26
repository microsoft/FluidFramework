# @fluidframework/test-driver-definitions

Defintions for test drivers. Test should only take a dependency on these defintions, and not the implementations provide in the `@fluidframework/test-drivers` package. At runtime the environment should provide and implementation for the global getFluidTestDriver driver function, which tests can then use to access the implementation.
