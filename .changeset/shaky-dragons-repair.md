---
"@fluidframework/core-interfaces": minor
"@fluidframework/container-runtime": minor
"__section": feature
---
Start sharing local handle payloads before attachment

Locally created Fluid handles can now expose an optional `sharePayload()` method that starts
sharing their payload without attaching the handle to the Fluid object graph. Blob handles
implement this method, allowing applications to begin uploading a blob before serializing its
handle into a DDS.

```typescript
const handle = await runtime.uploadBlob(bytes);

if (isLocalFluidHandle(handle) && handle.sharePayload !== undefined) {
	handle.sharePayload();
}
```
