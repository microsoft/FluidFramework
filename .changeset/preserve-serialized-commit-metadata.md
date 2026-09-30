---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
Preserve custom commit metadata when applying serialized changes

Changes returned by `LocalChangeMetadata.getChange()` now include the commit's custom metadata, including metadata from nested transactions.
Applying these changes to another view preserves that metadata in its branch history.
