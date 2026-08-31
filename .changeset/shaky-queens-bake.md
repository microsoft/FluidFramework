---
"@fluidframework/container-runtime": minor
"__section": feature
---

`createBlobPayloadPending` runtime option now accepts `false`

The `createBlobPayloadPending` property on `ContainerRuntimeOptions` (`@legacy @beta`) now has type `boolean | undefined` instead of `true | undefined`, allowing consumers to explicitly pass `false` to disable the feature. Passing `false` behaves the same as leaving the option `undefined` (disabled); this is a non-breaking, backwards-compatible widening of the accepted type.
