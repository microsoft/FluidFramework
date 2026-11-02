---
"@fluidframework/container-loader": minor
"__section": legacy
---
On-demand summaries can return an acknowledged snapshot version

`loadAndSummarize` creates a summary and waits for service acknowledgement.
It returns an `AcknowledgedSummary` with required `version` and `referenceSequenceNumber` fields, and rejects on error.
Use `version` with `LoaderHeader.version` to load the acknowledged snapshot.
The reference sequence number comes from the matching summary proposal and identifies the document state captured by the summary.

```typescript
import { LoaderHeader } from "@fluidframework/container-definitions/legacy";
import {
	loadExistingContainer,
	loadAndSummarize,
} from "@fluidframework/container-loader/legacy";

// props supplies the loader services and request.
const { version, referenceSequenceNumber } =
	await loadAndSummarize(props);
const container = await loadExistingContainer({
	...props,
	request: {
		...props.request,
		headers: { ...props.request.headers, [LoaderHeader.version]: version },
	},
});
// Use container, then dispose it when finished.
```

`loadAndSummarize` rejects if summarization cannot recover from NACK, timeout, or premature container termination.
The runtime handles summary-stage retries.
The loader retries every failed attempt once with a fresh container, regardless of error retryability.
A fresh load can succeed if a transient condition has resolved, but recovery is not guaranteed.
Both returned values identify the successful attempt.
The summarizer container is disposed before the promise settles.

`loadSummarizerContainerAndMakeSummary` returns `summaryResults.summaryInfo.handle`, which identifies the broadcast summary proposal.
It is not guaranteed to identify an acknowledged snapshot that can be loaded with `LoaderHeader.version`.
Use the `version` returned by `loadAndSummarize` when an acknowledged snapshot version is required.
