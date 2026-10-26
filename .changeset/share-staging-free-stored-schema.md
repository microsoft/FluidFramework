---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce repeated schema conversion for SharedTree

SharedTree reuses schema analysis and converted node definitions across overlapping schema roots.
Mutually recursive schemas also share lazily constructed maps of their reachable definitions.
Hydrated and unhydrated context creation, index setup, simple-schema copies, and compatibility snapshots reuse this analysis instead of repeating schema discovery.

Components with no transitively reachable staging share stored conversions across staged-upgrade policies, including when referenced by staged schemas.
Other components share conversions within each policy; filtering can change which schemas remain mutually reachable.
Root-field staging and stored-schema result wrappers remain root-specific.
Unhydrated contexts remain root-specific, and hydrated contexts remain document-specific; only their immutable schema lookup data is shared.

Configuration validation and unfiltered component discovery share a traversal, while configuration-specific checks still run on every construction.
Simple-schema copies and compatibility snapshots still return fresh output structures.
Definition map iteration order is unspecified.
JSON Schema exports use stable definition ordering; schema hashes and persisted schema encoding are unchanged.

Schema compatibility snapshots now write node definitions in a stable identifier order.
Newly generated snapshots may differ in definition ordering from older snapshots.
Existing snapshots remain usable without regeneration, and ordering alone does not change schema compatibility results.
