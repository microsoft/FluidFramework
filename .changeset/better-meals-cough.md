---
"@fluidframework/runtime-definitions": minor
---

ITelemetryContext: Functions `get` and `serialize` are now deprecated

ITelemetryContext is to be used only for instrumentation, not for attempting to read the values already set by other code.
This is important because this _public_ interface may soon use FF's _should-be internal_ logging instrumentation types,
which we reserve the right to expand (to support richer instrumentation).
In that case, we would not be able to do so in a minor release if they're used as an "out" type
like the return type for `get`.

There is no replacement given in terms of immediate programmatic access to this data.
The expected use pattern is something like this:

-   Some code creates a concrete implementation of `ITelemetryContext` and passes it around
-   Callers use the "write" functions on the interface to build up the context
-   The originator uses a function like `serialize` (on the concrete impl, not exposed on the interface any longer)
    and passes the result to a logger
-   The data is inspected along with other logs in whatever telemetry pipeline is used by the application (or Debug Tools, etc)
