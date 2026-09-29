---
"@fluidframework/local-driver": minor
"__section": feature
---
Add session-storage-backed local services

The new alpha [`getSessionService`](https://fluidframework.com/docs/api/local-driver/getsessionservice-function) API provides a [`ServiceClient`](https://fluidframework.com/docs/api/driver-definitions/serviceclient-interface) compatible way to use the browser-local Fluid service that retains attached documents across page reloads in the same browser tab. Calls within one JavaScript realm share a lazily created service for the lifetime of that realm. Local services also expose APIs to list and delete their stored documents.

Session storage can be shared by separate same-origin JavaScript realms or applications loading separate copies of the package. Such instances run independent local servers, so concurrently editing the same stored document across them is unsupported.

The alpha `EphemeralServiceClient` type has been replaced by the more general [`LocalServiceClient`](https://fluidframework.com/docs/api/local-driver/localserviceclient-interface) type. Update type imports and annotations to use [`LocalServiceClient`](https://fluidframework.com/docs/api/local-driver/localserviceclient-interface)<[`EphemeralService`](https://fluidframework.com/docs/api/local-driver/ephemeralservice-interface)>.
