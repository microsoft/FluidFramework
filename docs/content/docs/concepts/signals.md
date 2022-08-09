---
title: Signals and Signaler
menuPosition: 6
draft: true
aliases:
  - "/docs/advanced/signals/"
  - "/docs/deep/signals/"
---

When using DDSes, data is sequenced and stored within the Fluid container to achieve synchronized shared state. For scenarios that involve shared persisted data, DDSes provide an effective way to communicate data so that it is retained in the container. However, there could be many scenarios where we need to communicate data that is short-lived, in which the ordering and storage of said information would be wasteful and unnecessary. For instance, displaying the currently selected object of each user is an example of short-lived information in which the past data is mostly irrelevant.

Signals provide an appropriate channel for transmitting transient data, since the information that is communicated via signals is not retained in the container. Signals are not guaranteed to be ordered on delivery relative to other signals and ops, but they still provide a useful communication channel for impermanent and short-lived data.

## Why are signals useful?
Signals provide a communication channel for sharing short-lived information that does not need to be persisted in the Fluid container.

By sending signals, you avoid the storage and sequencing of data that will not be relevant or useful in the long-term.

Signals are the most appropriate data channel in many user presence scenarios, where each user has the responsibility of sharing their current presence state to other connected users. In these scenarios, current presence data is short-lived, past presence state is irrelevant, and the shared data is not persisted on disconnect.

## How can I use signals in Fluid?
The [Signaler](https://github.com/microsoft/FluidFramework/tree/main/experimental/framework/data-objects/src/signaler) DataObject can be used to send communications via signals in a Fluid application. `Signaler` allows clients to send signals to other connected clients and add/remove listeners for specified signal types.

### Creation
Just like with DDSes, you can include `Signaler` as a shared object you would like to load in your [FluidContainer](https://fluidframework.com/docs/build/containers/) schema.

Here is a look at how you would go about loading `Signaler` as part of the initial objects of the container:

```typescript
const containerSchema: ContainerSchema = {
    initialObjects: {
        signaler: Signaler,
    },
};

const { container, services } = await client.createContainer(containerSchema);

const signaler = container.initialObjects.signaler as Signaler;
```
`signaler` can then be directly used in your Fluid application!

For more information on using `ContainerSchema` to create objects please see [Data modeling](https://fluidframework.com/docs/build/data-modeling/).

### API
`Signaler` provides a few simple methods to send signals and add/remove listeners to specific signals as well:
- `submitSignal(signalName: string, payload?: Jsonable)` - Sends a signal with a payload to its connected listeners
- `onSignal(signalName: string, listener: SignalListener)` - Adds a listener for the specified signal. Similar behavior as EventEmitter's `on` method.
- `offSignal(signalName: string, listener: SignalListener)` - Removes a listener for the specified signal. Similar behavior as EventEmitter's `off` method.

### Common Patterns
#### Signal Request
When a client joins a collaboration session, they may need to receive information about the current state immediately after connecting the container.  To support this, they can request a specific signal be sent to them from other connected clients. For example, in the [PresenceTracker](https://github.com/microsoft/FluidFramework/tree/main/examples/data-objects/presence-tracker) example we define a "focusRequest" signal type that a newly joining client uses to request the focus-state of each currently connected client:

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
This pattern adds cost however, as it forces every connected client to generate a signal.  Consider whether your scenario can be satisfied by receiving the signals naturally over time instead of requesting the information up-front. The mouse tracking in [PresenceTracker](https://github.com/microsoft/FluidFramework/tree/main/examples/data-objects/presence-tracker) is an example where a newly connecting client does not request current state. Since mouse movements are frequent, the newly connecting client can instead simply wait to receive other users' mouse positions on their next mousemove event.
#### Grouping Signal Types

Rather than submitting multiple signals in response to an event, it is more cost-effective to submit one combined signal for that event and listen to that single signal instead. For example, imagine an application using the `Signal Request` pattern where a newly connected client requests the color, focus state, and currently selected object of every other connected client on the page. If you submit a signal for each type of data requested, it would look something like this:

```typescript
container.on("connected", () => {
    this.signaler.submitSignal("colorRequest");
    this.signaler.submitSignal("focusRequest");
    this.signaler.submitSignal("currentlySelectedObjectRequest");
});
```
```typescript
this.signaler.onSignal("colorRequest", (clientId, local, payload) => {
    /*...*/
});
this.signaler.onSignal("focusRequest", (clientId, local, payload) => {
    /*...*/
});
this.signaler.onSignal("currentlySelectedObject", (clientId, local, payload) => {
    /*...*/
});
```

Each of the _N_ connected clients would then respond with 3 signals as well (3*N* signals total).  To bring this down to _N_ signals total, we can group these requests into a single request that captures all the required information:

```typescript
container.on("connected", () => {
    this.signaler.submitSignal("connectRequest");
});
```
```typescript
this.signaler.onSignal("connectRequest", (clientId, local, payload) => {
    /*...*/
});
```

The payload sent back in response to the `connectRequest` should include all the relevant information the newly connected user needs.
