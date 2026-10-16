---
"@fluidframework/runtime-utils": minor
"fluid-framework": minor
"__section": legacy
---
Stop recognizing pre-symbol in-memory Fluid handles

In-memory handles created by Fluid Framework client `2.0.0-rc.3.0.0` or earlier are no longer recognized by `isFluidHandle` or accepted by `toFluidHandleInternal`.
Applications that dynamically load Fluid layers should ensure all loaded layers use `2.0.0-rc.4.0.0` or later.
