---
title: Handles
menuPosition: 1
draft: false
---

A Fluid handle is any JavaScript object that implements the [IFluidHandle](/apis/core-interfaces/ifluidhandle) interface.
A handle is just a reference and the primary use case for handles in the Fluid Framework is for storing collaborative
objects (Ex. Fluid objects or Distributed Data Structures (DDSes)) into other DDSes.

A example is if we have a SharedMap `myMap` and want to store a SharedString `myText` as a value. The SharedString
instance lives within the Fluid Runtime and we don't want to store the object itself. What we want is to be able to get
the SharedString instance from our SharedMap later. So instead of storing the SharedString we will store a handle to the
SharedString so we can retrieve it later.

In practice this looks like:

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

### Why use Fluid handles?

- You should **always** use handles to represent collaborative objects and you should store the handles in a DDSes. This
  allows the Fluid runtime to manage the lifetime of the object and perform important operations such as garbage collection.
  Objects that are not referenced by a handle are subject to garbage collection.

  The exception to this is when the object has to be handed off to an external entity. For example, when copy/pasting
  an object, the URL of the object should be handed off to the destination so that it can request the object from the
  source Loader or the Container. In this case, it is the responsibility of the code managing the copy/paste to ensure
  the object is not garbage collected by storing its handle somewhere.

- With handles, the user doesn't have to worry about how to get the underlying object since that itself can differ in
  different scenarios. It is the responsibility of the handle to retrieve the object and return it.

  For example, the handle for a `PureDataObject` simply returns the underlying object. But when this handle is stored in
  a DDS so that it is serialized and then de-serialized in a remote client, it is represented by a _remote handle_.
  The remote handle only has the absolute url to the object, requests the object from the root, and then returns it.

### Scenarios

The following examples outline the uses of handles to retrieve the underlying object in different scenarios.

#### Storing DDSes on the DataObject `root`

When developing a Fluid object from a `DataObject` you will often find yourself wanting to create and store new DDSes. We
want to ensure that the `SharedMap` is only created once but all users of this object have access to it. We can do that by
creating the map

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

#### Storing other DataObjects

One of the advanced uses of a Fluid handle is creating and storing other DataObjects within the DataObject `root`. We can
do this the same as a DDS by storing the handle to the Fluid object then later using that to retrieve the handle and
`get` the object.

The following code snippet from the
[Pond](https://github.com/microsoft/FluidFramework/blob/main/examples/data-objects/pond/src/index.tsx) DataObject
demonstrates this. It creates a Clicker object (which is a DataObject) during first time initialization and stores its
handle in the root SharedDirectory. Any remote client can retrieve the handle from the root and get the Clicker by
calling `get()` on the handle:

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

### How to create a handle

A handle's primary job is to be able to return the collaborative object it is representing when `get` is called. So, it
needs to have access to the object either by directly storing it or by having a mechanism to retrieve it when asked. The
creation depends on the uses and the implementation.

For example, it can be created with the absolute URL of the object and a routeContext which knows how to get the
object via the URL. When `get()` is called, it can request the object from the routeContext by providing the URL. This
is how the [remote handle][] retrieves the underlying object.
