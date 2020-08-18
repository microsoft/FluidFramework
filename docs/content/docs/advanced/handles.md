## Handles

A [Fluid Handle](../../packages/loader/core-interfaces/src/handles.ts) is a handle to a _Fluid object_. It is
used to represent the object and has a function `get()` that returns the underlying object. Handles move the ownership
of retrieving a Fluid object from the user of the object to the object itself. The handle can be passed around in the
system and anyone who has the handle can easily get the underlying object by simply calling `get()`.

### Why use Fluid Handles?

- You should **always** use handles to represent Fluid objects and you should store the handles in a distributed data
  structure (DDS). This tells the runtime and the storage service that the object is referenced. The runtime / storage
  can then manage the lifetime of the object and perform important operations such as garbage collection. Objects that
  are not referenced by a handle are subject to garbage collection.

  The exception to this is when the object has to be handed off to an external entity. For example, when copy/pasting
  an object, the URL of the object should be handed off to the destination so that it can request the object from the
  source Loader or the Container. In this case, it is the responsiblity of the code managing the copy/paste to ensure
  the object is not garbage collected by storing its handle somewhere.

- With handles, the user doesn't have to worry about how to get the underlying object since that itself can differ in
  different scenarios. It is the responsibility of the handle to retrieve the object and return it.

  For example, the handle for a `PureDataObject` simply returns the underlying object. But when this handle is stored in
  a DDS so that it is serialized and then de-serialized in a remote client, it is represented by a [remote handle][].
  The remote handle just has the absolute url to the object and requests the object from the root and returns it.

### How to create a handle

A handle's primary job is to be able to return the Fluid object it is representing when `get` is called. So, it needs to
have access to the object either by directly storing it or by having a mechanism to retrieve it when asked. The creation
depends on the uses and the implementation.

For example, it can be created with the absolute URL of the object and a routeContext which knows how to get the
object via the URL. When `get()` is called, it can request the object from the routeContext by providing the URL. This
is how the [remote handle][] retrieves the underlying object.

### Scenarios for using handles

 The following examples outline the uses of handles to retrieve the underlying object in different scenarios.

#### Basic scenario

One of the basic uses of a Fluid handle is when a client creates a Fluid object and wants remote clients to be able
to retrieve and load it. It can store the handle to the object in a DDS and the remote client can retrieve the handle
and `get` the object.

The following code snippet from the
[Pond](https://github.com/microsoft/FluidFramework/tree/master/examples/data-objects/pond) DataObject demonstrates this.
It creates a Clicker object which is a DataObject during first time initialization and stores its handle in the root
SharedDirectory. Any remote client can retrieve the handle from the root and get the Clicker by calling `get()` on the
handle:

```typescript
protected async initializingFirstTime() {
    // The first client creates `Clicker` and stores the handle in the `root` DDS.
    const clickerObject = await Clicker.getFactory().create(this.context);
    this.root.set(Clicker.Name, clickerObject.handle);
}

protected async hasInitialized() {
    // The remote clients retrieve the handle from the `root` DDS and get the `Clicker`.
    const clicker = await this.root.get<IFluidHandle>(Clicker.Name).get();
    this.clickerView = new HTMLViewAdapter(clicker);
}
```

<!-- TODO: link to the reference docs below -->
For more information about root.get and HTMLViewAdapter, see SharedDirectory.get and HTMLViewAdapter]

#### A more complex scenario

Consider a scenario where there are multiple Containers and a Fluid object wants to load another Fluid object.

If the request/response model is used to achieve this, to request the object using its URL, the object loading it
has to know which Container has the object so that it doesn't end up requesting it from the wrong one. It can become
complicated quickly as the number of DataObjects and Containers grow.

This is where handles become really powerful and make this scenario much simpler. You can pass around the handle to
the DataObject across Containers and to load it from anywhere, you just have to call `get()` on it.


[remote handle]:
https://github.com/microsoft/FluidFramework/blob/master/packages/runtime/runtime-utils/src/remoteComponentHandle.ts
