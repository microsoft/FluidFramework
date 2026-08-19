---
"@fluidframework/container-runtime": minor
"__section": feature
---
createBlobPayloadPending now defaults to enabled for newer clients, and can be explicitly disabled

The `createBlobPayloadPending` runtime option now defaults to `true` when `minVersionForCollab` is `2.40.0` or later (previously it always defaulted to `undefined`/disabled). Since this changes the document schema, it will only turn on for new documents, or existing documents that already have upgraded their schema. It can still be explicitly enabled or disabled by setting the option in `ContainerRuntimeOptions`. As part of this change, the type of `createBlobPayloadPending` was widened from `true | undefined` to `boolean | undefined`, so it can now be explicitly set to `false` to opt out of the new default.
