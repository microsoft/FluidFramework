---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
---
---
"section": deprecation
---

Deprecate the Loader class and provide alternatives. Also deprecated the IHostLoader interface.

Deprecate the Loader class and IHostLoader interface and instead provide standalone apis so that Host does not need to
take responsibility of creating the Loader object. Rather host can directly use apis like `resolveContainer`
, `createDetachedContainer` and `rehydrateDetachedContainerFromSnapshot` in the `@fluidframework/container-loader` package
to achieve the functionalities earlier provided by the Loader class.
