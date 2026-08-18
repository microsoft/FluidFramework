---
"@fluidframework/container-loader": minor
"__section": feature
---

Add reference-only capture for reusable container baselines

`captureFullContainerState` now accepts a `blobCaptureMode` option. The default `"inline"` mode remains self-contained, while `"reference"` omits structural and attachment blob payloads so repeated online loads can fetch them from live storage.

```typescript
const baseline = await captureFullContainerState({
	urlResolver,
	documentServiceFactory,
	request,
	blobCaptureMode: "reference",
});

const container = await loadExistingContainer({
	...loaderProps,
	request,
	pendingLocalState: baseline,
});
```
