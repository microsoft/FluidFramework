---
"@fluidframework/container-loader": minor
"@fluidframework/container-runtime": minor
"@fluidframework/core-interfaces": minor
"@fluidframework/driver-base": minor
"@fluidframework/local-driver": minor
"@fluidframework/odsp-driver": minor
"@fluid-private/test-end-to-end-tests": minor
---
---
"section": "feature"
---
Client targeted signals support

Added client-side support for targeted signals through `FluidDataStoreRuntime.submitSignal` by utilizing the optional `targetClientId` parameter. With the necessary service support for this feature (from Azure Fluid Relay, ODSP, and Tinylicious), clients are now able to send unicast signals directly to one another.
