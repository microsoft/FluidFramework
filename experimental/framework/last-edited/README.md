# @fluid-experimental/last-edited

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

# Last Edited Tracker Data Store

LastEditedTrackerDataObject is a runtime data store built on top of the LastEditedTracker. It creates and manages the SharedSummaryBlock so that the developer doesn't have to know about it or manage it.

It implements IProvideFluidLastEditedTracker and returns an IFluidLastEditedTracker which is an instance of LastEditedTracker above.

# Setup

This package also provides a `setupLastEditedTrackerForContainer` method that can be used to set up a data store that provides IFluidLastEditedTracker to track last edited in a Container:

-   This setup function should be called during container instantiation so that ops are not missed.
-   Registers an "op" listener on the runtime. On each message, it calls the shouldDiscardMessageFn to check if the message should be discarded. It also discards all scheduler message. If a message is not discarded, it passes the last edited information from the message to the last edited tracker in the data store.

Note:

-   By default, message that are not of `"Attach"` and `"Operation"` type are discarded as per the `shouldDiscardMessageDefault` function:

```
function shouldDiscardMessageDefault(message: ISequencedDocumentMessage) {
    if (message.type === MessageType.Attach || message.type === MessageType.Operation) {
        return false;
    }
    return true;
}.
```

-   To discard specific ops, provide the `shouldDiscardMessageFn` funtion that takes in the message and returns a boolean indicating if the message should be discarded.

# Usage

## For tracking the last edit on a Container:

In instantiateRuntime, create a data store that implements IFluidLastEditedTracker. Then call `setupLastEditedTrackerForContainer` with the id of the data store:

```
public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const dataStoreId = "root";

    // Create the ContainerRuntime
    const runtime = await ContainerRuntime.load(...);

    if (!runtime.existing) {
        // On first boot create the root data store with id `dataStoreId`.
        await runtime.createDataStore(dataStoreId, "lastEditedTracker");
    }

    setupLastEditedTrackerForContainer(dataStoreId, runtime);

    return runtime;
}
```

This will make sure that the root data store loads before any other data store and it tracks every op in the Container.

The IFluidLastEditedTracker can be retrieved from the root data store:

```
const response = await containerRuntime.request({ url: "/" });
const root = response.value;
const lastEditedTracker = root.IFluidLastEditedTracker;
```

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
