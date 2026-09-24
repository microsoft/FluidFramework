---
"@fluidframework/container-runtime-definitions": minor
"@fluidframework/container-runtime": minor
"__section": feature
---

Container extensions can now submit persisted, sequenced ops

Previously, the `ContainerExtension` mechanism (`acquireExtension`/`getExtension`) could only exchange ephemeral signals via `ExtensionHost.submitAddressedSignal` / `ContainerExtension.processSignal`. Adding any persisted/sequenced-op capability required hardcoding a new `ContainerMessageType` and touching every dispatch switch statement in `ContainerRuntime` (submit, resubmit, process, stash-apply, staging, dirty-tracking).

`ExtensionRuntimeProperties` gains an optional `OpMessages` type parameter, `ExtensionHost` gains `submitAddressedOpMessage`, and `ContainerExtension` gains optional `processOpMessage` and `getPendingOpMessage` callbacks. These are all routed through a single new `ContainerMessageType.ExtensionOp` message type, dispatched by extension id (mirroring how extension signals are already addressed).

`getPendingOpMessage` lets an extension ensure an op of its own is always included first in the next outgoing batch (including after reconnection), by returning pending content on every call until it observes its own op come back through `processOpMessage` with `local === true`. This is the same "just-in-time, ahead of other ops" pattern the ID compressor already uses for allocation ranges (`ContainerRuntime`'s outbox now calls both mechanisms symmetrically at flush time), generalized so new extensions (e.g. cross-client determinism validation) can use it without any changes to `ContainerRuntime`'s message-type switch statements.

This is purely additive and `@internal`; existing signal-only extensions are unaffected.
