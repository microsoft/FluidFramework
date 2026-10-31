---
"@fluidframework/container-loader": minor
"__section": legacy
---
On-demand summaries can return an acknowledged snapshot version

The new `loadSummarizerContainerAndMakeAcknowledgedSummary` function creates a summary and waits for service acknowledgement.
It returns an `AcknowledgedSummary` with required `version` and `referenceSequenceNumber` fields, and rejects on error.
Use `version` with `LoaderHeader.version` to load the acknowledged snapshot.
The reference sequence number comes from the matching summary proposal and identifies the document state captured by the summary.

```typescript
import { LoaderHeader } from "@fluidframework/container-definitions/legacy";
import {
	loadExistingContainer,
	loadSummarizerContainerAndMakeAcknowledgedSummary,
} from "@fluidframework/container-loader/legacy";

// props supplies the loader services and request.
const { version, referenceSequenceNumber } =
	await loadSummarizerContainerAndMakeAcknowledgedSummary(props);
const container = await loadExistingContainer({
	...props,
	request: {
		...props.request,
		headers: { ...props.request.headers, [LoaderHeader.version]: version },
	},
});
// Use container, then dispose it when finished.
```

The new function rejects if summarization cannot recover from NACK, timeout, or premature container termination.
The runtime handles summary-stage retries.
The loader retries a failed attempt once with a new container, including when snapshot refresh disposes the first summarizer during catch-up.
Both returned values identify the successful attempt.
The summarizer container is disposed before the promise settles.

The existing `loadSummarizerContainerAndMakeSummary` retains its result shape and completion semantics.
Its `summaryResults.summaryInfo.handle` remains the broadcast proposal handle, which can differ from the acknowledged snapshot version.
