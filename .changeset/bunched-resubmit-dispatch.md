---
"@fluidframework/runtime-definitions": minor
"@fluidframework/datastore-definitions": minor
"@fluidframework/container-runtime": minor
"@fluidframework/datastore": minor
"__section": feature
---
Extend bunched dispatch from `processMessages` to `reSubmit`

The container runtime now bunches contiguous same-DDS resubmit entries when replaying a pending batch, mirroring the existing bunched dispatch for inbound `processMessages`. A batch of N consecutive ops targeting the same channel now makes one round trip through `ChannelCollection → FluidDataStoreContext → FluidDataStoreRuntime → IChannelContext → IDeltaHandler` rather than N.

New API surface on `@legacy @beta`:

- `IRuntimeResubmitMessage` and `IRuntimeResubmitMessageCollection` (`@fluidframework/runtime-definitions`) — the bunched envelope, with a shared `squash` flag.
- Optional `IFluidDataStoreChannel.reSubmitMessages(type, collection)` (`@fluidframework/runtime-definitions`) — opt-in bunched form alongside the existing `reSubmit`.
- Optional `IDeltaHandler.reSubmitMessages(collection)` (`@fluidframework/datastore-definitions`) — opt-in bunched form alongside the existing `reSubmit`.

DDSes that do not implement `reSubmitMessages` automatically fall back to per-message `reSubmit` calls. `SharedObject`-derived DDSes get a default implementation that loops on the existing `reSubmitCore` / `reSubmitSquashedCore` paths; they may override to take advantage of seeing the full run together. Non-`FluidDataStoreOp` runtime message types (Attach, Alias, GC, etc.) continue to use the existing single-op `reSubmit` path.
