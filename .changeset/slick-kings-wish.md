---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"@fluidframework/container-runtime": minor
"@fluidframework/container-runtime-definitions": minor
"@fluidframework/datastore": minor
"@fluidframework/datastore-definitions": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/sequence": minor
"@fluid-private/test-end-to-end-tests": minor
"@fluidframework/test-runtime-utils": minor
---

ILoaderOptions no longer accepts arbitrary key/value pairs

ILoaderOptions has been narrowed to the specific set of supported loader options, and may no longer be used to pass arbitrary key/value pairs through to the runtime.
