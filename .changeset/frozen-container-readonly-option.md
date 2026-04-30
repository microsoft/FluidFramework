---
"@fluidframework/container-loader": minor
"__section": feature
---
Add readOnly option to loadFrozenContainerFromPendingState

`loadFrozenContainerFromPendingState` and `createFrozenDocumentServiceFactory` now accept an optional `readOnly` parameter (default `true`, preserving existing behavior).

When `readOnly: false`, the frozen container loads as writable so the runtime accepts DDS submissions. The first runtime submit triggers an internal read→write upgrade attempt that cannot succeed (no upstream, no quorum join op), so the container settles into `Disconnected`. DDS local apply continues, and submitted ops accumulate in the runtime's pending-state manager — this is the state needed to accrue and capture additional pending state without publishing it.

Use `readOnly: false` when the caller wants to load a frozen container, apply additional local changes, and capture the resulting pending state via `getPendingLocalState()`.
