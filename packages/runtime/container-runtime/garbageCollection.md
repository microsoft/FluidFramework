# Garbage Collection
Garbage collection (GC) identifies Fluid objects that are not used and deletes them from the Fluid document. This reduces the size of the Fluid file, the in-memory content and the summary that is uploaded to / downloaded from the server. It also makes processing faster as there is less data to process.

Before understanding the details of how GC works, lets take a look at how to add a reference to Fluid objects when they are in use and remove the reference when they are not in use.

## Fluid object references
- All Fluid objects that are in use must be marked as referenced so that they are not deleted by GC. There are 2 ways to mark objects as referenced:
  - Create them as `root`. These objects are always referenced and cannot be marked unreferenced later. For example, `root` data stores are always referenced.

    `Root` objects can never be deleted so be careful and only create them if they should live forever.
  - Store a handle ([IFluidHandle](../../../common/lib/core-interfaces/src/handles.ts)) to the object in a referenced DDS that supports handle in its data. For example, a data store's handle can be stored in a referenced `SharedMap` DDS.
- All references to unused Fluid objects should be removed so that they can be deleted by GC. To remove an object's reference, all its handles should be removed from referenced DDSs.

> Note that there should be at least one `root` data store with one or more DDSs in a Fluid document so that other objects' handles can be stored in it.

## GC algorithm
The GC algorithm runs in two phases:

### Mark phase
In this phase, the GC algorithm identifies all Fluid objects that are unreferenced and marks them as such:
- It starts at the root data stores and marks them, and all their DDSs as referenced.
    > Note: Currently all DDSs are considered as root so they are always referenced. This may change in the future.
- It finds the handles stored in DDSs from #1 and marks the objects corresponding to the handles as referenced.
- It finds the handles stored in DDSs from #2 and marks the objects corresponding to the handles as referenced and so on until it has scanned all objects.
- All the objects in the system that are not marked as referenced in the above steps are marked as unreferenced.

### Sweep phase
In this phase, the GC algorithm identifies all Fluid objects that have been unreferenced for a specific amount of time (`deleteTimeout`) and deletes them:
- For the objects marked as unreferenced in the mark phase, a timer is started which runs for `deleteTimeout` amount of time.
- When the above timer expires, the corresponding object is marked as `expired`.
- If an object becomes referenced before the timer expires, the timer is cleared, and the object's unreferenced state is removed.
- When sweep runs, it finds all `expired` objects and deletes them.
- Deleted objects are removed from the Fluid file and cannot be brought back (revived).