---
"@fluidframework/container-runtime-definitions": minor
"@fluidframework/container-runtime": minor
"__section": feature
---

Container extensions can now submit persisted, sequenced ops

Previously, the `ContainerExtension` mechanism (`acquireExtension`/`getExtension`) could only exchange ephemeral signals via `ExtensionHost.submitAddressedSignal` / `ContainerExtension.processSignal`. Adding any persisted/sequenced-op capability required hardcoding a new `ContainerMessageType` and touching every dispatch switch statement in `ContainerRuntime` (submit, resubmit, process, stash-apply, staging, dirty-tracking).

`ExtensionRuntimeProperties` gains an optional `OpMessages` type parameter, `ExtensionHost` gains `submitAddressedOpMessage`, and `ContainerExtension` gains an optional `processOpMessage` callback. These are all routed through a single new `ContainerMessageType.ExtensionOp` message type, dispatched by extension id (mirroring how extension signals are already addressed). Extensions that need persisted, order-guaranteed ops (e.g. cross-client determinism validation, analogous to how the ID compressor submits allocation ranges) can now do so without any changes to `ContainerRuntime`'s message-type switch statements.

This is purely additive and `@internal`; existing signal-only extensions are unaffected.
