# Signaler

The `Signaler` is a DataObject that can be used to communicate transient data via signals. Transient data refers to impermanent information that is not persisted with the container.

## Usage

User presence scenarios are well-suited for `Signaler`, as users are required to tell other users their own information and their past data is mostly irrelavant. Using `Signaler` over other distributed data structures in these scenarios is beneficial, as its usage does not result in the storage of data that is not useful in the long-term.

### Creation

Just like with DDSes, you can include `Signaler` as a shared object you would like to load in your `FluidContainer` schema.

Here is a look at how you would go about loading `Signaler` as part of the initial objects of the container:

```typescript
const containerSchema: ContainerSchema = {
	initialObjects: {
		signaler: Signaler,
	},
};

const { container, services } = await client.createContainer(containerSchema);

const signaler = container.initialObjects.signaler; // type is ISignaler
```

`signaler` can then be directly used in your Fluid application!

For more information on using `ContainerSchema` to create objects please see [Data modeling](https://fluidframework.com/docs/build/data-modeling/).

## API

`ISignaler` provides a few simple methods to send signals and add/remove listeners to specific signals as well:

-   `submitSignal(signalName: string, payload?: Jsonable)` - Sends a signal with a payload to its connected listeners
-   `onSignal(signalName: string, listener: SignalListener)` - Adds a listener for the specified signal. Same behavior as EventEmitter's `on` method.
-   `offSignal(signalName: string, listener: SignalListener)` - Removes a listener for the specified signal. Same behavior as EventEmitter's `off` method.

## Common Patterns

### Signal Request

When a client joins a collaboration session, they may need to receive pertinent information immediately after connecting the container. To support this, they can request a specific signal be sent to them from other connected clients within the application. For example, in the [PresenceTracker](https://github.com/microsoft/FluidFramework/tree/main/examples/apps/presence-tracker) we define a "focusRequest" signal type that a newly joining client uses to request the focus-state of each currently connected client:

```typescript
private static readonly focusRequestType = "focusRequest";
```

```typescript
container.on("connected", () => {
	this.signaler.submitSignal(FocusTracker.focusRequestType);
});
```

The connected clients are listening to this focus request signal, and they respond with their current focus state:

```typescript
this.signaler.onSignal(FocusTracker.focusRequestType, () => {
	this.sendFocusSignal(document.hasFocus());
});
```

When there are a lot of connected clients, usage of this request pattern can lead to high signal costs incurred from large amounts of signals being submitted all at the same time. While this pattern is helpful when a client is in need of relevant information, to limit signal costs it would be beneficial to examine whether or not the requested data will be quickly avaiable from other events being listened to within the application. The mouse tracking in [PresenceTracker](https://github.com/microsoft/FluidFramework/tree/main/examples/apps/presence-tracker) is an example where a newly connecting client is not required to request a signal to receive every current mouse position on the document. Since mouse movements are frequent, the newly connecting client can simply wait to recieve other users mouse positions on their mousemove events.

### Grouping Signal Types

Rather than submitting multiple signal types in response to one specific event, it is more cost-effective to create one seperate signal type for that particular event and listen to that single signal instead. For example, imagine an application using the `Signal Request` pattern where a newly connected client requests for the color, focus state, and currently selected object of every other connected client on the page. If you submit a signal for each type of data requested, it would look something like this:

```typescript
container.on("connected", () => {
	this.signaler.submitSignal("colorRequest");
	this.signaler.submitSignal("focusRequest");
	this.signaler.submitSignal("currentlySelectedObjectRequest");
});
```

This approach is costly since the amount of signals sent back on request grows linearly with the amount of connected users. So if there are three signals requested as opposed to one, there are 3 times as many total signals being submitted on every connect. To avoid this costly scenario we can group the signal types into one single signal that captures all the required information:

```typescript
container.on("connected", () => {
	this.signaler.submitSignal("connectRequest");
});
```

The idea is that the payload sent back on the `connectRequest` will include all the relevant information the newly connected user needs.
