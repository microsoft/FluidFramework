---
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
"@fluidframework/container-runtime": major
"@fluidframework/container-runtime-definitions": major
"@fluidframework/datastore": major
"@fluidframework/datastore-definitions": major
"@fluidframework/runtime-definitions": major
"@fluidframework/sequence": major
"@fluid-private/test-end-to-end-tests": major
"@fluidframework/test-runtime-utils": major
---

ILoaderOptions no longer accepts arbitrary key/value pairs

ILoaderOptions has been narrowed to the specific set of supported loader options, and may no longer be used to pass arbitrary key/value pairs through to the runtime.
