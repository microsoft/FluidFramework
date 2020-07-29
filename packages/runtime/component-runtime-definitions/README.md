# @fluidframework/component-runtime-definitions

Interface `IComponentRuntime` specifies the component developer API.

## Capabilities exposed on `IComponentRuntime`

_TODO: The full set of functionality is under review_

- DDS creation and management APIs
- Container info and states (connection state, documentId, quorum, audience, etc.)
- Loader
- Op/Signal submission
- Snapshotting
- DeltaManager
- Blob Management API.

### Crash course on Signals

Signals provide a transient data channel for data (any serializable payload)
that doesn't need to be persisted in the op stream.
Use signals where possible to avoid storing unnecessary ops, e.g. to transmit presence status during a collaborative session.

Signals are not persisted, ordered, or guaranteed. So if a client is behind, the op state can be behind the signal state.
For this reason people usually stick the currentSeq on the signal, so others can wait to process if they are behind.

You can send a signal via the container, or component runtime. The container will emit the signal event on all signals,
but a component will emit the signal event only on signals emitted on that component runtime.
