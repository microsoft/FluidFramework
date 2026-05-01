---
"@fluidframework/container-loader": minor
"__section": feature
---
Add readOnly option to loadFrozenContainerFromPendingState

`loadFrozenContainerFromPendingState` and `createFrozenDocumentServiceFactory` now accept an optional `readOnly` parameter (default `true`, preserving existing behavior).

When `readOnly: false`, the frozen container loads as writable so the runtime accepts DDS submissions. The container stays `Connected` against the synthetic `FrozenDeltaStream`: `ConnectionManager.sendMessages` recognizes it as the live connection and short-circuits before the read-mode reconnect branch, dropping outbound messages at the connection-manager layer. Submitted ops accumulate in the runtime's pending-state manager so `getPendingLocalState()` can capture them.

Use `readOnly: false` when the caller wants to load a frozen container, apply additional local changes, and capture the resulting pending state via `getPendingLocalState()`.

Also: `FrozenDeltaStream.submitSignal` is now a silent no-op for both variants. The pre-existing read-only-variant behavior was a 403 nack on signals; this PR drops it for both variants because (a) for the writable variant a stray signal would close or reconnect the container, and (b) signals are ephemeral and dropping them is the correct behavior with no upstream. `FrozenDeltaStream.submit` continues to nack defensively.
