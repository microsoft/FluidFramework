# Garbage Collection
Garbage collection (GC) is the process by which Fluid Framework safely delete objects that are not used. The only responsibility of the users of Fluid Framework is to add and remove references to Fluid objects correctly.

## Why have Garbage Collection?
GC reduces the size of the Fluid file at rest, the in-memory content and the summary that is uploaded to / downloaded from the server. It saves COGS on the server and it makes containers load faster as there is less data to download and process.

## What do I need to do?
All Fluid objects that are in use must be properly referenced so that they are not deleted by GC. Similarly, references to all unused Fluid objects should be removed so that they can be deleted by GC. It is the responsibility of the users of Fluid Framework to correctly add and remove references to Fluid objects.

## How do I reference / unreference Fluid objects?
Currently, the only Fluid objects that are eligible for GC are data stores and attachment blobs. The following sections describe how you can mark them as referenced or unreferenced. These sections speak of a "referenced DDS" which refers to a DDS that is created by a referenced data store.
### Data stores
There are 2 ways to reference a data store:
  - Store the data stores's handle (see [IFluidHandle](../../../common/lib/core-interfaces/src/handles.ts)) in a referenced DDS that supports handle in its data. For example, a data store's handle can be stored in a referenced `SharedMap` DDS.

    Note that storing a handle of any of a data store's DDS will also mark the data store as referenced.
  - Alias the data store. Aliased data stores are rooted in the container, i.e., they are always referenced and cannot be unreferenced later. Aliased data stores can never be deleted so only do so if you want them to live forever.

Once there are no more referenced DDSes in the container containing a handle to a particular data store, that data store is unreferenced and is eligible for GC.

> Note: There should be at least one aliased data store with at least one DDS in a container. This is the starting point for GC to look for other referenced objects in the container.

### Attachment blobs
The only way to reference an attachment blob is to store its IFluidHandle in a referenced DDS similar to data stores.

Once there are no more referenced DDSes in the container containing a handle to a particular attachment blob, that attachment blob is unreferenced and is eligible for GC.

## GC algorithm
The GC algorithm runs in two phases:

### Mark phase
In this phase, the GC algorithm identifies all Fluid objects that are unreferenced and marks them as such:
1. It starts at the root (aliased) data stores and marks them and all their DDSes as referenced.
2. It recursively finds the handles stored in referenced DDSes and marks the objects corresponding to the handles as referenced until is has scanned all objects.
3. All the objects in the system that are not marked as referenced are marked as unreferenced. The unreferenced state of the object and timestamp of when it is unreferenced is added to the summary. The timestamp is used to determine how long the object has been unreferenced for and is used for the sweep phase.

Mark phase is enabled by default for a container. It is enabled during creation of the container runtime and remains enabled throughout its lifetime. Basically, this setting is persisted in the summary and cannot be changed.

If you wish to disable this, set the `gcAllowed` option to `false` in `IGCRuntimeOptions`. These options are under `IContainerRuntimeOptions` and are passed to the container runtime during its creation. Note that this will disable GC permanently (including the sweep phase) for the container during its lifetime.

See `IGCRuntimeOptions` in [containerRuntime.ts](./src/containerRuntime.ts) for more options to control GC behavior.

### Sweep phase
In this phase, the GC algorithm identifies all Fluid objects that have been unreferenced for a specific amount of time (typically 30-40 days) and deletes them. Objects are only swept once the GC system is sure that they could never be referenced again by any active clients, i.e., clients that have the object in memory and could reference it.

GC sweep phase has not been enabled yet. More details will be added here when sweep is enabled.
