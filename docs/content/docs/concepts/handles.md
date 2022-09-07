---
title: Handles
menuPosition: 5
status: outdated
aliases:
  - "/docs/advanced/handles/"
  - "/docs/deep/handles/"
---

A Fluid handle is an object that holds a reference to a collaborative object, such as a [DataObject]({{< relref "glossary.md#data-object" >}}) or a [distributed
data structure]({{< relref "glossary.md#distributed-data-structures-ddses" >}}) (DDS).

The primary use case for handles in the Fluid Framework is for storing a DDS or DataObject into another DDS.
This section covers how to consume and use Fluid handles.

## Why use Fluid handles?

- Shared objects, such as Data Objects or DDSes, cannot be stored directly in another DDS. There are two primary
  reasons for this:

  1. Content stored in a DDS needs to be serializable. Complex objects and classes should never be directly stored in
     a DDS.
  2. Frequently the same shared object (not merely a copy) has to be available in different DDSes. The only
     way to make this possible is to store *references* (which is what a handle is) to the collaborative objects in
     the DDSes.

- Handles encapsulate where the underlying object instance exists within the Fluid runtime and how to retrieve it.
  This reduces the complexity from the caller by abstracting away the need to know how to make a `request` to the
  Fluid runtime to retrieve the object.

- Handles enable the underlying Fluid runtime to build a dependency hierarchy. This will enable us to add garbage
  collection to the runtime in a future version.

## Basic Scenario

Given a SharedMap DDS `myMap`, and a SharedString DDS `myText`, we want to store `myText` as a value in `myMap`. Because
we now know we can't directly store one DDS object in another DDS, we need to store a handle to `myText` then use that handle
to retrieve the `myText` SharedString.

In practice this looks like the following. Note that you don't have to construct the handle. The `create` method of the
DDS does that for you and assigns it to the `handle` property of the DDS.

```typescript
const myMap = SharedMap.create(this.runtime);
const myText = SharedString.create(this.runtime);
myMap.set("my-text", myText.handle);
```

The handle object itself has an async function `get()` that returns the underlying object. In this case the `myText`
SharedString instance.

Retrieving the object from the handle looks like this:

```typescript
const textHandle = myMap.get("my-text");
const text = await textHandle.get();
```

Because we store handles to our collaborative objects, and not the objects themselves, the handle can be passed around in
the system and anyone who has it can easily get the underlying object by simply calling `get()`. This means that if we have
a second SharedMap called `myMap2` it can also store the same `myText` SharedString instance.

```typescript
const myMap = SharedMap.create(this.runtime);
const myMap2 = SharedMap.create(this.runtime);
const myText = SharedString.create(this.runtime);

myMap.set("my-text", myText.handle);
myMap2.set("my-text", myText.handle);

const text = await myMap.get("my-text").get();
const text2 = await myMap2.get("my-text").get();

console.log(text === text2) // true
```

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Distributed Data Structures -->

[SharedCounter]: {{< relref "/docs/data-structures/counter.md" >}}
[SharedMap]: {{< relref "/docs/data-structures/map.md" >}}
[SharedSequence]: {{< relref "/docs/data-structures/sequences.md" >}}
[SharedString]: {{< relref "/docs/data-structures/string.md" >}}

<!-- API links -->

[fluid-framework]: {{< relref "/docs/apis/fluid-framework.md" >}}
[@fluidframework/azure-client]: {{< relref "/docs/apis/azure-client.md" >}}
[@fluidframework/tinylicious-client]: {{< relref "/docs/apis/tinylicious-client.md" >}}

[AzureClient]: {{< relref "/docs/apis/azure-client/AzureClient-class.md" >}}
[TinyliciousClient]: {{< relref "/docs/apis/tinylicious-client/TinyliciousClient-class.md" >}}

[FluidContainer]: {{< relref "/docs/apis/fluid-static/fluidcontainer-class.md" >}}
[IFluidContainer]: {{< relref "/docs/apis/fluid-static/ifluidcontainer-interface.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
