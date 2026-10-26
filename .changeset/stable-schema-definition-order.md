---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Use stable definition ordering in schema exports

SharedTree JSON Schema exports and schema compatibility snapshots now write node definitions in a stable identifier order, independent of definition map insertion order and locale.
Field and allowed-type ordering is unchanged.

Newly generated output may differ in definition ordering from older output.
Existing compatibility snapshots remain usable without regeneration, and ordering alone does not change schema compatibility results.
Schema hashes and persisted schema encoding are unchanged.
