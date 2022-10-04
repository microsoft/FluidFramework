# Garbage Collection
Garbage collection (GC) is the process by which Fluid Framework performs automatic memory management. GC will run periodically and safely delete objects that are not used. The only responsibility of the users of Fluid Framework is to add and remove references to Fluid objects correctly.

## Why have Garbage Collection?
GC reduces the size of the Fluid file, the in-memory content and the summary that is uploaded to / downloaded from the server. It saves COGS on the server and it makes containers load time faster as there is less data to download and process.

## What do I need to do?
All Fluid objects that are in use must be marked as referenced so that they are not deleted by GC. Similarly, references to all unused Fluid objects should be removed so that they can be deleted by GC. It is the responsibility of the users of Fluid Framework to correctly add and remove references to Fluid objects.

## How do I reference / unreference Fluid objects?
Currently, the only Fluid objects that are eligible for GC are data stores and attachment blobs. The following sections describe how you can mark them as referenced or unreferenced.
### Data stores
There are 2 ways to add reference to data stores:
  - Store the data stores's ([IFluidHandle](../../../common/lib/core-interfaces/src/handles.ts)) in a referenced DDS that supports handle in its data. For example, a data store's handle can be stored in a referenced `SharedMap` DDS.
  - Alias the data store. Aliased data stores are rooted in the container, i.e., they are always referenced and cannot be unreferenced later. Aliased data stores can never be deleted so only do so if you want them to live forever.

To remove reference to a data store, remove all its IFluidHandles from any referenced DDSes. The data store then becomes eligible for GC.

> Note that there should be at least one aliased data store with at least one DDS in a container. This is the starting point for GC to look for other referenced objects in the container.

### Attachment blobs
The only way to reference attachment blobs is to store its IFluidHandle in a referenced DDS similar to data stores.

To remove reference to an attachment blob, remove all its IFluidHandles from any referenced DDSes. The attachment blob then becomes eligible for GC.

## GC algorithm
The GC algorithm runs in two phases:

### Mark phase
In this phase, the GC algorithm identifies all Fluid objects that are unreferenced and marks them as such:
1. It starts at the root (aliased) data stores and marks them and all their DDSes as referenced.
    > Note: Currently all DDSes are considered as root so they are always referenced. This may change in the future.
2. It finds the handles stored in DDSes from #1 and marks the objects corresponding to the handles as referenced.
3. It finds the handles stored in DDSes from #2 and marks the objects corresponding to the handles as referenced and so on until it has scanned all objects.
4. All the objects in the system that are not marked as referenced in the above steps are marked as unreferenced. The unreferenced state of the object and timestamp of when it is unreferenced is added to the summary. This is used to determine how long the object has been unreferenced for and is used for the sweep phase.

Mark phase is enabled by default for a container. It is enabled during creation of the container runtime and remains enabled throughout its lifetime. Basically, this setting is persisted in the summary and cannot be changed.

If you wish to disable this, set the `gcAllowed` option to `false` in `IGCRuntimeOptions`. These options are under `IContainerRuntimeOptions` and are passed to the container runtime during its creation. Note that this will disable GC permanently (including the sweep phase) for the container during its lifetime.

See `IGCRuntimeOptions` in [containerRuntime.ts](./src/containerRuntime.ts) for more options to control GC behavior.

### Sweep phase
In this phase, the GC algorithm identifies all Fluid objects that have been unreferenced for a specific amount of time (`deleteTimeout`) and deletes them. Deleted objects are removed from the Fluid file and cannot be brought back (revived).

GC sweep phase has not been enabled yet. More details will be added here when sweep is enabled.
