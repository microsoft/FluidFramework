---
"@fluidframework/azure-client": major
"fluid-framework": major
"@fluidframework/fluid-static": major
"@fluidframework/tinylicious-client": major
---

Removes Deprecated FluidStatic Classes

Several FluidStatic classes were unnecessarily exposed and have been deleted. They have been replaced with creation
functions. This helps us keep implementations decoupled from usage which is easier to maintain and extend. It has very
minimal impact on the public surface area of downstream packages. The removed classes are as follows:

-   `AzureAudience` (use `IAzureAudience` instead)
-   `TinyliciousAudience` (use `ITinyliciousAudience` instead)
-   `DOProviderContainerRuntimeFactory`
-   `FluidContainer`
-   `ServiceAudience`
