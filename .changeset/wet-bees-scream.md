---
"@fluidframework/azure-client": minor
"@fluid-experimental/devtools": minor
"fluid-framework": minor
"@fluidframework/fluid-static": minor
"@fluidframework/mocha-test-setup": minor
"@fluidframework/tinylicious-client": minor
---

Deprecate FluidStatic Classes

This change deprecates a number of unnecessarily exposed FluidStatic classes, and replaces them with creation functions. This helps us keep implementations decoupled from usage which is easier to maintain and extend. It has very minimal impact on the public surface area of downstream packages. The deprecated classes are as follows:

-   AzureAudience
-   TinyliciousAudience
-   DOProviderContainerRuntimeFactory
-   FluidContainer
-   ServiceAudience
