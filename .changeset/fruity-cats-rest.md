---
"@fluidframework/container-runtime": minor
"__section": feature
---

Document schema now declares `createBlobPayloadPending` support by default when `minVersionForCollab` is 2.40.0+

When `minVersionForCollab` is set to `"2.40.0"` or later, the document schema now declares support for the
`createBlobPayloadPending` capability by default. This only affects what gets negotiated into the document
schema (which requires all collaborating clients to understand the format) - it does **not** change any
observable behavior. `BlobManager`'s pending-payload upload behavior remains off unless a caller explicitly
sets `createBlobPayloadPending: true` in their `ContainerRuntimeOptions`.

Pre-enabling the schema declaration now means documents will already be schema-compatible by the time we're
ready to turn on the corresponding client behavior by default in a future release, at which point that change
will not require a slow, fleet-wide document schema migration.
