## 0.48 Upcoming changes
- [IProxyLoader interface to be removed](#IProxyLoader-interface-to-be-removed)

### IProxyLoader interface to be removed
The `IProxyLoader` interface has been deprecated in 0.48 and will be removed in an upcoming release.

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
