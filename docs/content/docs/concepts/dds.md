---
title: Introducing distributed data structures
MenuPosition: 2
---

Fluid Framework provides developers with distributed data structures (DDSes) that automatically ensure that each client has access to the same state.
We call them this because they are similar to data structures used commonly when programming, like
strings, maps/dictionaries, and sequences/lists. The APIs provided by distributed data structures are designed to be
familiar to programmers who've used these types of data structures before. For example, the `SharedMap` DDS is used to
store key/value pairs, like a typical map or dictionary data structure, and provides `get` and `set` methods to store
and retrieve data in the map.

When using a DDS, you can largely treat it as a local object. You can add data to it, remove data, update it, etc.
However, a DDS is not _just_ a local object. A DDS can also be changed by other users that are editing.

{{% callout tip %}}

The names of distributed data structures are prefixed with `Shared` by convention. SharedMap, SharedInk, SharedString,
etc. This prefix indicates that the object is shared between multiple clients.

{{% /callout %}}

When a DDS is changed by another client, it raises an [event](#events) locally. Your code can listen to these events so that you
know when data is changed by a remote client and can react appropriately. For example, you may need to recalculate a
derived value when some data in a DDS changes.

All Fluid distributed data structures are _eventually consistent_. This means that, assuming no new changes to the data
structures, all of the distributed copies of the DDS will reach an identical state in a finite amount of time.

The quality of eventual consistency can improve performance in many cases because local changes can be made
optimistically, knowing that the runtime will merge the change in the appropriate way eventually. This is a guarantee
made by the Fluid runtime.

Clients must always assume their local DDS state is stale since there are potentially changes from remote clients
that they have not yet received. For scenarios where modification of the data can only be done safely with an up-to-date
view of the data, Fluid provides consensus-based data structures. These data structures build in protections to prevent
modification of the data if the unsafe conditions are met, and clients wait to get confirmation from the server before
assuming their modifications were accepted.

For example, to pop a distributed stack, clients need an up-to-date view of the state of the stack. Otherwise, two
clients may believe they've popped the same item.

## Merge behavior

In a distributed system like Fluid, it is critical to understand how to merge changes from multiple clients because it
enables you to "preserve user intent" when users are collaborating on data. This means that the merge behavior should
match what users intend or expect as they are editing data.

In Fluid, the merge behavior is defined by the DDS. The simplest merge strategy, employed by key-value distributed data
structures like SharedMap, is "Last Writer Wins" (LWW). With this merge strategy, when multiple clients write different
values to the same key, the value that was written last will overwrite the others. Refer to the sections below for more
details about the merge strategy used by each DDS.


## Creating and storing distributed data structures

A distributed data structure object is created using its type's static `create` method.

```typescript
const myMap = SharedMap.create(this.runtime);
```

You must pass in an `IFluidDataStoreRuntime` that the DDS will be managed by. We'll cover the runtime in more detail in
the [Encapsulating data with DataObject](./dataobject-aqueduct.md) section.


### Storing a DDS within another DDS

Distributed data structures can store primitive values like numbers and strings, serializable objects, Fluid objects, and other
distributed data structures. Primitive values and objects can be stored directly, but when you store a DDS, or a Fluid object, you must
store its _handle_, not the object itself.
For example, consider this code:

```ts
// Create a new map for our Fluid data
const myMap = SharedMap.create(this.runtime);

// Create a new counter
const myCounter = SharedCounter.create(this.runtime);

// Store the handle in the map
myMap.set("counter", myCounter.handle);
```

Handles are used in Fluid to enable the runtime to implement features like garbage collection. You can learn more about
handles in the [handles section](../advanced/handles.md).


## Events

When a distributed data structure is changed by the Fluid runtime, it raises events. You can listen to these events so
that you know when data is changed by remote clients and can react appropriately. For example, you may need to
recalculate a derived value when some data in a DDS changes.

```ts
myMap.on("valueChanged", () => {
    recalculate();
});
```

Refer to the sections below for more details about the events raised by each DDS.


## Picking the right data structure

Because distributed data structures can be stored within each other, you can combine DDSes to create collaborative data
models. The following two questions can help determine the best data structures to use for a collaborative data model.

- What is the _granularity of collaboration_ that my scenario needs?
- How does the merge behavior of a distributed data structure affect this?

In your scenario, what do users need to individually edit? For example, imagine that you are storing data about
geometric shapes because you're building a collaborative editing tool. You might store the coordinates of the shape, its
length, width, etc.

When users edit this data, what pieces of the data can be edited simultaneously? This is an important question to answer
because it influences how you structure the data in your DDSes.

Let's assume for a moment that all of the data about a shape is stored as a single JSON object in a `SharedMap`. Recall that
the SharedMap uses a last writer wins merge strategy. This means that if two users are editing the data at the same
time, then the one who made the most recent change will overwrite the changes made by the other user.

This may be perfectly fine for your needs. However, if your scenario requires users to edit individual properties of the
shape, then the SharedMap LWW merge strategy probably won't give you the behavior you want.

However, you could address this problem by storing individual shape properties in SharedMap keys. Instead of storing a
JSON object with all the data, you can break it apart and store the length in one SharedMap key, the color in another,
etc. With this data model, users can change individual properties of the shape without overwriting other users' changes.

You likely have more than one shape in your data model, so you could create a SharedMap to store all your shapes, then
store that SharedMap in the root SharedDirectory.


## Key-value data

### SharedMap

### SharedDirectory

### SharedCell

## Sequences

{{% include file="_includes/sequences-usage.md" %}}

### SharedNumberSequence

### SharedObjectSequence

### SharedString

## Specialized data structures

### SharedMatrix

### Quorum

## Consensus-based data structures


<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=_includes/links.md) -->
<!-- Links -->

[ContainerRuntimeFactoryWithDefaultDataStore]: {{< relref "/apis/aqueduct/containerruntimefactorywithdefaultdatastore.md" >}}

[DataObject]: {{< relref "/apis/aqueduct/dataobject.md" >}}

[DataObjectFactory]: {{< relref "/apis/aqueduct/dataobjectfactory.md" >}}

[SharedDirectory]: {{< relref "/apis/map/shareddirectory.md" >}}
[shareddirectory]: {{< relref "/apis/map/shareddirectory.md" >}}

[SharedObjectSequence]: {{< relref "/apis/sequence/sharedobjectsequence.md" >}}
[sharedobjectsequence]: {{< relref "/apis/sequence/sharedobjectsequence.md" >}}

[SharedMap]: {{< relref "/apis/map/sharedmap.md" >}}
[sharedmap]: {{< relref "/apis/map/sharedmap.md" >}}

[undo-redo]: {{< relref "/apis/undo-redo.md" >}}


<!-- Sequences -->

[sequence.insert]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-insert-Method" >}}
[sequence.getItems]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[sequence.remove]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[sequenceDeltaEvent]: {{< relref "/apis/sequence/sequencedeltaevent.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
