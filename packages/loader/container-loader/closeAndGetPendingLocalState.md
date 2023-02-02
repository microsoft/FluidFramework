# closeAndGetPendingLocalState

Pending local state is a mechanism that Fluid provides for mitigating data loss, particularly in offline scenarios.
When changes are made in a Container, it puts the Container into a "dirty" state until the changes have been confirmed by the server.
If the Container is closed in this state, the changes may be lost if they did not reach the server (for example, if the user is offline).

`Container.closeAndGetPendingLocalState()` solves this problem by returning pending changes when closing a Container so they may be resupplied to a new container instance and resubmitted.

Additionally, the blob returned by closeAndGetPendingLocalState() contains enough data to load a container offline.
This method will still return a such a blob even if the container is not dirty when called.

## Using `Container.closeAndGetPendingLocalState()`

When closeAndGetPendingLocalState() is called it will return a serialized blob containing the necessary data to load and resubmit the changes in a new container.

The stashed changes blob can be used by passing it to `Loader.resolve()` when loading a new container.
The container will then automatically submit the stashed changes when the Container reaches the "connected" state, if the changes were not originally successful.

**It's important that these blobs are not reused, since it can result in the same changes being submitted multiple times, possibly resulting in document corruption.**
Instead, closeAndGetPendingLocalState() should be called again on the new container, which will return a new blob containing all its pending changes, including any still-pending stashed changes it was loaded with.

```ts
const myContainer = await myLoader.resolve(myRequest);
const pendingChanges = myContainer.closeAndGetPendingLocalState();
const myNewContainer = await myLoader.resolve(myRequest, pendingChanges);
```

Note that closeAndGetPendingLocalState() cannot be called on a Container that is already closed or disposed.
The purpose of closeAndGetPendingLocalState() is to avoid data loss when a dirty container must be closed, not recovering from internal Container errors.

## How it works

The blob contains ops and attachment blob uploads that were still pending whe the container was closed.
It also contains the container's last client ID, a snapshot older than the reference sequence number of the oldest pending op, and all sequenced ops the container has processed since the snapshot.

When the blob is supplied to `Loader.resolve()`, it will return a new container.
This container will load from the snapshot in the blob, and "replay" the saved ops in the blob by processing them one by one.
applyStashedOp() will be called for each stashed op after the op whose sequence number matches the stashed op's reference sequence number is processed (i.e., when the document is in the same state as when the op was originally made).

When the container connects to the delta stream and starts processing new ops, they are matched to stashed ops by client ID, so the container will not submit stashed ops that were originally successfully submitted.
When it processes its own join op (i.e., reaches "connected" state), the container will have seen any previously successful stashed ops, and it is safe to resubmit any remaining stashed ops.

### applyStashedOp()

When an op is created, it is given a "reference sequence number," which is the sequence number of the last op processed by the container.
For various reasons, the server will only sequence ops if they are within the "collab window," limited by the "minimum sequence number" of the document.
For this reason, if an op is not successfully submitted while its reference sequence number is within this window, runtime will call SharedObject.reSubmit() to ask the DDS to merge it with later remote changes and resubmit the change.
Once the op is sequenced by the server, runtime will pass it to SharedObject.process().

The job of applyStashedOp() is to return a new DDS in a new container to the same state, so that the DDS is able to handle calls to reSubmit() or process() with the op, even though the DDS itself did not submit it.
Once stashed ops are passed to applyStashedOp(), they are handled by runtime the same as any other pending ops.
