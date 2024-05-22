---
"@fluidframework/runtime-definitions": major
---

Remove deprecated 'get' and 'serialize' members on the ITelemetryContext interface

The `ITelemetryContext` interface was not intended to allow getting properties that had been added to it, so it is now "write-only". Internal usage within FluidFramework should use the new `ITelemetryContextExt`.
