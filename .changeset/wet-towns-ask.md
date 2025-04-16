---
"@fluidframework/container-runtime": minor
---

Introduce path based message routing

Add ability for runtime to address messages with a `/` separated path scheme. `/runtime/` is reserved for runtime where `undefined` was previously used and data store messages are prefixed with `/channels/`. To enable sending messages with this scheme, internal `IContainerRuntimeOptionsInternal.enablePathBasedAddressing` must be enabled.
