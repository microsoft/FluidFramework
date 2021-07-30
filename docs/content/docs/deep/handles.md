---
title: Handles
menuPosition: 5
status: outdated
aliases:
  - "/docs/advanced/handles/"
---

A Fluid handle is an object that holds a reference to a collaborative object, such as a [DataObject][] or a distributed
data structure (DDS).

The primary use case for handles in the Fluid Framework is for storing a [DataObject][], or a DDS, into another DDS.
This section covers how to consume and use Fluid handles.

## Why use Fluid handles?

- Collaborative objects, such as Fluid objects or DDSes, cannot be stored directly in another DDS. There are two primary
  reasons for this:

  1. Content stored in a DDS needs to be serializable. Complex objects and classes should never be directly stored in
     a DDS.
  2. Frequently the same collaborative object (not merely a copy) has to be available in different DDSes. The only
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

## Scenarios in Practice

The following examples outline the uses of handles to retrieve the underlying object in different scenarios.

### Storing DDSes on the DataObject `root`

When developing a Fluid object from a `DataObject` you will often find yourself wanting to create and store new DDSes.
In the scenario below we want to create a new `SharedMap` that all users have access to, and we also want to ensure it
is only created once. We can do that by creating a new SharedMap in our `initializingFirstTime` lifecycle method and
storing it on our `root` SharedDirectory. The `initializingFirstTime` function in the `DataObject` only runs the first
time our `MyFluidObject` is ever created. The `hasInitialized` lifecycle method runs every time `MyFluidObject` instance
is initialized and we can use this to get and store our SharedMap locally in the class.

```typescript
export class MyFluidObject extends DataObject {
  public myMap;

  protected async initializingFirstTime() {
      const map = await SharedMap.create(this.runtime)
      this.root.set("map-id", map.handle);
  }

  protected async hasInitialized() {
      this.myMap = await this.root.get<IFluidHandle<SharedMap>>("map-id").get();
  }
}
```

### Storing other DataObjects

One of the advanced uses of a Fluid handle is creating and storing other DataObjects within the DataObject `root`. We
can do this the same as a DDS by storing the handle to the Fluid object then later using that to retrieve the handle and
`get` the object.

The following code snippet from the
[Pond](https://github.com/microsoft/FluidFramework/blob/main/examples/data-objects/pond/src/index.tsx) DataObject
demonstrates this. It creates a Clicker object (which is a DataObject) during first time initialization and stores its
handle in the root SharedDirectory. By following the convention of using the Fluid object's name as the key for the
handle, you enable any remote client to retrieve the handle from the root and get the Clicker by calling `get()` on the
handle:

```typescript
// ...

protected async initializingFirstTime() {
    // The first client creates `Clicker` and stores the handle in the `root` DDS.
    const clickerObject = await Clicker.getFactory().createChildInstance(this.context);
    this.root.set(Clicker.Name, clickerObject.handle);
}

protected async hasInitialized() {
    // The remote clients retrieve the handle from the `root` DDS and get the `Clicker`.
    const clicker = await this.root.get<IFluidHandle>(Clicker.Name).get();
    this.clickerView = new HTMLViewAdapter(clicker);
}

// ...
```

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers-runtime.md" >}}

<!-- Packages -->

[Aqueduct]: {{< relref "/docs/apis/aqueduct.md" >}}
[fluid-framework]: {{< relref "/docs/apis/fluid-framework.md" >}}

<!-- Classes and interfaces -->

[ContainerRuntimeFactoryWithDefaultDataStore]: {{< relref "/docs/apis/aqueduct/containerruntimefactorywithdefaultdatastore.md" >}}
[DataObject]: {{< relref "/docs/apis/aqueduct/dataobject.md" >}}
[DataObjectFactory]: {{< relref "/docs/apis/aqueduct/dataobjectfactory.md" >}}
[Ink]: {{< relref "/docs/apis/ink/ink.md" >}}
[PureDataObject]: {{< relref "/docs/apis/aqueduct/puredataobject.md" >}}
[PureDataObjectFactory]: {{< relref "/docs/apis/aqueduct/puredataobjectfactory.md" >}}
[Quorum]: {{< relref "/docs/apis/protocol-base/quorum.md" >}}
[SharedCell]: {{< relref "/docs/apis/cell/sharedcell.md" >}}
[SharedCounter]: {{< relref "SharedCounter" >}}
[SharedDirectory]: {{< relref "/docs/apis/map/shareddirectory.md" >}}
[SharedMap]: {{< relref "/docs/apis/map/sharedmap.md" >}}
[SharedMatrix]: {{< relref "SharedMatrix" >}}
[SharedNumberSequence]: {{< relref "SharedNumberSequence" >}}
[SharedObjectSequence]: {{< relref "/docs/apis/sequence/sharedobjectsequence.md" >}}
[SharedSequence]: {{< relref "SharedSequence" >}}
[SharedString]: {{< relref "SharedString" >}}

<!-- Sequence methods -->

[sequence.insert]: {{< relref "/docs/apis/sequence/sharedsequence.md#sequence-sharedsequence-insert-Method" >}}
[sequence.getItems]: {{< relref "/docs/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[sequence.remove]: {{< relref "/docs/apis/sequence/sharedsequence.md#sequence-sharedsequence-getitems-Method" >}}
[sequenceDeltaEvent]: {{< relref "/docs/apis/sequence/sequencedeltaevent.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
