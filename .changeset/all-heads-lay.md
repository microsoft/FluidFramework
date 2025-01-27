---
"@fluid-experimental/attributable-map": minor
"@fluidframework/map": minor
"@fluidframework/sequence": minor
---
---
"section": fix
---

SharedMap, SharedIntervalCollection and AttributableMap now error on unrecognized Ops

To avoid future versions of DDSes with new Op types causing silent data corruption and de-sync between clients,
DDSes should error when unable to apply an Op.
This prevents data loss and corruption scenarios like a summary client using old code discarding all ops from newer clients.

If updating applications using SharedMap, SharedIntervalCollection and AttributableMap use a newer version which adds Ops types in the future,
old clients which are old enough to be from before this fix will ignore the new ops instead of erroring.
Therefor is may be useful to ensure this update is deplored as widely as possible before migrating any top newer versions which add new op formats to these DDSes.
