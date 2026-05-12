---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": fix
---
Add SharedTreeOptionsBeta.healUnresolvableIdentifiersOnDecode to recover documents with corrupted identifiers

A SharedTree bug can result in corrupted documents due to their attach summary compressing identifier-field values in a way that cannot be uncompressed.
This bug manifested as remote clients processing the op throwing an error with the message "Unknown op space ID.".

This change adds an option (`healUnresolvableIdentifiersOnDecode`) to `configuredSharedTreeBetaLegacy` which will allow documents affected by this bug to load again when enabled.
Enabling this option carries some risk, see documentation on the interface itself for more details.

#### Who is affected

Only SharedTrees attached to a container that was already attached can be impacted.
Furthermore, this bug only occurs when the attached tree contains [`identifier`](https://fluidframework.com/docs/api/tree/schemafactory-class#identifier-property) fields which contain implicitly generated default values.
