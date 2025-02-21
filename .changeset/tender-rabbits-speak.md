---
"@fluidframework/datastore": minor
---
---
"section": deprecation
---

The FluidDataStoreRuntime.process function is now deprecated

A new function `processMessages` has been added in place of `process`. The new function will be called to process multiple messages instead of a single one on the data store runtime. This is part of a feature called "Op bunching" where contiguous ops of a given type and to a given data store / DDS are bunched and sent together for processing.
Note that `process` may still be called in scenarios where this data store runtime (Datastore layer) is running with an older version of data store context (Runtime layer) in the same client. This is to support Fluid layer compatibility.
