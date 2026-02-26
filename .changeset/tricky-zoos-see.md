---
"@fluidframework/container-runtime": minor
"@fluidframework/shared-object-base": minor
"__section": feature
---
Add logLevel property to logging events

Events now include an optional `logLevel` property that indicates their importance for diagnostics and enables consumers to make sampling or filtering decisions.

There are currently three supported values:
1. 'verbose'
Chatty logs useful for local debugging. They need not be collected in production.
2. 'info'
Information about the session. These logs could be omitted in some sessions if needed (e.g. to reduce overall telemetry volume).  If any are collected from a particular session, all should be.
3. 'essential'
Essential information about the operation of Fluid. It's recommended that they should always be collected even in production, for diagnostic purposes.

If the event does not contain a value for the `logLevel` property then it should be treated as `essential`
