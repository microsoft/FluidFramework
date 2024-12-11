---
"@fluidframework/core-interfaces": minor
"fluid-framework": minor
---
---
"section": feature
---


Event listeners that implement `Listenable` now allow support for one-time event handling via an `once()` function. The `once()` method registers an event listener that automatically deregisters itself after being invoked for the first time.
