---
"@fluidframework/tree": minor
"__section": tree
---
SharedTree reuses compiled format validators

When format validation is enabled, SharedTree reuses compiled validators for the same schema object across codec instances.
This avoids repeated compilation when creating trees with shared schemas.
Validation remains disabled by default.
