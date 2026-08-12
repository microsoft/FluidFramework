---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---

Schema compatibility snapshots ignore property keys

The schema compatibility snapshot format now keys object fields by their persisted stored keys, so renaming a developer-facing property no longer appears to change schema compatibility. Existing version 1 snapshots remain supported, and the new normalize mode can rewrite the latest compatible snapshot into the current format to minimize future diffs.
