---
"@fluidframework/tree": minor
"__section": tree
---
MinimumVersionForCollab is now used in place of FluidClientVersion

FluidClientVersion is no longer used as the declaration type for versions in APIs/codecs (e.g., `oldestCompatibleClient`).
The `oldestCompatibleClient` is still specified at the Shared Tree API level rather than by the Container,
though this will change someday.
