---
"@fluidframework/telemetry-utils": major
---

`ITelemetryLoggerExt` is a replacement for `ITelemetryLogger`, which adds additional types that can be logged as property values.
This interface is not expected to be used outside the codebase, and all Logger implementations already use the new interface.
In this release, the new type is used throughout the codebase to allow richer instrumentation.

It's unlikely this will manifest as a break to consumers of the package, but it's not impossible.
