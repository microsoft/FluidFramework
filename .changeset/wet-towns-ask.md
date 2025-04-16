---
"@fluidframework/container-runtime": minor
"__section": feature
---

Introduce path based message routing

Add ability for runtime to address messages with a `/` separated path scheme. `/runtime/` is reserved for runtime where `undefined` was previously used and data store messages are prefixed with `/channels/`. To enable general sending messages with this scheme, internal `IContainerRuntimeOptionsInternal.pathBasedAddressing` must be enabled. Internally `presence` requires this support under the `/ext/` path and thus should only be used once involved clients are using version 2.33 or later.
