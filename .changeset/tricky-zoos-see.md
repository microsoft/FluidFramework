---
"@fluidframework/container-runtime": minor
"@fluidframework/shared-object-base": minor
"__section": feature
---
Add logLevel property to events

Events now include an optional `logLevel` property that indicates their importance for diagnostics and enables consumers to make sampling or filtering decisions.

There are currently three values that the property can have:
1. 'verbose'
Chatty logs useful for debugging but likely not to be sent over the wire in production.
2. 'info'
Information about the session. These logs could be ommitted in some sessions if needed.
3. 'essential'
Essential information about the operation of Fluid that should always be transmitted for diagnostic purposes.

If the event does not contain a value for the `logLevel` property then it should be treated as `essential`
