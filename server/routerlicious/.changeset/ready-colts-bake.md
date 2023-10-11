---
"@fluidframework/server-services-client": major
---

Export ITimeoutContext, getGlobalTimeoutContext, and setGlobalTimeoutContext from @fluidframework/server-services-client

The `@fluidframework/server-services-client` package now exports the following items. Please note they are not expected to be used outside of FluidFramework.

- `ITimeoutContext`: Binds and tracks timeout info through a given codepath. The timeout can be checked manually to stop exit out of the codepath if the timeout has been exceeded.
- `getGlobalTimeoutContext`: Retrieves the global ITimeoutContext instance if available. If not available, returns a NullTimeoutContext instance which behaves as a no-op.
- `setGlobalTimeoutContext`: Sets the global ITimeoutContext instance.

This change was made in [#17522](https://github.com/microsoft/FluidFramework/pull/17522).
