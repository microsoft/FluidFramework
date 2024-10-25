---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
---
---
"section": deprecation
---

Deprecate the Loader class and provide alternatives. Also deprecated the IHostLoader interface.

Deprecate the Loader class and IHostLoader interface and instead provide standalone apis so that Host does not need to
take responsibility of creating the Loader object. Rather host can directly use apis like {@link @fluidframework/container-loader#resolve}
, {@link @fluidframework/container-loader#createDetachedContainer} and {@link @fluidframework/container-loader#rehydrateDetachedContainerFromSnapshot}
to achieve the functionalities provided by the Loader class.
