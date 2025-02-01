---
"@fluid-experimental/attributable-map": minor
"@fluidframework/map": minor
"@fluidframework/sequence": minor
---
---
"section": fix
"highlight": true
---

SharedMap, SharedIntervalCollection and AttributableMap now throw an error when they encounter unrecognized Ops

To avoid future versions of DDSes with new Op types causing silent data corruption and de-sync between clients,
DDSes should error when unable to apply an Op.
This prevents data loss and corruption scenarios like a summary client using old code discarding all Ops from newer clients.

If updating applications using SharedMap, SharedIntervalCollection and AttributableMap use a newer version which adds Ops types in the future,
old clients which are old enough to be from before this fix will ignore the new ops instead of erroring.
Therefore it may be useful to ensure this update is deployed as widely as possible before migrating any to newer versions which add new op formats to these DDSes.
