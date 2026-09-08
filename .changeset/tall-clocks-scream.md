---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Schema compatibility snapshots use stored keys instead of ephemeral property keys for objects

The schema compatibility snapshot format now keys object fields by their persisted stored keys, so renaming a developer-facing property no longer appears to change schema compatibility. Existing version 1 snapshots remain supported, and the new normalize mode can rewrite the latest compatible snapshot into the current format to minimize future diffs.

To migrate an existing version 1 snapshot, run `snapshotSchemaCompatibility` once with `mode: "normalize"` and commit the rewritten latest snapshot. Normalization only succeeds when the current schema is compatibility-identical to that snapshot; use `mode: "assert"` for subsequent checks.
