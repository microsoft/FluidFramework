# SignalManager
The `SignalManager` is a DataObject that can be used to communicate transient data via signals. Transient data refers to impermanent information that is not persisted with the container.

### Usage

User presence scenarios are well-suited for `SignalManager`, as users are required to tell other users their own information and their past data is mostly irrelavant. Using `SignalManager` over other distributed data structures in these scenarios is beneficial, as its usage does not result in the storage of data that is not useful in the long-term.


### Creation
Just like with DDSes, the `FluidContainer` provides a container schema where you can include `SignalManager` as a shared object you would like to load.

Here is a look at how you would go about loading `SignalManager` as part of the initial objects of the container:

```typescript
const containerSchema: ContainerSchema = {
    initialObjects: {
        signalManager: SignalManager,
    },
};

const { container, services } =  await client.createContainer(containerSchema);

const signalManager = container.initialObjects.signalManager as SignalManager
```

`signalManager` can then be directly used in your Fluid application!

If you are loading an existing container the process is the same except you would use `getContainer` instead of `createContainer`:

```typescript
const containerSchema: ContainerSchema = {
    initialObjects: {
        signalManager: SignalManager,
    },
};

const { container, services } =  await client.getContainer(id, containerSchema);

const signalManager = container.initialObjects.signalManager as SignalManager
```


To dynamically create `SignalManager` instances it is the same process as with DDSes as well. You add the `SignalManager` type to `dynamicObjectTypes` in the container schema and then use the `create` function on the container:

```typescript
const containerSchema: ContainerSchema = {
    /*...*/
    dynamicObjectTypes: [ SignalManager ]
};

const { container, services } =  await client.getContainer(id, containerSchema);

const newSignalManager = await container.create(SignalManager) //Creates a new SignalManager instance
```



### API
`SignalManager` provides a few simple methods to send signals and add/remove listeners to specific signals as well:
- `submitSignal(signalName: string, payload?: Jsonable)` - Sends a signal with a payload to its connected listeners
- `onSignal(signalName: string, listener: SignalListener)` - Adds a listener for the specifies signal. Same behavior as EventEmitter's `on` method.
- `offSignal(signalName: string, listener: SignalListener | ((message: any) => void))` - Removes a listener for the specified signal. Same behavior as EventEmitter's `off` method.




### Common Patterns
#### Signal Request
There are some scenarios where a client would like to request a specific signal be sent to them from other connected clients within the application. One main use case for this pattern is when a newly joining client needs to recieve pertinent information immediatley after connecting the container. For example, in the [FocusTracker](https://github.com/microsoft/FluidFramework/tree/main/examples/data-objects/focus-tracker) we define a new focus request signal type that is used when a newly joining client requests to recieve the focus-state of each currently connected client:

```typescript
 private static readonly focusRequestType = "focusRequest";
```

```typescript
container.on("connected", () => {
            this.signalManager.submitSignal(FocusTracker.focusRequestType);
        });
```

We then must have the connected clients listening to this focus request signal, so they can respond with their current focus state:

```typescript
this.signalManager.onSignal(FocusTracker.focusRequestType, () => {
            this.sendFocusSignal(document.hasFocus());
        });
```
To reiterate, this pattern is not necessary for all use cases but it can be helpful when a client is in need of relevant information that won't be quickly available from other events being listened to.
