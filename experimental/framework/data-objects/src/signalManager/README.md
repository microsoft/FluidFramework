**_Documentation is a work-in-progress_**

## SignalManager
The `SignalManager` is a DataObject that can be used to communicate transient data via signals.

### Usage
`SignalManager` is the most appropriate tool to share transient data using Fluid.  Transient data refers to short-lived and impermanent information that is not required to be persisted.

User presence scenarios are key examples of situations where sending transient data is of interest, as users are required to tell other users their own information and their past data is mostly irrelavant. Using `SignalManager` over other distributed data strucurtes in these scenarios is beneficial, as it's usage does not result in the storage of data that is not useful in the long-term.


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
_TODO_
