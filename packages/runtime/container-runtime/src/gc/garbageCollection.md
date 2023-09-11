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

-   Store the data stores's handle (see [IFluidHandle](../../../../../packages/common/core-interfaces/src/handles.ts) in a referenced DDS that supports handle in its data. For example, a data store's handle can be stored in a referenced `SharedMap` DDS.

    Note that storing a handle of any of a data store's DDS will also mark the data store as referenced.

-   Alias the data store. Aliased data stores are rooted in the container, i.e., they are always referenced and cannot be unreferenced later. Aliased data stores can never be deleted so only do so if you want them to live forever.

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

### Sweep phase

In this phase, the GC algorithm identifies all Fluid objects that have been unreferenced for a specific amount of time (typically 30-40 days) and deletes them.
Objects are only swept once the GC system is sure that they could never be referenced again by any active clients, i.e., clients that have the object in memory and could reference it.
The Fluid Runtime enforces a maximum session length (configurable) in order to guarantee an object is safe to delete after sufficient time has elapsed.

GC sweep phase has not been enabled by default yet. A "soft" version of Sweep called "Tombstone Mode" is enabled by default
as part of the Mark Phase when Sweep is disabled. In this mode, any object that GC determines is ready to be deleted is
marked as a "Tombstone", which triggers certain logging events and/or behavior changes if/when that Tombstoned object is
accessed by the application.

Tombstone is intended for use by early adopters of GC and is documented in more detail [here](./gcEarlyAdoption.md).

## GC Configuration

The default configuration for GC today is:

-   GC Mark Phase is **enabled**, including Tombstone Mode
-   Session Expiry is **enabled**
-   GC Sweep Phase is **disabled**
    -   Note: Once enabled, Sweep will only run for documents created from that point forward

### Techniques used for configuration

There are two ways to configure the Fluid Framework's GC behavior, referred to by name throughout these documents:

1.  **"GC Options"**: `ContainerRuntime.loadRuntime` takes an options value of type `IContainerRuntimeOptions`.
    This type includes a sub-object `gcOptions`, for GC-specific options.
2.  **"Config Settings"**: The `Loader`'s constructor takes in `ILoaderProps`, which includes `configProvider?: IConfigProviderBase`
    This configProvider can be used to inject config settings.

Typically GC Options are used for more "official" and stable configuration, whereas Config Settings provide a mechanism
for apps to override settings easily, e.g. by backing their `IConfigProviderBase` with a configuration/flighting service.
In cases where a behavior is controlled by both a Config Setting and GC Option, you may experiment at first using Config Settings
and then later update the passed-in GC Options to finalize the configuration in your code.

### Disabling Mark Phase

If you wish to disable Mark Phase for newly-created documents, set the `gcAllowed` GC Option to `false`.
Note that this will disable GC permanently (including the sweep phase) for the container during its lifetime.

Mark Phase can also be disabled just for the session, among other behaviors,
covered in the [Advanced Configuration](./gcEarlyAdoption.md#more-advanced-configurations) docs.

### Enabling Sweep Phase

To enable Sweep Phase for new documents, you must set the `gcSweepGeneration` GC Option to a number, e.g. 0 to start.
The full semantics of this GC Option are discussed [here](./gcEarlyAdoption.md#more-about-gcsweepgeneration-and-gctombstonegeneration).
Note that this will disabled Tombstone Mode.

A full treatment of Tombstone and Sweep configuration can be found in
[this companion document geared towards early adopters of GC](./gcEarlyAdoption.md).

### More Advanced Configuration

For additional behaviors that can be configured (e.g. for testing), please see these
[Advanced Configuration](./gcEarlyAdoption.md#more-advanced-configurations) docs.
