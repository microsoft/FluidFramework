# Introducing distributed data structures

::: danger

OUTDATED

:::

Much of Fluid's power lies in a set of base primitives called distributed data structures. These data structures, such
as [SharedMap](./SharedMap.md) and the various types in the @fluidframework/sequence package, are eventually consistent.
The Fluid runtime manages these data structures; as changes are made locally and remotely, they are merged in seamlessly
by the runtime.

When you're working with a DDS, you can largely treat it as a local object. You can make changes to it as needed.
However, this local object can be changed not only by your local code, but also by the Fluid runtime. The Fluid runtime
is responsible for inbounding changes from the server and then replaying those changes locally. This means your code
should be structured to react to changes to the DDS instances and update accordingly.

As you make changes to the local DDS instance, the changes are sent to the Fluid server. Other clients are notified of
the change -- or they can query the server for changes -- and then merge the changes in locally. All of this is managed
by the Fluid runtime.

The quality of eventual consistency improves performance because local changes can be made optimistically, knowing that
the runtime will merge the change in the appropriate way eventually. This is a guarantee made by the Fluid runtime.
Thus, you need not check for changes prior to 'committing' local changes. If there are changes on the server, they will
be retrieved and merged in seamlessly, and events will be emitted by the data structures, allowing your code to react to
the changes if needed. And this all happens _very_ quickly.

There are cases, however, where the eventually consistent guarantee is insufficient. In these cases, the consensus data
structures are useful. These types of data structures defer applying operations until they're acknowledged by the
server. This ensures that each client `.pop`s a different value from a stack, for example.

## Creating and storing distributed data structures

### Storing a DDS within another DDS

## Handles

A [Fluid Handle](../../packages/loader/core-interfaces/src/handles.ts) is a handle to a `fluid object`. It is
used to represent the object and has a function `get()` that returns the underlying object. Handles move the ownership
of retrieving a `fluid object` from the user of the object to the object itself. The handle can be passed around in the
system and anyone who has the handle can easily get the underlying object by simply calling `get()`.

### Why use Fluid Handles?

- You should **always** use handles to represent `fluid objects` and store them in a Distributed Data Structure (DDS).
  This tells the runtime, and the storage, about the usage of the object and that it is referenced. The runtime /
  storage can then manage the lifetime of the object, and perform important operations such as garbage collection.
  Otherwise, if the object is not referenced by a handle, it will be garbage collected.

  The exception to this is when the object has to be handed off to an external entity. For example, when copy / pasting
  an object, the `url` of the object should be handed off to the destination so that it can request the object from the
  Loader or the Container. In this case, it is the responsiblity of the code doing so to manage the lifetime to this
  object / url by storing the handle somewhere, so that the object is not garbage collected.

- With handles, the user doesn't have to worry about how to get the underlying object since that itself can differ in
  different scenarios. It is the responsibility of the handle to retrieve the object and return it.

  For example, the [handle](../../packages/runtime/component-runtime/src/componentHandle.ts) for a `SharedComponent`
  simply returns the underlying object. But when this handle is stored in a DDS so that it is serialized and then
  de-seriazlied in a remote client, it is represented by a [remote
  handle](../../packages/runtime/runtime-utils/src/remoteComponentHandle.ts). The remote handle just has the absolute
  url to the object and requests the object from the root and returns it.

### How to create a handle?

A handle's primary job is to be able to return the `fluid object` it is representing when `get` is called. So, it needs
to have access to the object either by directly storing it or by having a mechanism to retrieve it when asked. The
creation depends on the usage and the implementation.

For example, it can be created with the absolute `url` of the object and a `routeContext` which knows how to get the
object via the `url`. When `get` is called, it can request the object from the `routeContext` by providing the `url`.
This is how the [remote handle](../../packages/runtime/runtime-utils/src/remoteComponentHandle.ts) retrieves the
underlying object.

### Usage

A handle should always be used to represent a fluid object. Following are couple of examples that outline the usage of
handles to retrieve the underlying object in different scenarios.

#### Basic usage scenario

One of the basic usage of a Fluid Handle is when a client creates a `fluid object` and wants remote clients to be able
to retrieve and load it. It can store the handle to the object in a DDS and the remote client can retrieve the handle
and `get` the object.

The following code snippet from the [Pond](../../components/examples/pond/src/index.tsx) Component demonstrates this. It
creates `Clicker` which is a SharedComponent during first time initialization and stores its `handle` in the `root` DDS.
Any remote client can retrieve the `handle` from the `root` DDS and get `Clicker` by calling `get()` on the handle:

```typescript
protected async componentInitializingFirstTime() {
    // The first client creates `Clicker` and stores the handle in the `root` DDS.
    const clickerComponent = await Clicker.getFactory().createComponent(this.context);
    this.root.set(Clicker.ComponentName, clickerComponent.handle);
}

protected async componentHasInitialized() {
    // The remote clients retrieve the handle from the `root` DDS and get the `Clicker`.
    const clicker = await this.root.get<IComponentHandle>(Clicker.ComponentName).get();
    this.clickerView = new HTMLViewAdapter(clicker);
}
```

#### A more complex scenario

Consider a scenario where there are multiple `Containers` and a `fluid object` wants to load another `fluid object`.

If the `request-response` model is used to acheive this, to `request` the object using its `url`, the object loading it
has to know which `Container` has this object so that it doesn't end up requesting it from the wrong one. It can become
real complicated real fast as the number of `Components` and `Containers` grow.

This is where Compponent Handles becomes really powerful and make this scenario much simpler. You can pass around the
`handle` to the `fluid object` across `Containers` and to load it from anywhere, you just have to call `get()` on it.


## Events

## Merge behavior

::: danger TODO

Merge behavior of each DDS is relevant to their usage.

:::

## Picking the right data structure

### Granularity of collaboration

::: danger TODO

This is important because it influences the data model.

:::

!!!include(links.md)!!!
