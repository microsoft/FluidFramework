---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
The extractPersistedSchema (alpha) API has had its arguments adjusted

The [extractPersistedSchema](https://fluidframework.com/docs/api/tree/#extractpersistedschema-function) function has been updated to take in [SimpleTreeSchema](https://fluidframework.com/docs/api/fluid-framework/simpletreeschema-interface).
This makes it possible to use with simple schema derived from stored schema, like those returned from [ITreeAlpha.exportSimpleSchema](https://fluidframework.com/docs/api/fluid-framework/itreealpha-interface#exportsimpleschema-methodsignature).
Like [TreeAlpha.exportCompressed](https://fluidframework.com/docs/api/tree#treealpha-variable), `extractPersistedSchema` now takes in [FluidClientVersion](https://fluidframework.com/docs/api/fluid-framework/fluidclientversion-enum) to make it possible to opt into newer formats when they become available.

Additionally, `persistedToSimpleSchema` has been added to fill in a gap in the API.
Without `persistedToSimpleSchema` it would be impossible to parse the persisted format without a valid compressed tree to provide to [independentInitializedView](https://fluidframework.com/docs/api/tree/#independentinitializedview-functionc).
