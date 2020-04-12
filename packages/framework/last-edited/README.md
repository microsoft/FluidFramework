# Last Edited Tracker

A tracker that tracks the last edit to a document, such as the client who last edited the document and the time it happened.

It has to be created by passing a `SummarizableObject`:
```
constructor(
    private readonly summarizableObject: SummarizableObject,
);
```
It uses the SummarizableObject to store the last edit details.

## API

It provides the following APIs to get and update the last edit details:

```
public getLastEditDetails(): ILastEditDetails | undefined;
public updateLastEditDetails(message: ISequencedDocumentMessage);
```

The update should always be called in response to a remote op because:
1. It updates its state from the remote op.
2. It uses a SummarizableObject as storage which must be set in response to a remote op.
3. The details returned in getLastEditDetails contain the clientId and the timestamp of the last edit.

## Events

It emits an `"lastEditedChanged"` event with ILastEditDetails whenever the details are updated:
```
public on(event: "lastEditedChanged", listener: (lastEditDetails: ILastEditDetails) => void): this;
```

## Setup

This package also provides a `setupLastEditedTracker` method that can be used to easily set up the tracker:
```
async function setupLastEditedTracker(
    componentId: string,
    runtime: IHostRuntime,
    shouldDiscardMessageFn: (message: ISequencedDocumentMessage) => boolean = shouldDiscardMessageDefault,
)
```

The function does the following:
- Requests the component with the componentId from the runtime and waits for it to load.
- Registers an "op" listener on the runtime. On each message, it calls the shouldDiscardMessageFn to check if the message should be discarded. It also discards all scheduler message. If a message is not discarded, it is passed to the last edited tracker in the component.
- Any messages received before the component is loaded are stored in a buffer and passed to the tracker once the component loads.

Note:
- The component with componentId must implement an IComponentLastEditedTracker.
- By default, message that are not of "Attach" and "Operation" type are discarded as per the shouldDiscardMessageDefault function:
```
function shouldDiscardMessageDefault(message: ISequencedDocumentMessage) {
    if (message.type === MessageType.Attach || message.type === MessageType.Operation) {
        return false;
    }
    return true;
}.
```
- To discard specific ops, provide the shouldDiscardMessageFn funtion that takes in the message and returns if it should be discarded.

## Usage

For tracking last edited in a Container:

In instantiateRuntime, create a root component that implements IComponentLastEditedTracker. Then call `setupLastEditedTracker` with the component id of the root component:
```
public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const rootComponentId = "root";

    // Create the ContainerRuntime
    const runtime = await ContainerRuntime.load(...);

    if (!runtime.existing) {
        // On first boot create the root component with rootComponentId.
        await runtime.createComponent(rootComponentId, "rootComponent");
    }

    setupLastEditedTracker(rootComponentId, runtime)
        .catch((error) => {
            throw error;
        });

    return runtime;
}
```

This will make sure that the root component loads before any other component and it tracks every op in the Container.

Any component in the Container can now get the root component and get ILastEditedTracker from it. It can then register for "lastEditedChanged" events on the tracker and get the details.
The following can be in the view implementation of a component:
```
const response = await this.context.hostRuntime.request({ url: "/");
const rootComponent = response.value;
const lastEditedTracker = rootComponent.IComponentLastEditedTracker.lastEditedTracker;

lastEditedTracker.on("lastEditedChanged", (lastEditDetails: ILastEditDetails) => {
    // Do something cool.
});
```

## Example

Vltava in examples demonstrates how LastEditedTracker can be implemented with a root component to track last edited in a document:
- [instantiateRuntime implementation that loads the root (Anchor) component](../../../examples/components/vltava/src/index.ts)
- [LastEditedViewer component that implements IComponentLastEditedTracker](../../../examples/components/vltava/src/components/last-edited/lastEditedViewer.tsx)
- [Root (Anchor) Component that creates and provides LastEditedViewer component via IProvideLastEditedTracker](../../../examples/components/vltava/src/components/anchor/anchor.ts)
- [Vltava view that gets the LastEditedTracker from the root and displays the last edited data](../../../examples/components/vltava/src/components/vltava/view.tsx)
