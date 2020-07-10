# Component Handles

A Component Handle (`IComponentHandle`) is a handle to a fluid object like a `Component` or a `SharedObject` (DDS). It can be used to represent the object in the system and has the capability to get the underlying object by calling `get()` on it.

There are two major interfaces required to implement a Component Handle: `IComponentHandle` and `IComponentHandleContext`. These are defined [here](../../packages/loader/component-core-interfaces/src/handles.ts).


## Why use Component Handles?
Component Handle moves the ownership of retrieving a fluid object from the user of the object to the object itself. The handle can be passed around in the system and anyone who has the handle can easily get the underlying object by simply calling `get()`.

The alternative is to get the `url` of the `Component` / `SharedObject` and then calling `request` with it on the right layer (for instance, on the `ContainerRuntime`) that has this object.

Handles simplify this by encoding the logic within the object itself thereby eliminating the need to get the `url` and to find the right layer to `request` the object off of which in some case may not be straightforward.

A Component developer might not (and need not) care about the underlying `ContainerRuntime`, but has to know about it to load a `Component`. With handles, they don't really have to, since the logic is self contained in the `Component` itself.

### Basic usage scenario
One of the basic usage of a Component Handle is when a client creates a `Component` or a `SharedObject` and wants it to be available to remote clients. It can store the handle to the object in a DDS and the remote client can retrieve and load the Component.

The following code snippet from the [Pond](../../components/examples/pond/src/index.tsx) Component demonstrates this. It creates a `Clicker` Component during first time initialization and stores its `handle` in the `root` DDS. Remote clients can retrieve the `handle` from the `root` DDS and get the `Clicker` Component by calling `get()` on the handle:

```typescript
protected async componentInitializingFirstTime() {
    // The first client creates `Clicker` and stores the handle in `root`.
    const clickerComponent = await Clicker.getFactory().createComponent(this.context);
    this.root.set(Clicker.ComponentName, clickerComponent.handle);
}

protected async componentHasInitialized() {
    // The remote clients retrieve the handle from `root` and get the `Clicker`.
    const clicker = await this.root.get<IComponentHandle>(Clicker.ComponentName).get();
    this.clickerView = new HTMLViewAdapter(clicker);
}
```

### A more complex usage scenario
In simple scenarios where there is only one Container, using the `request` model might be okay because any `Component` that wants to load another `Component` or `SharedObject`, can call `request` with the `url` on its own `ContainerRuntime`.

But consider the scenario where there are multiple `Containers` and a `Component` wants to load another `Component`. In order to `request` the `Component` using its `url`, it has to know which `Container` has this `Component`. It can become real complicated real fast as the number of `Components` and `Containers` grow.

This is where Compponent Handles becomes really powerful and make this scenario much simpler. You can pass around the `handle` to a `Component` across `Containers` and to load it from anywhere, you just have to call `get()` on it.

### Request format
Another advantage of using handles is that the user doesn't have to worry about creating an input with the right format to pass to `request`. This format may vary from one implementation to another. Component Handle takes care of this and the user code can be agnostic to the underlying implementation, thereby making it more flexible and portable.

## Example implementations
[ComponentHandle](../../packages/runtime/component-runtime/src/componentHandle.ts) is an implementation of `IComponentHandle` for representing a [SharedComponent](../../packages/framework/aqueduct/src/components/sharedComponent.ts).

[SharedObjectComponentHandle](../../packages/dds/shared-object-base/src/handle.ts) is an implementation of `IComponentHandle` for representing a [SharedObject](../../packages/dds/shared-object-base/src/sharedObject.ts).

[RemoteComponentHandle](../../packages/runtime/runtime-utils/src/remoteComponentHandle.ts) is used to represent one of the above Component Handles on a rmeote client when it is stored inside of a DDS.