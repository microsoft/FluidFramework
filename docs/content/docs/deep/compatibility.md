---
title: Version compatibility
draft: true
status: outdated
aliases:
  - "/docs/concepts/compatibility/"
---

Because the Fluid Framework is a platform, maintaining predictable backwards/forwards compatibility is an important part
of development and documentation.  Any breaking changes should be placed in the [BREAKING.md](./breaking-changes.md)
file in the root of the repository.  Understanding the different parts of the Fluid Framework can help with making sure
contributions are acceptably compatible and the code is reasonably clean.

## Breakdown

The following overview shows the various levels and their corresponding contracts:

- Common: @fluidframework/common-definitions
  - Common utils/definitions that might be shared at all levels of the stack
- Protocol: @fluidframework/protocol-definitions
  - Definition of protocol between the server and the client (ops and summary structure, etc.)
- Driver: @fluidframework/driver-definitions
  - API of driver for access to storage and web socket connections
- Loader: @fluidframework/container-definitions
  - The core framework responsible for loading runtime code into a container
- Runtime: @fluidframework/runtime-definitions
  - A base set of runtime code that supports the Fluid model, summarization, and other core Fluid features
- Framework: @fluidframework/framework-definitions
  - A set of base implementations and helper utilities to support developers building on Fluid

This document will focus on a few specific layer boundaries.

### Protocol

Changes to the protocol definitions should be vetted highly, and ideally should always be backwards compatible.  These
changes require synchronization between servers and clients, and are meant to be minimal and well-designed.

### Driver and Loader

The driver and loader versions will come from the hosting applications.  Driver implementations depend on the
corresponding server version.  Changes to driver definitions must be applied to all driver implementations, and so they
should be infrequent.  The loader implementations are meant to be very slim, only providing enough functionality to load
the runtime code and connect to the server.

The driver contract is consumed by both the loader and the runtime layers.  Since the driver and loader come from the
same source, it is not necessary to maintain compatibility between the driver-to-loader boundary for now.  As number of
drivers increase and become external, this may change in the future.

The loader contract (also called container definitions) is consumed by the runtime layer.  Consumers of the Fluid
Framework may have different frequencies for releasing their host (with driver and loader) as their runtime code, so
this compatibility across this boundary is important.  Currently Fluid maintains that the driver/loader will be
backwards *and* forwards compatible with the runtime by at least 1 version.  For a given driver or loader version `2.x`,
it should be compatible with runtime versions `1.x`, `2.x`, and `3.x`.  This is illustrated by the table below:

Driver/Loader | | 1.x | 2.x | 3.x
-------------:|-|:---:|:---:|:---:
Runtime       | |     |     |
1.x           | | C   | BC  | X
2.x           | | FC  | C   | BC
3.x           | | X   | FC  | C

- C - Fully compatible
- BC - Driver/loader backwards compatible with runtime
- FC - Driver/loader forwards compatible with runtime (runtime backwards compatible with driver and loader)
- X - May not be compatible

### Runtime

Within the Fluid Framework, the runtime consists of a few parts:

1. The container-level runtime code: this corresponds to a single data source/document, and *contains* the data stores.
   The container-level runtime code is dictated by the "code" value in the quorum.  Typically developers building on
   Fluid will create an instance of the Fluid `ContainerRuntime` by passing it a registry- which instructs how to
   instantiate data stores; this may be dynamic, or all data store code could bundled with the container runtime.
2. The data-store-level runtime code: this corresponds to each loaded data store within a container.  The data-store-level
   runtime code is dictated by the package information in its attach op.  The data-store-level runtime code
   and container-level runtime code depend on each other through the APIs defined in runtime-definitions.  For reference,
   this boundary occurs between the `IFluidDataStoreContext`
   (container-level) and the `IFluidDataStoreRuntime` (data-store-level).  Fluid tries to keep the container runtime backwards
   compatible with the data store runtime by at least 1 version.
3. The distributed data structures code: typically developers can build data stores consisting of the Fluid Framework
   provided set of distributed data structures.  There is a registry of DDS factories within each data store that
   instruct how to load the DDS code, but this code is meant to be statically loaded with the data store.  Developers can
   build their own distributed data structures, but it may be more complicated, being that they are lower-level to the
   ops and summaries.

When making changes to the Fluid Framework repository, it is important to note when breaking changes are made to
runtime-definitions which affect compatibilities between different version of data stores.  We should ensure that
our own container-level runtime code can load our own data-store-level runtime code at least 1 version back.

Specific interfaces to monitor:

- `IContainerRuntime` - interfaces container runtime to loaded data store runtime
- `IFluidDataStoreContext` - interfaces data store context to loaded data store runtime
- `IFluidDataStoreRuntime` - interfaces loaded data store runtime to its context

## Guidelines for compatible contributions

There are many approaches to writing backwards/forwards compatible code.  For large changes or changes that are
difficult to feature detect, it might be valuable to leverage versioned interfaces.  For smaller changes, it might be as
simple as adding comments indicating what is deprecated and making the code backwards compatible.

It is required to make the changes backwards/forwards compatible at least 1 version where indicated above.  This means
splitting the logic in some way to handle the old API as well as comfortably handling the new API.  2+ versions later,
the code can be revisited and the specialized back-compat code can be removed.

### Isolate back-compat code

Typically, it is best to isolate the back-compat code as much as possible, rather than inline it.  This will help make
it clear to readers of the code that they should not rely on that code, and it will simplify removing it in the future.

One strategy is to write the code as it should be without being backwards compatible first, and then add extra code to
handle the old API.

### Comment appropriately

Add comments to indicate important changes in APIs; for example add a comment to indicate if an API is deprecated.  Use
the tsdocs `@deprecated` comment keyword where appropriate.

In addition to isolating back-compat code, adding comments can also help identify all places to change when revisiting
in the future for cleanup.  Using a consistent comment format can make it easier to identify these places.

```typescript
// back-compat: 0.11 clientType
```

The above format contains the breaking version and a brief tag, making it easy to find all references in the code later.
Liberally adding these near back-compat code can help with the later cleanup step significantly, as well as concisely
give readers of the code insight into why the forked code is there.

### Track the follow-up work

It is necessary to track the follow-up work to remove this back-compat code to keep the code pruned.  The code
complexity will creep up as more back-compat code comes in.  The strategy is to create a GitHub issue and include
information that provides context for the change and makes it easy for someone to cleanup in the future.

### Update the docs

During the initial change, it is important to make sure the API changes are indicated somewhere in the docs. After
making the follow-up change to remove the backwards compatible code, it should be documented in the
[BREAKING.md](./breaking-changes.md) file so that it is clear that it will break.
