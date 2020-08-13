# Introducing distributed data structures

The primary way that developers interact with the Fluid Framework is through a collection of objects called _distributed
data structures_ (DDSes). We call them this because they are similar to data structures used commonly when programming, like
strings, maps/dictionaries, and sequences/lists. The APIs provided by distributed data structures are designed to be
familiar to programmers who've used these types of data structures before. For example, the `SharedMap` DDS is used to
store key/value pairs, like a typical map or dictionary data structure, and provides `get` and `set` methods to store
and retrieve data in the map.

When using a DDS, you can largely treat it as a local object. You can add data to it, remove data, update it, etc.
However, a DDS is not _just_ a local object. Fluid's purpose is to make it easier to build systems with _distributed_
data, where multiple users are editing the same data source. A DDS can be changed not only by your code running locally
on the client, but also by the Fluid runtime on behalf of other users that are editing.

::: tip

The names of distributed data structures are prefixed with `Shared` by convention. SharedMap, SharedInk, SharedString,
etc. This prefix indicates that the object is shared between multiple clients.

:::

When a DDS is changed by the Fluid runtime, it raises an [event](#events). Your code can listen to these events so that you
know when data is changed by remote clients and can react appropriately. For example, you may need to recalculate a
derived value when some data in a DDS changes.

Most distributed data structures are _eventually consistent_. This means that, assuming no new changes to the data
structures, all of the distributed copies of the DDS will reach an identical state in a finite amount of time.

The quality of eventual consistency improves performance because local changes can be made optimistically, knowing that
the runtime will merge the change in the appropriate way eventually. This is a guarantee made by the Fluid runtime.

There are cases, however, where the eventually consistent guarantee is insufficient. In these cases, the consensus-based
distributed data structures are useful. These data structures defer applying operations until they're acknowledged by
the server. This can be used to ensures that each client pops a different value from a distributed stack, for example.


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
const myMap = SharedMap.create(this.runtime, id);
```

You must pass in an `IFluidDataStoreRuntime` that the DDS will be managed by. We'll cover the runtime in more detail in
[a later section](./interfaces-aqueduct.md).


### Storing a DDS within another DDS

Distributed data structures can store primitive values like Numbers and strings, JSON-able JavaScript Objects, or other
distributed data structures. Primitive values and Objects can be stored directly, but when you store a DDS, you must
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
    setSelectedOption(getSelectedOptionKey());
    setHistoryItems(getHistoryItems());
});
```

Refer to the sections below for more details about the events raised by each DDS.

## Picking the right data structure

Because distributed data structures can be stored within each other, you can combine DDSs to create collaborative data
models. The following two questions can help determine the best data structures to use for a collaborative data model.
First, what is the _granularity of collaboration_ that my scenario needs? And how does the merge behavior of a
distributed data structure affect this?

In your scenario, what do users need to individually edit? For example, imagine that you are storing data about
geometric shapes because you're building a collaborative editing tool. You might store the coordinates of the shape, its
length, width, etc.

When users edit this data, what pieces of the data can be edited simultaneously? This is an important question to answer
because it influences how you structure the data in Fluid.

Let's assume for a moment that all of the data about a shape is stored as a JSON object in a `SharedMap`. Recall that
the SharedMap uses a last writer wins merge strategy. This means that if two users are editing the data at the same
time, then the one who made the most recent change will overwrite the changes made by the other user.

This may be perfectly fine for your needs. However, if your scenario requires users to edit individual properties of the
shape, then the SharedMap LWW merge strategy probably won't give you the behavior you want.

However, you could address this problem by storing individual shape properties in SharedMap keys. Instead of storing a
JSON object with all the data, you can break it apart and store the length in one SharedMap key, the color in another,
etc. With this data model, users can change individual properties of the shape without overwriting other users' changes.

## Key-value data

### SharedMap

### SharedDirectory

### SharedCell

## Sequences

### SharedNumberSequence

### SharedObjectSequence

### SharedString

## Specialized data structures

### SharedMatrix

### Quorum

## Consensus-based data structures


!!!include(links.md)!!!
