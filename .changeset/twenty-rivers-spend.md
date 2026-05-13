---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": fix
---
Fix a SharedTree document corruption bug

A SharedTree bug which could corrupt documents when attaching them to containers has been fixed.
See `healUnresolvableIdentifiersOnDecode` on `configuredSharedTreeBetaLegacy` for a potential mitigation path for documents that were already corrupted by this bug.

#### Who is affected

Only SharedTrees attached to a container that was already attached can be impacted.
Furthermore, this bug only occurs when the attached tree contains [`identifier`](https://fluidframework.com/docs/api/tree/schemafactory-class#identifier-property) fields which contain implicitly generated default values.
