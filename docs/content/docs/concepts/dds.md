---
title: Introducing distributed data structures
menuPosition: 2
---

The Fluid Framework provides developers with _distributed data structures_ (DDSes) that automatically ensure that each
client has access to the same state. We call them _distributed data structures_ because they are similar to data
structures used commonly when programming, like strings, maps/dictionaries, and sequences/lists. The APIs provided by
DDSes are designed to be familiar to programmers who've used these types of data structures before. For example, the
[SharedMap][] DDS is used to store key/value pairs, like a typical map or dictionary data structure, and provides `get`
and `set` methods to store and retrieve data in the map.

When using a DDS, you can largely treat it as a local object. You can add data to it, remove data, update it, etc.
However, a DDS is not _just_ a local object. A DDS can also be changed by other users that are editing.

{{% callout tip %}}

Most distributed data structures are prefixed with "Shared" by convention. _SharedMap_, _SharedMatrix_, _SharedString_,
etc. This prefix indicates that the object is shared between multiple clients.

{{% /callout %}}

When a DDS is changed by any client, it raises an [event](#events) locally. Your code can listen to these events so that
you know when data is changed and can react appropriately. For example, you may need to recalculate a derived value when
some data in a DDS changes.

## Merge behavior

In a distributed system like Fluid, it is critical to understand how changes from multiple clients are merged.
Understanding the merge logic enables you to "preserve user intent" when users are collaborating on data. This means
that the merge behavior should match what users intend or expect as they are editing data.

In Fluid, the merge behavior is defined by the DDS. The simplest merge strategy, employed by key-value distributed data
structures like SharedMap, is _last writer wins_ (LWW). With this merge strategy, when multiple clients write different
values to the same key, the value that was written last will overwrite the others. Refer to the
[API documentation]({{< relref "/apis" >}}) for each DDS for more details about the merge strategy it uses.

## Performance characteristics

Fluid DDSes exhibit different performance characteristics based on how they interact with the Fluid service. The DDSes
generally fall into two broad categories: _optimistic_ and _consensus-based_.

{{% callout tip "See also" %}}

* [Fluid Framework architecture]({{< relref "architecture" >}})
* [Fluid service]({{< relref "service" >}})

{{% /callout %}}

### Optimistic data structures

Optimistic DDSes are capable of applying Fluid operations before they are sequenced by the Fluid service. The local
changes are said to be applied _optimistically_, hence the name _optimistic DDSes_. The DDSes also apply remote
operations as they are made in a consistent way.

Many of the most commonly used DDSes are optimistic, including [SharedMap][], [SharedSequence][], [SharedMatrix][], and
[SharedString][].

### Consensus-based data structures

Consensus-based DDSes are different from optimistic DDSes because they wait for confirmation from the Fluid service
before applying operations -- even local operations. These data structures offer additional behavior guarantees and can
be used when you need atomicity or synchronous behavior.

These behavioral guarantees cannot be implemented in an optimistic way. The cost is performance; optimistic DDSes are
part of what makes Fluid so fast, so using optimistic DDSes is almost always preferred, but you can trade performance
for behavioral guarantees.

#### Why consensus-based DDSes are useful

{{% callout note "Not required reading" %}}

You don't need to read this section if you're just getting started with Fluid. Feel free to skip it and return later.

{{% /callout %}}

To understand why consensus-based DDSes are useful, consider implementing a stack DDS. It's not possible (as far as we
know!) to implement a stack DDS as an optimistic one. In the ops-based Fluid architecture, one would define an operation
like `pop`, and when a client sees that operation in the op stream, it pops a value from its local stack object.

Imagine that client A pops, and client B also pops shortly after that, but _before_ it sees client A's remote pop
operation. With an optimistic DDS, the client will apply the local operation before the server even sees it. It doesn't
wait. Thus, client A pops a value off the local stack, and client B pops the same value -- even though it was _supposed_
to pop the second value. This represents divergent behavior; we expect a _distributed_ stack to ensure that `pop`
operations -- and any other operation for that matter -- are applied such that the clients reach a consistent state
eventually. The optimistic implementation we just described violates that expectation.

A consensus-based DDS does not optimistically apply local ops. Instead, these DDSes wait for the server to apply a
sequence number to the operation before applying it locally. With this approach, when two clients pop, neither makes any
local changes until they get back a sequenced op from the server. Once they do, they apply the ops in order, which
results in consistent behavior across all remote clients.

## Creating and storing distributed data structures

A distributed data structure object is created using its type's static `create` method.

```typescript
const myMap = SharedMap.create(this.runtime);
```

You must pass in an `IFluidDataStoreRuntime` that the DDS will be managed by. We'll cover the runtime in more detail in
the [Encapsulating data with DataObject](./dataobject-aqueduct.md) section.

### Storing a DDS within another DDS

Distributed data structures can store primitive values like numbers and strings, and _JSON serializable_ objects. For
objects that are not JSON-serializable, like DDSes, Fluid provides a mechanism called _handles_, which _are_
serializable.

When storing a DDS within another DDS, you must store its handle, not the DDS itself. For example, consider this code:

```ts
// Create a new map for our Fluid data
const myMap = SharedMap.create(this.runtime);

// Create a new counter
const myCounter = SharedCounter.create(this.runtime);

// Store the handle in the map
myMap.set("counter", myCounter.handle);
```

That's all you need to know about handles in order to use DDSes effectively. If you want to learn more about handles,
see [Fluid handles](../advanced/handles.md) in the Advanced section.

## Events

When a distributed data structure is changed by the Fluid runtime, it raises events. You can listen to these events so
that you know when data is changed by remote clients and can react appropriately. For example, you may need to
recalculate a derived value when some data in a DDS changes.

```ts
myMap.on("valueChanged", () => {
  recalculate();
});
```

Refer to later sections for more details about the events raised by each DDS.

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

Let's assume for a moment that all of the data about a shape is stored as a single object that looks like this:

```json
{
  "x": 0,
  "y": 0,
  "height": 60,
  "width": 40
}
```

If we want to make this data collaborative using Fluid, the most direct -- _but ultimately flawed_ -- approach is to
store our shape object in a SharedMap. Our SharedMap would look something like this:

```json
{
  "aShape": {
    "x": 0,
    "y": 0,
    "height": 60,
    "width": 40
  }
}
```

Recall that the [SharedMap uses a last writer wins merge strategy](#merge-behavior). This means that if two users are
editing the data at the same time, then the one who made the most recent change will overwrite the changes made by the
other user.

Imagine that you are collaborating with a colleague, and you change the shape's width while your colleague changes the
shape's height. This will generate two operations: a `set` operation for you, and another `set` operation for your
colleague. Both operations will be sequenced by the Fluid service, but only one will 'win,' because the SharedMap's
merge behavior is LWW. Since we're storing the shape as an object, both `set` operations _set the whole object_.

This results in someone's changes being "lost" from a user's perspective. This may be perfectly fine for your needs.
However, if your scenario requires users to edit individual properties of the shape, then the SharedMap LWW merge
strategy probably won't give you the behavior you want.

However, you could address this problem by storing individual shape properties in SharedMap keys. Instead of storing a
JSON object with all the data, you can break it apart and store the length in one SharedMap key, the width in another,
etc. With this data model, users can change individual properties of the shape without overwriting other users' changes.

You likely have more than one shape in your data model, so you could create a SharedMap to store all your shapes, then
store the SharedMaps representing each shape within that SharedMap.

To learn more about how you use DDSes to create more complex Fluid objects, see the [Encapsulating data with
DataObject](./dataobject-aqueduct.md) section.

### Key-value data

These DDSes are used for storing key-value data. They are all optimistic and use a last-writer-wins merge policy.

- [SharedMap][] -- a basic key-value distributed data structure.
- [SharedDirectory][] -- a SharedMap with an API more suited to hierarchical data.
- [SharedCell][] -- a "single-object SharedMap"; useful for wrapping objects.

### Sequences

These DDSes are used for storing sequential data. They are all optimistic.

- [SharedNumberSequence][] -- a distributed sequence of numbers.
- [SharedObjectSequence][] -- a distributed sequence of objects.
- [SharedMatrix][] -- a distributed data structure to efficiently use two-dimensional tabular data.

### Specialized data structures

- [SharedCounter][] -- a distributed counter.
- [SharedString][] -- a specialized data structure for handling collaborative text.
- [Ink][] -- a specialized data structure for ink data.

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "/docs/concepts/containers-runtime.md" >}}

<!-- Packages -->

[Aqueduct]: {{< relref "/apis/aqueduct.md" >}}
[undo-redo]: {{< relref "/apis/undo-redo.md" >}}

<!-- Classes and interfaces -->

[ContainerRuntimeFactoryWithDefaultDataStore]: {{< relref "/apis/aqueduct/containerruntimefactorywithdefaultdatastore.md" >}}
[DataObject]: {{< relref "/apis/aqueduct/dataobject.md" >}}
[DataObjectFactory]: {{< relref "/apis/aqueduct/dataobjectfactory.md" >}}
[Ink]: {{< relref "/apis/ink/ink.md" >}}
[SharedCell]: {{< relref "/apis/cell/sharedcell.md" >}}
[SharedCounter]: {{< relref "SharedCounter" >}}
[SharedDirectory]: {{< relref "/apis/map/shareddirectory.md" >}}
[SharedMap]: {{< relref "/apis/map/sharedmap.md" >}}
[SharedMatrix]: {{< relref "SharedMatrix" >}}
[SharedNumberSequence]: {{< relref "SharedNumberSequence" >}}
[SharedObjectSequence]: {{< relref "/apis/sequence/sharedobjectsequence.md" >}}
[SharedSequence]: {{< relref "SharedSequence" >}}
[SharedString]: {{< relref "SharedString" >}}
[Quorum]: {{< relref "/apis/protocol-base/quorum.md" >}}

<!-- Sequence methods -->

[sequence.insert]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-insert-Method" >}}
[sequence.getItems]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[sequence.remove]: {{< relref "/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[sequenceDeltaEvent]: {{< relref "/apis/sequence/sequencedeltaevent.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
