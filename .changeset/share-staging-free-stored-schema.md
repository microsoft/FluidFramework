---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce repeated schema processing in SharedTree

SharedTree reuses schema analysis and converted definitions across overlapping and recursive schemas, reducing repeated work during view configuration, context creation, index setup, and schema export.

Schema definitions without reachable staged upgrades can also share conversions across upgrade policies.

Configuration-specific validation still runs for each configuration.
Simple-schema copies and compatibility snapshots continue to return fresh output structures.
Unhydrated contexts remain root-specific, and hydrated contexts remain document-specific.

Definition map iteration order is unspecified.
Schema hashes and persisted schema encoding are unchanged.
