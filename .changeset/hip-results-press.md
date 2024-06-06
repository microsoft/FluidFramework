---
"@fluidframework/datastore-definitions": minor
"fluid-framework": minor
"@fluidframework/shared-object-base": minor
---

Remove several types from `@public` scope

The following types have been moved from `@public` to `@alpha`:

-   `IFluidSerializer`
-   `ISharedObjectEvents`
-   `IChannelServices`
-   `IChannelStorageService`
-   `IDeltaConnection`
-   `IDeltaHandler`

These should not be needed by users of the declarative API, which is what `@public` is targeting.
