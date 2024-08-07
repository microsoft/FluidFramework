---
"@fluidframework/azure-client": minor
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"@fluidframework/container-runtime": minor
"@fluidframework/core-interfaces": minor
"@fluidframework/devtools": minor
"@fluidframework/fluid-static": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/tinylicious-client": minor
---

Introduce path based message routing

Add ability for runtime to address messages with a `/` separated path scheme. `/runtime/` is reserved for runtime where `undefined` was previously used and data store messages are prefixed with `/channels/`. To enable sending messages with this scheme `CompatibilityMode` "2.2" must be used.
