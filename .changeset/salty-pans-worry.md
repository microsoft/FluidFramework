---
"@fluidframework/container-definitions": minor
"@fluidframework/container-runtime": minor
"__section": fix
---
GC timers are now cancelled when a container closes, not just when it is disposed

Adds an optional `close()` hook to `IRuntime` that `Container` calls on close.
`ContainerRuntime` implements it by cancelling all GC timers (session expiry and unreferenced-node timers)
without clearing tracked state.

This prevents the timers from causing memory leaks after a `Container` is closed but not disposed.
In Node.js environments this also prevents the timers from keeping the event loop alive until `dispose()`.
This can reduce the need for Mocha's --exit in tests which create containers which are closed but not disposed.

Disposing of closed containers is still recommended, but it is now less critical for avoiding timer-related hangs after close.
Disposal still helps clean up resources and can reduce the size of memory leaks if references to the container are leaked.
