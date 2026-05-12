---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": fix
---
Add SharedTreeOptionsBeta.healUnresolvableIdsOnDecode to recover documents with corrupted identifiers

A SharedTree bug can result in corrupted documents due to their attach summary compressing identifier-field values in a way that cannot be uncompressed.
This bug manifested as remote clients processing the op throwing an error with the message "Unknown op space ID.".

This change adds an option (`healUnresolvableIdsOnDecode`) to `configuredSharedTreeBetaLegacy` which will allow documents affected by this bug to load again when enabled.
Enabling this option carries some risk, see documentation on the interface itself for more details.

#### Who is affected

Only applications whose SharedTree schema uses `identifier` fields, where the SharedTree was attached to a container that was already attached, are at risk.
Documents that meet those conditions and now fail to load can be recovered by setting `healUnresolvableIdsOnDecode: true`.
