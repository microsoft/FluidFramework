---
"@fluidframework/datastore": minor
---
---
"section": deprecation
---

The function `process` on `FluidDataStoreRuntime` is now deprecated.

A new function `processMessages` has been added in its place which will be called to process multiple messages instead of a single one on the data store runtime. This is part of a feature called "Op bunching" where contiguous ops of a given type and to a given data store / DDS are bunched and sent together for processing.
