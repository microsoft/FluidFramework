---
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
"@fluidframework/container-runtime": major
---

Removed IContainerContext.existing

The recommended means of checking for existing changed to the instantiateRuntime param in 2021, and the IContainerContext.existing member was formally deprecated in 2.0.0-internal.2.0.0. This member is now removed.
