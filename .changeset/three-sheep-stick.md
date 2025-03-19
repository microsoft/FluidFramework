---
"@fluidframework/container-runtime": minor
"@fluidframework/datastore": minor
"@fluidframework/datastore-definitions": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/test-runtime-utils": minor
---
---
"section": legacy
---

The functions `process` and `processDocumentSchemaOp` have been removed

`process` has been replaced by `processMessages` from the following:

- `FluidDataStoreRuntime`
- `IDeltaHandler`
- `IFluidDataStoreChannel`
- `MockFluidDataStoreRuntime`
- `MockDeltaConnection`

`processDocumentSchemaOp` has been replaced by `processDocumentSchemaMessages` from `DocumentsSchemaController`.

See the [deprecation release note](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.5.0#user-content-the-process-function-on-ifluiddatastorechannel-ideltahandler-mockfluiddatastoreruntime-and-mockdeltaconnection-is-now-deprecated-22840) for more details.
