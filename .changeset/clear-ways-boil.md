---
"@fluidframework/telemetry-utils": minor
---
---
section: other
---

Some types now use Records instead of index signatures

The `ITelemetryLoggerPropertyBag` and `sd` types new use `Record` instead of index signatures. There should be no impact
on consumers of the APIs since the types are equivalent to TypeScript.
