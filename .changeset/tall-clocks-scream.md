---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
New schema compatibility snapshots will use stored keys instead of property keys

The new schema compatibility snapshot format keys object fields by their persisted stored keys, so renaming a developer-facing property no longer appears to change schema compatibility.
It also preserves staged optional fields at the root and within objects, allowing compatibility checks to account for staged upgrade policies.

Existing version 1 snapshots remain supported and unchanged.
To write version 1 snapshots for older clients, set `oldestSupportedClientVersion` to a version before 3.2; attempting to encode staged optional fields in version 1 reports an actionable error.

To migrate an existing version 1 snapshot, run `snapshotSchemaCompatibility` once with `mode: "normalize"` and commit the rewritten latest snapshot.
Normalization only succeeds when the current schema is compatibility-identical to that snapshot; use `mode: "assert"` for subsequent checks.
