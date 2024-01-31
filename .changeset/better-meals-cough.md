---
"@fluidframework/runtime-definitions": minor
---

ITelemetryContext: All "read" functions are now deprecated

ITelemetryContext is to be used only for instrumentation, not for attempting to read the values already set by other code.
This is important because this _public_ interface may soon use FF's _should-be internal_ logging instrumentation types,
which we reserve the right to expand (to support richer instrumentation).
In that case, we would not be able to do so in a minor release if they're used as an "out" type
like the return type for `get`.
