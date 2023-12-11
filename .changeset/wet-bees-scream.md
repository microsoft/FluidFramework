---
"@fluidframework/azure-client": minor
"@fluid-experimental/devtools": minor
"fluid-framework": minor
"@fluidframework/fluid-static": minor
"@fluidframework/mocha-test-setup": minor
"@fluidframework/tinylicious-client": minor
---

azure-client: Deprecated FluidStatic Classes

Several FluidStatic classes were unnecessarily exposed. They have been replaced with creation functions. This helps us
keep implementations decoupled from usage which is easier to maintain and extend. It has very minimal impact on the
public surface area of downstream packages. The deprecated classes are as follows:

-   `AzureAudience` (use `IAzureAudience` instead)
-   `TinyliciousAudience` (use `ITinyliciousAudience` instead)
-   `DOProviderContainerRuntimeFactory`
-   `FluidContainer`
-   `ServiceAudience`
