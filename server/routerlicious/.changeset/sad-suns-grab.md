---
"@fluidframework/server-services-client": "minor"
---

server-services-client: Add optional internalErrorCode property to NetworkError and INetworkErrorDetails

`NetworkError`s now include an optional property, `internalErrorCode`, which can contain additional information about
the internal error.

You can find more details in [pull request #21429](https://github.com/microsoft/FluidFramework/pull/21429).
