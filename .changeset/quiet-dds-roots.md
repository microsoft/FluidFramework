---
"@fluidframework/container-runtime": minor
"@fluidframework/datastore": minor
"@fluid-experimental/attributor": minor
"__section": feature
"__includeInReleaseNotes": false
---
Add opt-in garbage collection for anonymous DDSs in new documents

The experimental `Fluid.GarbageCollection.EnableDDSGC` config setting enables independent garbage collection of anonymous DDSs when creating a document.
It is disabled by default, is persisted for the document's lifetime, and cannot upgrade existing documents.
DDSs created with an explicit ID remain roots of their owning data store.
DDSs created without an explicit ID remain alive through handle reachability rather than attachment alone.
An unreachable data store can still be collected together with its named DDSs.
Runtime attribution remains supported when independent DDS collection is enabled.

All clients opening an enabled document must include supporting container and data store runtimes from the same Fluid Framework version.
Custom `IFluidDataStoreChannel` implementations that are not built on `FluidDataStoreRuntime` are rejected when their data store loads in enabled documents.
The document schema records the capability so older schema-aware runtimes reject enabled documents.
Deploy supporting code to every client before creating enabled documents and prevent older code from opening them afterward.
Production enablement also requires validation of nested unreferenced summaries with the storage service and pending-state continuation for unreferenced content.
