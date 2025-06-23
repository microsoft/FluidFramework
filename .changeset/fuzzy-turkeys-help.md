---
"@fluidframework/container-loader": minor
"@fluidframework/driver-base": minor
"@fluidframework/driver-definitions": minor
"@fluidframework/file-driver": minor
"@fluidframework/fluid-static": minor
"@fluidframework/local-driver": minor
"@fluidframework/odsp-driver": minor
"@fluidframework/replay-driver": minor
"@fluidframework/routerlicious-driver": minor
"__section": breaking
---
The reason parameter on the disconnect event now accepts undefined to allow for clean, non-error disconnections.


In a future release, the `reason` parameter will also accept `undefined`.

To enable better handling of intentional disconnects (for example [`Container.dispose()`](https://fluidframework.com/docs/api/container-loader/container/dispose)), the `reason` parameter of the `disconnect` event on [`IDocumentDeltaConnectionEvents`](https://fluidframework.com/docs/api/driver-definitions/idocumentdeltaconnectionevents) now accepts `undefined` as a valid value.
**Old signature:**
```typescript
listener: (reason: IAnyDriverError) => void
```

**New signature:**
```typescript
listener: (reason: IAnyDriverError | undefined) => void
```

Developers with listeners for the `disconnect` event should update their implementations to handle cases where the `reason` parameter is `undefined`.
This indicates a clean disconnect, which should not be treated as an error.

The breaking change is scheduled to be released in version **2.60**.
