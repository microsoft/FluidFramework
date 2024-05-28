---
"@fluidframework/tree": minor
---

Adjusted Listenable multi-event subscription policy.

`Listenable.on()` no longer supports the same listener function object being registered twice for the same event.
The deregister function returned by `Listenable.on()` may now be called multiple times with no effect.
