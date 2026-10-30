---
"@fluidframework/container-loader": minor
"__section": legacy
---
Container state capture is available on the legacy beta API surface

You can now import `captureFullContainerState` and `ICaptureFullContainerStateProps` from `@fluidframework/container-loader/legacy`.
These APIs capture container state using driver services without loading a runtime.
Their behavior is unchanged, and they remain available from the legacy alpha entrypoint.

```typescript
import {
	captureFullContainerState,
	type ICaptureFullContainerStateProps,
} from "@fluidframework/container-loader/legacy";

// ...
const options: ICaptureFullContainerStateProps = {
	urlResolver,
	documentServiceFactory,
	request,
};
const pendingLocalState = await captureFullContainerState(options);
```
