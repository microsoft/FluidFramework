# Last Edited Tracker

LastEditedTracker tracks the last edit to a document, such as the client who last edited the document and the time it happened.

It is created by passing a `SharedSummaryBlock`:
```
constructor(private readonly sharedSummaryBlock: SharedSummaryBlock);
```
It uses the SharedSummaryBlock to store the last edit details.

## API

It provides the following APIs to get and update the last edit details:

```
public getLastEditDetails(): ILastEditDetails | undefined;
public updateLastEditDetails(message: ISequencedDocumentMessage);
```

The update should always be called in response to a remote op because:
1. It updates its state from the remote op.
2. It uses a SharedSummaryBlock as storage which must be set in response to a remote op.

The details returned in getLastEditDetails contain the `IUser` object and the `timestamp` of the last edit.

# Last Edited Tracker Component

LastEditedTrackerComponent is a runtime component built on top of the LastEditedTracker. It creates and manages the SharedSummaryBlock so that the developer doesn't have to know about it or manage it.

It implements IProvideComponentLastEditedTracker and returns an IComponentLastEditedTracker which is an instance of LastEditedTracker above.

# Setup

This package also provides a `setupLastEditedTrackerForContainer` method that can be used to set up a component that provides IComponentLastEditedTracker to track last edited in a Container:
```
async function setupLastEditedTrackerForContainer(
    componentId: string,
    runtime: IContainerRuntime,
    shouldDiscardMessageFn: (message: ISequencedDocumentMessage) => boolean = shouldDiscardMessageDefault,
)
```

- The component with id "componentId" must implement an IComponentLastEditedTracker.
- This setup function should be called during container instantiation so that ops are not missed.
- Requests the root component from the runtime and waits for it to load.
- Registers an "op" listener on the runtime. On each message, it calls the shouldDiscardMessageFn to check if the message should be discarded. It also discards all scheduler message. If a message is not discarded, it passes the last edited information from the message to the last edited tracker in the component.
- The last edited information from the last message received before the component is loaded is stored and passed to the tracker once the component loads.

Note:
- By default, message that are not of `"Attach"` and `"Operation"` type are discarded as per the `shouldDiscardMessageDefault` function:
```
function shouldDiscardMessageDefault(message: ISequencedDocumentMessage) {
    if (message.type === MessageType.Attach || message.type === MessageType.Operation) {
        return false;
    }
    return true;
}.
```
- To discard specific ops, provide the `shouldDiscardMessageFn` funtion that takes in the message and returns a boolean indicating if the message should be discarded.

# Usage

## For tracking the last edit on a Container:

In instantiateRuntime, create a component that implements IComponentLastEditedTracker. Then call `setupLastEditedTrackerForContainer` with the id of the component:
```
public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const componentId = "root";

    // Create the ContainerRuntime
    const runtime = await ContainerRuntime.load(...);

    if (!runtime.existing) {
        // On first boot create the root component with id `componentId`.
        await runtime.createComponent(componentId, "lastEditedTracker");
    }

    setupLastEditedTrackerForContainer(componentId, runtime)
        .catch((error) => {
            throw error;
        });

    return runtime;
}
```

This will make sure that the root component loads before any other component and it tracks every op in the Container.

The IComponentLastEditedTracker can be retrieved from the root component:
```
const response = await containerRuntime.request({ url: "/" });
const rootComponent = response.value;
const lastEditedTracker = rootComponent.IComponentLastEditedTracker;
```
