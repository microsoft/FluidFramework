---
"@fluidframework/datastore-definitions": minor
"__section": deprecation
---

IChannelFactory will be removed from the public API

The `IChannelFactory` interface will be **deprecated in version 2.90.0** and removed (moved to internal) in version 2.100.0. This interface is intended for internal Fluid Framework use only. It is required to implement custom DDS factories, which is not supported for external use.

Note: Other channel-related interfaces (`IChannel`, `IChannelAttributes`, `IChannelServices`, `IChannelStorageService`, `IDeltaConnection`, `IDeltaHandler`) will remain in the legacy API as they are transitively referenced by `IChannel` and `IFluidDataStoreRuntime`. However, without access to `IChannelFactory` and the `SharedObject`/`SharedObjectCore` base classes (which will also be removed from `@fluidframework/shared-object-base`), implementing custom DDSes will not be possible.

Applications should use SharedTree or another existing DDS type (SharedDirectory, SharedMap, etc.) rather than implementing custom DDSes.
