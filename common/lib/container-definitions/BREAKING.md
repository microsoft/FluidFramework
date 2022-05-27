## 0.48 Upcoming changes
- [IProxyLoader interface to be removed](#IProxyLoader-interface-to-be-removed)

### IProxyLoader interface to be removed
The `IProxyLoader` interface has been deprecated in 0.48 and will be removed in an upcoming release.

## 0.49.1000 Breaking changes
- [IContainer.connectionState yields finer-grained ConnectionState values](#icontainerconnectionstate-yields-finer-grained-connectionstate-values)

### IContainer.connectionState yields finer-grained ConnectionState values
The `ConnectionState` types have been updated to include a new state which previously was
encompassed by the `Disconnected` state. The new state is `EstablishingConnection` and indicates that the container is
attempting to connect to the ordering service, but is not yet connected.

Any logic based on the `Disconnected` state (e.g. checking the value of `IContainer.connectionState`)
should be updated depending on how you want to treat this new `EstablishingConnection` state.

Additionally, please note that the `Connecting` state is being renamed to `CatchingUp`.
`ConnectionState.Connecting` is marked as deprecated, please use `ConnectionState.CatchingUp` instead.
`ConnectionState.Connecting` will be removed in the following major release.

## 0.45 Breaking changes
- [ContainerErrorType.clientSessionExpiredError added](#ContainerErrorType.clientSessionExpiredError-added)

### ContainerErrorType.clientSessionExpiredError added
We have session expiry for GC purposes. Once the session has expired, we want to throw this new clientSessionExpiredError to clear out any stale in-memory data that may still be on the container.

## 0.40 Breaking changes

- [IErrorBase.sequenceNumber removed](#IErrorBase.sequenceNumber-removed)
- [IContainerContext.logger deprecated](#IContainerContext.logger-deprecated)

### IErrorBase.sequenceNumber removed
This field was used for logging and this was probably not the right abstraction for it to live in.
But practically speaking, the only places it was set have been updated to log not just sequenceNumber
but a large number of useful properties off the offending message, via `CreateProcessingError`.

### IContainerContext.logger deprecated
Use `IContainerContext.taggedLogger` instead if present. If it's missing and you must use `logger`,
be sure to handle tagged data before sending events to it.
`logger` won't be removed for a very long time since old loaders could remain in production for quite some time.
