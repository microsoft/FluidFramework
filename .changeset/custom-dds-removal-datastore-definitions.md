---
"@fluidframework/datastore-definitions": major
"__section": breaking
---

IChannelFactory is now internal

The `IChannelFactory` interface is intended for internal Fluid Framework use only. It is
required to implement custom DDS factories, which is not supported for external use.
This export has been moved to internal and is no longer available in the public API.

Note: Other channel-related interfaces (`IChannel`, `IChannelAttributes`, `IChannelServices`,
`IChannelStorageService`, `IDeltaConnection`, `IDeltaHandler`) remain in the legacy API as
they are transitively referenced by `IChannel` and `IFluidDataStoreRuntime`. However, without
access to `IChannelFactory` and the `SharedObject`/`SharedObjectCore` base classes (which are
also now internal in `@fluidframework/shared-object-base`), implementing custom DDSes is not
possible.

Applications should use SharedTree or another existing DDS type (SharedMap, SharedCell, etc.)
rather than implementing custom DDSes.
