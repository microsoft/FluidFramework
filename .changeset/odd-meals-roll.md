---
"@fluid-experimental/attributor": major
"@fluidframework/cell": major
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
"@fluidframework/sequence": major
"@fluid-private/test-end-to-end-tests": major
---

ILoaderOptions no longer accepts arbitrary key/value pairs

ILoaderOptions has been narrowed to the specific set of supported loader options, and may no longer be used to pass arbitrary key/value pairs through to the runtime.
