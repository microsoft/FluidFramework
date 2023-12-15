---
"@fluidframework/matrix": minor
"@fluidframework/sequence": minor
"@fluidframework/shared-object-base": minor
---

SharedObject processGCDataCore now takes IFluidSerializer rather than SummarySerializer

This change should be a no-op for consumers, and SummarySerializer and IFluidSerializer expose the same consumer facing APIs. This change just makes our APIs more consistent by only using interfaces, rather than a mix of interfaces and concrete implementations.
