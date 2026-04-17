---
"@fluidframework/tree": minor
"__section": feature
---

Add SchemaFactoryAlpha.stagedOptional for incremental required-to-optional field migrations

`SchemaFactoryAlpha.stagedOptional(T)` enables incremental migration of a field from required to
optional. It creates a field that is optional in the view schema but stored as required in the
stored schema until all clients have been upgraded, avoiding the need for a coordinated
simultaneous deployment.

Migration path:
1. Start with `sf.required(T)` - all clients require the field.
2. Deploy `sf.stagedOptional(T)` - new clients see the field as optional and can read documents
   whether the field is present or absent, but the stored schema stays required so old clients
   are not broken. Writing `undefined` is blocked at runtime during this phase.
3. Deploy `sf.optional(T)` once all clients have been updated - the stored schema becomes
   optional and the field can be cleared.
