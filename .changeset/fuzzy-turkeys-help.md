---
"@fluidframework/container-loader": minor
"@fluidframework/driver-base": minor
"@fluidframework/driver-definitions": minor
"__section": breaking
---
The reason parameter on the disconnect event is now optional to allow for clean, non-error disconnections.

To enable better handling of intentional disconnects (for example [`Container.dispose()`](https://fluidframework.com/docs/api/container-loader/container/dispose)), the `reason` parameter of the `disconnect` event on [`IDocumentDeltaConnectionEvents`](https://fluidframework.com/docs/api/driver-definitions/idocumentdeltaconnectionevents) is being deprecated as a required parameter.

In a future release, the `reason` parameter will become optional.

**Old signature:**
```typescript
listener: (reason: IAnyDriverError) => void
```

**New signature:**
```typescript
listener: (reason?: IAnyDriverError) => void
```

Developers with listeners for the `disconnect` event should update their implementations to handle cases where the `reason` parameter is `undefined`.
This indicates a clean disconnect, which should not be treated as an error.

The breaking change is scheduled to be released in version **2.60**.
